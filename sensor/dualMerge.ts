import type { IndoorSensorPrefs } from './sensorPrefs';

const SPEED_STALE_MS = 2500;
const CADENCE_STALE_MS = 2500;
const MIN_CADENCE_VALID = 6;

export type BleSnapshot = {
  now: number;
  cadenceRpm: number | null;
  cadenceTs: number;
  wheelRpm: number | null;
  wheelTs: number;
  powerW: number | null;
  powerTs: number;
  /** FTMS Indoor Bike Data instantaneous speed (km/h). Null when absent or out of range. */
  trainerSpeedKmh: number | null;
  trainerSpeedTs: number;
};

export function speedChannelValid(s: BleSnapshot): boolean {
  if (s.wheelRpm == null || s.wheelRpm <= 0) return false;
  return s.now - s.wheelTs < SPEED_STALE_MS;
}

export function cadenceChannelValid(s: BleSnapshot): boolean {
  if (s.cadenceRpm == null) return false;
  if (s.cadenceRpm < MIN_CADENCE_VALID) return false;
  return s.now - s.cadenceTs < CADENCE_STALE_MS;
}

export type DualMergeState = {
  lastWheelRpm: number | null;
  lastCadenceRpm: number | null;
};

export function createDualMergeState(): DualMergeState {
  return { lastWheelRpm: null, lastCadenceRpm: null };
}

/**
 * Picks a single RPM stream for intensity (same ordering / softening as former dual merge).
 * Does not use power to synthesize RPM (returns null → coast in speed formula).
 */
export function pickRpmForIntensity(s: BleSnapshot, prefs: IndoorSensorPrefs, st: DualMergeState): number | null {
  const mode = prefs.speedCadenceBlendMode;

  const sv = speedChannelValid(s);
  const cv = cadenceChannelValid(s);

  let wheelRpm = s.wheelRpm ?? 0;
  const cadRpm = s.cadenceRpm ?? 0;

  if (sv && st.lastWheelRpm != null && st.lastCadenceRpm != null && cadRpm > 0) {
    const drop = st.lastWheelRpm > 0 ? (st.lastWheelRpm - wheelRpm) / st.lastWheelRpm : 0;
    const cadStable = Math.abs(cadRpm - st.lastCadenceRpm) / Math.max(st.lastCadenceRpm, 1) < 0.18;
    if (drop > 0.35 && cadStable && wheelRpm < st.lastWheelRpm) {
      wheelRpm = st.lastWheelRpm * 0.65 + wheelRpm * 0.35;
    }
  }

  let cadBoost = 1;
  if (st.lastCadenceRpm != null && cadRpm > st.lastCadenceRpm * 1.35 && cadRpm - st.lastCadenceRpm > 15) {
    cadBoost = 1.08;
  }

  const cadScaled = cadRpm * cadBoost;
  let pick: number | null = null;

  if (mode === 'cadence') {
    if (cv) pick = cadScaled;
    else if (sv) pick = wheelRpm;
  } else {
    // Auto mode defaults to cadence-first for indoor bikes where wheel channel can be absent/noisy.
    if (cv) pick = cadScaled;
    else if (sv) pick = wheelRpm;
  }

  st.lastWheelRpm = s.wheelRpm;
  st.lastCadenceRpm = s.cadenceRpm;

  return pick != null && pick > 0 ? pick : null;
}

export function maybeUpdateWheelCadenceK(
  s: BleSnapshot,
  prefs: IndoorSensorPrefs,
  onNewK: (k: number) => void
): void {
  if (!speedChannelValid(s) || !cadenceChannelValid(s)) return;
  const w = s.wheelRpm!;
  const c = s.cadenceRpm!;
  if (c < 20 || w < 20) return;
  const inst = w / c;
  const prev = prefs.wheelCadenceK;
  const next = prev == null ? inst : prev * 0.97 + inst * 0.03;
  if (prev == null || Math.abs(next - prev) > 0.002) onNewK(next);
}
