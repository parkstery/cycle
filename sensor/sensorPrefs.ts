export type FitnessLevel = 'frail' | 'normal' | 'active' | 'high';
export type SpeedCadenceBlendMode = 'auto' | 'speed' | 'cadence';
export type RideMode = 'manual' | 'sensor';

export interface IndoorSensorPrefs {
  sensorDriveEnabled: boolean;
  preferredRideMode: RideMode;
  /** User fitness type → base simulation speed when sensor-driven (not the route slider). */
  fitnessLevel: FitnessLevel;
  calibrationAvgRpm: number | null;
  calibrationAt: number | null;
  /** Personal cadence capacity (EWMA); initialized from 1-min test as test_rpm / 0.9 */
  capacityRpm: number | null;
  speedCadenceBlendMode: SpeedCadenceBlendMode;
  /** Measured wheel RPM ÷ cadence when both channels were valid */
  wheelCadenceK: number | null;
}

const STORAGE_KEY = 'indoor_sensor_prefs_v1';

export const DEFAULT_INDOOR_SENSOR_PREFS: IndoorSensorPrefs = {
  sensorDriveEnabled: false,
  preferredRideMode: 'manual',
  fitnessLevel: 'normal',
  calibrationAvgRpm: null,
  calibrationAt: null,
  capacityRpm: null,
  speedCadenceBlendMode: 'auto',
  wheelCadenceK: null,
};

export function loadIndoorSensorPrefs(): IndoorSensorPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_INDOOR_SENSOR_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INDOOR_SENSOR_PREFS };
    const o = JSON.parse(raw) as Partial<IndoorSensorPrefs> & { loadHint?: string };
    let fitnessLevel: FitnessLevel = 'normal';
    if (o.fitnessLevel === 'frail' || o.fitnessLevel === 'normal' || o.fitnessLevel === 'active' || o.fitnessLevel === 'high') {
      fitnessLevel = o.fitnessLevel;
    } else if (o.loadHint === 'light') {
      fitnessLevel = 'frail';
    } else if (o.loadHint === 'heavy') {
      fitnessLevel = 'active';
    }

    const calibrationAvgRpm =
      typeof o.calibrationAvgRpm === 'number' && o.calibrationAvgRpm > 0 ? o.calibrationAvgRpm : null;
    let capacityRpm = typeof o.capacityRpm === 'number' && o.capacityRpm > 30 ? o.capacityRpm : null;
    if (capacityRpm == null && calibrationAvgRpm != null) {
      capacityRpm = calibrationAvgRpm / 0.9;
    }

    return {
      ...DEFAULT_INDOOR_SENSOR_PREFS,
      ...o,
      sensorDriveEnabled: o.preferredRideMode === 'sensor' ? true : o.preferredRideMode === 'manual' ? false : o.sensorDriveEnabled === true,
      preferredRideMode: o.preferredRideMode === 'sensor' ? 'sensor' : 'manual',
      fitnessLevel,
      speedCadenceBlendMode:
        o.speedCadenceBlendMode === 'speed' || o.speedCadenceBlendMode === 'cadence'
          ? o.speedCadenceBlendMode
          : 'auto',
      calibrationAvgRpm,
      calibrationAt: typeof o.calibrationAt === 'number' ? o.calibrationAt : null,
      capacityRpm,
      wheelCadenceK: typeof o.wheelCadenceK === 'number' && o.wheelCadenceK > 0 ? o.wheelCadenceK : null,
    };
  } catch {
    return { ...DEFAULT_INDOOR_SENSOR_PREFS };
  }
}

export function saveIndoorSensorPrefs(prefs: IndoorSensorPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}
