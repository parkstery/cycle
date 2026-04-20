import type { IndoorSensorPrefs } from './sensorPrefs';
import { effortFromCadenceRpm, effortFromPowerWatts, displaySpeedFromBaseAndEffort } from './effortModel';

const SPEED_STALE_MS = 2500;
const CADENCE_STALE_MS = 2500;
const POWER_STALE_MS = 2500;
const MIN_CADENCE_VALID = 6;

export type BleSnapshot = {
  now: number;
  cadenceRpm: number | null;
  cadenceTs: number;
  wheelRpm: number | null;
  wheelTs: number;
  powerW: number | null;
  powerTs: number;
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

function powerChannelValid(s: BleSnapshot): boolean {
  if (s.powerW == null || s.powerW <= 0) return false;
  return s.now - s.powerTs < POWER_STALE_MS;
}

export type DualMergeState = {
  lastEffort: number;
  lastWheelRpm: number | null;
  lastCadenceRpm: number | null;
};

export function createDualMergeState(): DualMergeState {
  return { lastEffort: 0, lastWheelRpm: null, lastCadenceRpm: null };
}

function effortFromWheelRpm(wheelRpm: number, prefs: IndoorSensorPrefs): number {
  return effortFromCadenceRpm(wheelRpm, prefs.calibrationAvgRpm);
}

/**
 * Dual rule: Auto / Speed → wheel RPM when fresh; else cadence (or cadence×k as wheel proxy); Cadence → cadence first.
 */
export function mergeDualEffort(
  s: BleSnapshot,
  prefs: IndoorSensorPrefs,
  st: DualMergeState
): number {
  const mode = prefs.speedCadenceBlendMode;
  const k = prefs.wheelCadenceK;

  const sv = speedChannelValid(s);
  const cv = cadenceChannelValid(s);
  const pv = powerChannelValid(s);

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

  let effort = st.lastEffort;
  const cadScaled = cadRpm * cadBoost;

  const wheelProxyFromCadence = k != null && k > 0 && cadScaled > 0 ? cadScaled * k : null;

  if (mode === 'cadence') {
    if (cv) {
      effort = effortFromCadenceRpm(cadScaled, prefs.calibrationAvgRpm);
    } else if (sv) {
      effort = effortFromWheelRpm(wheelRpm, prefs);
    } else if (wheelProxyFromCadence != null) {
      effort = effortFromWheelRpm(wheelProxyFromCadence, prefs);
    } else if (pv) {
      effort = effortFromPowerWatts(s.powerW!, prefs.calibrationAvgRpm);
    } else {
      effort = Math.max(0, st.lastEffort * 0.92);
    }
  } else {
    // auto or speed priority: same ordering
    if (sv) {
      effort = effortFromWheelRpm(wheelRpm, prefs);
    } else if (cv) {
      effort = effortFromCadenceRpm(cadScaled, prefs.calibrationAvgRpm);
    } else if (wheelProxyFromCadence != null) {
      effort = effortFromWheelRpm(wheelProxyFromCadence, prefs);
    } else if (pv) {
      effort = effortFromPowerWatts(s.powerW!, prefs.calibrationAvgRpm);
    } else {
      effort = Math.max(0, st.lastEffort * 0.92);
    }
  }

  st.lastEffort = effort;
  st.lastWheelRpm = s.wheelRpm;
  st.lastCadenceRpm = s.cadenceRpm;

  return effort;
}

export function snapshotDisplaySpeed(
  baseSpeedKmh: number,
  s: BleSnapshot,
  prefs: IndoorSensorPrefs,
  st: DualMergeState
): number {
  const eff = mergeDualEffort(s, prefs, st);
  return displaySpeedFromBaseAndEffort(baseSpeedKmh, eff, prefs);
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
