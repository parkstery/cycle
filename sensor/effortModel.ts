import type { FitnessLevel, IndoorSensorPrefs } from './sensorPrefs';
import type { BleSnapshot } from './dualMerge';

/** Base ride speed (km/h) from user fitness — not the manual route slider when sensor-driven. */
const BASE_SPEED_KMH: Record<FitnessLevel, number> = {
  veryLow: 11,
  low: 14,
  medium: 17,
  high: 20,
  veryHigh: 23,
};

export function baseSpeedFromFitnessLevel(level: FitnessLevel): number {
  return BASE_SPEED_KMH[level] ?? BASE_SPEED_KMH.medium;
}

/** Conservative capacity from 1-minute average RPM (max effort). */
export function initialCapacityFromTestRpm(testAvgRpm: number): number {
  return Math.max(35, testAvgRpm / 0.9);
}

/** Fitness 레벨별 기본 capacity(RPM) 프리셋 — `capacityRpm === null`일 때만 사용 */
const CAPACITY_PRESET_RPM: Record<FitnessLevel, number> = {
  veryLow: 60,
  low: 70,
  medium: 80,
  high: 90,
  veryHigh: 100,
};
export function presetCapacityRpm(level: FitnessLevel): number {
  return CAPACITY_PRESET_RPM[level] ?? CAPACITY_PRESET_RPM.medium;
}

/**
 * Linear intensity curve.
 * x = current_rpm / capacity (intensity).
 */
export function fIntensity(intensity: number): number {
  // Expand the high-intensity headroom so users do not hit an early ceiling (e.g. ~26.6 km/h).
  const x = Math.min(2.4, Math.max(0, intensity));
  return 0.55 + 0.95 * x;
}

/**
 * Live sensor-driven speed: base from fitness, scale from intensity vs personal capacity.
 * @param smoothedRpm EMA-smoothed cadence (or wheel proxy) from the BLE layer
 * @param capacityRpm running capacity (includes micro EWMA updates)
 */
export function computeIndoorSensorRideSpeedKmh(
  fitnessLevel: FitnessLevel,
  smoothedRpm: number | null,
  capacityRpm: number
): number {
  const base = baseSpeedFromFitnessLevel(fitnessLevel);
  const cap = Math.max(35, capacityRpm);

  if (smoothedRpm == null || smoothedRpm <= 0) {
    return 0;
  }

  const intensity = smoothedRpm / cap;
  let speed = base * fIntensity(intensity);
  if (smoothedRpm < 15) {
    speed *= 0.35;
  } else if (smoothedRpm < 30) {
    speed *= 0.6;
  } else {
    // Keep floor response while pedaling so speed does not collapse unexpectedly.
    speed = Math.max(speed, base * 0.65);
  }
  return Math.min(70, Math.max(0, speed));
}

// ===========================================================================
// Layered speed candidates & selector
// Architecture: sensor inputs → speed candidates → outlier filter → selector
//   Speed is determined by wheel/trainer; cadence is used only as an
//   intensity proxy and sanity check (via wheelCadenceK).
// ===========================================================================

/** 1st priority: trainer firmware's own instantaneous speed (FTMS). */
export function vFromTrainer(trainerSpeedKmh: number): number {
  if (!Number.isFinite(trainerSpeedKmh)) return 0;
  return Math.max(0, Math.min(80, trainerSpeedKmh));
}

/** 2nd priority: geometric speed from wheel RPM × circumference. */
export function vFromWheel(wheelRpm: number, wheelCircumferenceMm: number): number {
  if (!Number.isFinite(wheelRpm) || wheelRpm <= 0) return 0;
  const kmh = (wheelRpm * wheelCircumferenceMm * 60) / 1_000_000;
  return Math.max(0, Math.min(80, kmh));
}

/** 3rd priority: cadence-derived "effort speed" (existing fitness model). */
export const vFromCadence = computeIndoorSensorRideSpeedKmh;

export type SpeedSource = 'trainer' | 'wheel' | 'cadence' | 'manual' | 'coast';

export type SpeedFilterState = {
  emaKmh: number | null;
  outlierStreak: number;
  /** Last timestamp (from snap.now) when the wheel channel was observed valid. */
  lastWheelSeenAt: number;
};

export function createSpeedFilterState(): SpeedFilterState {
  return { emaKmh: null, outlierStreak: 0, lastWheelSeenAt: 0 };
}

const SPEED_EMA_ALPHA = 0.25;
const WHEEL_WAKEUP_DROP_MS = 5000; // If wheel channel was silent > 5s, drop the first sample.
const K_DEVIATION_THRESHOLD = 0.5; // 50% deviation from learned wheel/cadence ratio.
const K_DEVIATION_STREAK_FOR_ACCEPT = 3; // 3 consecutive outliers → accept (genuine shift).

function withinSanity(kmh: number): boolean {
  return Number.isFinite(kmh) && kmh >= 0 && kmh <= 80;
}

/**
 * Apply outlier filter + EMA smoothing. Returns the smoothed speed.
 * For sources where the device already smooths (trainer firmware), pass
 * `skipSmoothing: true` — we still track EMA so source switches are seamless.
 */
