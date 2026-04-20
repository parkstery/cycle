import type { IndoorSensorPrefs } from './sensorPrefs';
import { loadHintMultiplier } from './sensorPrefs';

/**
 * Maps a completed 1-minute max-effort average cadence (RPM) to a suggested **base** speed (slider, km/h).
 * Used so calibration is not only stored but also drives the default simulation scale for indoor rides.
 * Tunable linear map, clamped to app speed limits.
 */
export function suggestedBaseSpeedFromCalibrationRpm(rpm: number | null | undefined): number | null {
  if (rpm == null || !Number.isFinite(rpm) || rpm < 40) return null;
  const v = Math.round(14 + rpm * 0.24);
  return Math.min(70, Math.max(18, v));
}

/** effort 0..~1.2 before clamping for display */
export function effortFromCadenceRpm(smoothedRpm: number, calibrationAvgRpm: number | null): number {
  const anchor = Math.max(calibrationAvgRpm ?? 90, 45);
  return Math.min(1.25, Math.max(0, smoothedRpm / anchor));
}

/** Optional FTMS power path — threshold from calibration (W ≈ linear from cadence anchor) */
export function effortFromPowerWatts(watts: number, calibrationAvgRpm: number | null): number {
  const thr = Math.max((calibrationAvgRpm ?? 90) * 2.2, 80);
  return Math.min(1.25, Math.max(0, watts / thr));
}

/**
 * Maps normalized effort to a multiplier applied to base (slider) speed.
 * Low effort still moves a little (indoor coast / light spin).
 */
export function speedMultiplierFromEffort(effort: number): number {
  const e = Math.min(1, Math.max(0, effort));
  return 0.12 + 0.88 * Math.pow(e, 0.52);
}

export function displaySpeedFromBaseAndEffort(
  baseSpeedKmh: number,
  effort: number,
  prefs: Pick<IndoorSensorPrefs, 'loadHint'>
): number {
  const m = speedMultiplierFromEffort(effort) * loadHintMultiplier(prefs.loadHint);
  const v = baseSpeedKmh * m;
  return Math.min(70, Math.max(10, v));
}
