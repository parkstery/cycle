import type { FitnessLevel } from './sensorPrefs';

/** Base ride speed (km/h) from user fitness — not the manual route slider when sensor-driven. */
const BASE_SPEED_KMH: Record<FitnessLevel, number> = {
  frail: 12,
  normal: 16,
  active: 20,
  high: 24,
};

export function baseSpeedFromFitnessLevel(level: FitnessLevel): number {
  return BASE_SPEED_KMH[level] ?? BASE_SPEED_KMH.normal;
}

/** Conservative capacity from 1-minute average RPM (max effort). */
export function initialCapacityFromTestRpm(testAvgRpm: number): number {
  return Math.max(35, testAvgRpm / 0.9);
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