function applySpeedFilter(
  raw: number,
  source: SpeedSource,
  ctx: {
    cadenceRpm: number | null;
    wheelRpm: number | null;
    wheelCadenceK: number | null;
  },
  st: SpeedFilterState
): number {
  if (!withinSanity(raw)) {
    return st.emaKmh ?? 0;
  }

  // K-consistency outlier detection (dual sensor only).
  if (
    source === 'wheel' &&
    ctx.wheelRpm != null &&
    ctx.wheelRpm > 0 &&
    ctx.cadenceRpm != null &&
    ctx.cadenceRpm > 10 &&
    ctx.wheelCadenceK != null &&
    ctx.wheelCadenceK > 0
  ) {
    const kInst = ctx.wheelRpm / ctx.cadenceRpm;
    const dev = Math.abs(kInst - ctx.wheelCadenceK) / ctx.wheelCadenceK;
    if (dev > K_DEVIATION_THRESHOLD) {
      if (st.outlierStreak < K_DEVIATION_STREAK_FOR_ACCEPT) {
        st.outlierStreak += 1;
        return st.emaKmh ?? raw;
      }
      // Sustained deviation → genuine gearing change; reset streak and accept.
      st.outlierStreak = 0;
    } else {
      st.outlierStreak = 0;
    }
  } else {
    st.outlierStreak = 0;
  }

  // Coasting attenuation: flywheel spinning but rider not pedaling.
  let v = raw;
  if (
    (source === 'wheel' || source === 'trainer') &&
    (ctx.cadenceRpm == null || ctx.cadenceRpm < 5) &&
    ctx.wheelRpm != null &&
    ctx.wheelRpm > 0
  ) {
    v = v * 0.6;
  }

  // EMA smoothing. Trainer-sourced values are pre-smoothed by the device, but
  // we still keep EMA to avoid jumps when source swaps (e.g. trainer → wheel).
  const a = source === 'trainer' ? 0.5 : SPEED_EMA_ALPHA;
  st.emaKmh = st.emaKmh == null ? v : st.emaKmh * (1 - a) + v * a;
  return st.emaKmh;
}

export type SpeedDecision = {
  source: SpeedSource;
  kmh: number;
  /** For UI/debug: the raw, pre-filter value that the selected source produced. */
  rawKmh: number;
};

/**
 * Grade 기반 속도 배율 — FTMS 스마트 트레이너 분기 전용으로 사용.
 * 케이던스/휠 타겟(저가·수동 저항)은 호출하지 않는다(이중 가감 방지).
 * cap은 보수적으로 ±30%.
 */
export function trainerGradeFactor(gradePercent: number): number {
  if (!Number.isFinite(gradePercent)) return 1;
  const g = Math.max(-15, Math.min(15, gradePercent));
  const f = 1 + 0.03 * g; // +1%경사당 +3% 가감
  return Math.max(0.7, Math.min(1.3, f));
}

/** Source selector. Implements advisor's priority: trainer > wheel > cadence. */
export function decideSpeed(
  snap: BleSnapshot,
  prefs: IndoorSensorPrefs,
  capacityRpm: number,
  st: SpeedFilterState,
  manualKmh: number,
  /** 현재 구간의 경사(%) — 스마트 트레이너 분기에서만 사용(선택). */
  gradePercent: number = 0
): SpeedDecision {
  const now = snap.now;
  const trainerValid =
    snap.trainerSpeedKmh != null && withinSanity(snap.trainerSpeedKmh) && now - snap.trainerSpeedTs < 3000;
  const wheelValid = snap.wheelRpm != null && snap.wheelRpm > 0 && now - snap.wheelTs < 3000;
  const cadValid = snap.cadenceRpm != null && snap.cadenceRpm >= 6 && now - snap.cadenceTs < 3000;

  // Wheel wake-up artifact guard: if wheel was silent > 5s, skip this sample
  // (timer wrap-around in CSC 1024Hz counter produces invalid first reading).
  let wheelUsable = wheelValid;
  if (wheelValid) {
    if (st.lastWheelSeenAt > 0 && now - st.lastWheelSeenAt > WHEEL_WAKEUP_DROP_MS) {
      wheelUsable = false;
    }
    st.lastWheelSeenAt = now;
  }

  if (!prefs.sensorDriveEnabled) {
    return { source: 'manual', kmh: manualKmh, rawKmh: manualKmh };
  }

  const ctx = {
    cadenceRpm: snap.cadenceRpm,
    wheelRpm: snap.wheelRpm,
    wheelCadenceK: prefs.wheelCadenceK,
  };

  const feelK = typeof prefs.feelK === 'number' && Number.isFinite(prefs.feelK)
    ? Math.max(0.7, Math.min(1.3, prefs.feelK))
    : 1;

  if (trainerValid) {
    const raw = vFromTrainer(snap.trainerSpeedKmh!);
    // 트레이너 전용: 경사 반영(수동 저항 타겟 브랜치에는 적용하지 않음 — 이중 가감 방지)
    const gradeK = trainerGradeFactor(gradePercent);
    const kmh = applySpeedFilter(raw, 'trainer', ctx, st) * feelK * gradeK;
    return { source: 'trainer', kmh, rawKmh: raw };
  }

  if (wheelUsable) {
    const raw = vFromWheel(snap.wheelRpm!, prefs.wheelCircumferenceMm);
    const kmh = applySpeedFilter(raw, 'wheel', ctx, st) * feelK;
    return { source: 'wheel', kmh, rawKmh: raw };
  }

  if (cadValid) {
    const raw = vFromCadence(prefs.fitnessLevel, snap.cadenceRpm!, capacityRpm);
    const kmh = applySpeedFilter(raw, 'cadence', ctx, st) * feelK;
    return { source: 'cadence', kmh, rawKmh: raw };
  }

  // No valid sensor signal → decay existing EMA toward 0 to avoid a snap-to-0.
  if (st.emaKmh != null) {
    st.emaKmh = st.emaKmh * 0.94;
    if (st.emaKmh < 0.5) st.emaKmh = 0;
  }
  return { source: 'coast', kmh: st.emaKmh ?? 0, rawKmh: 0 };
}
