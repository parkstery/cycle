export type LoadHint = 'light' | 'normal' | 'heavy';
export type SpeedCadenceBlendMode = 'auto' | 'speed' | 'cadence';

export interface IndoorSensorPrefs {
  sensorDriveEnabled: boolean;
  loadHint: LoadHint;
  calibrationAvgRpm: number | null;
  calibrationAt: number | null;
  /**
   * After we sync the route base speed (slider) from `calibrationAvgRpm` once (migration or new test),
   * set true so we do not overwrite the user's manual speed on every launch.
   */
  calibrationBaseAnchorApplied: boolean;
  speedCadenceBlendMode: SpeedCadenceBlendMode;
  /** Measured wheel RPM ÷ cadence when both channels were valid */
  wheelCadenceK: number | null;
}

const STORAGE_KEY = 'indoor_sensor_prefs_v1';

export const DEFAULT_INDOOR_SENSOR_PREFS: IndoorSensorPrefs = {
  sensorDriveEnabled: false,
  loadHint: 'normal',
  calibrationAvgRpm: null,
  calibrationAt: null,
  calibrationBaseAnchorApplied: false,
  speedCadenceBlendMode: 'auto',
  wheelCadenceK: null,
};

const LOAD_HINT_MULT: Record<LoadHint, number> = {
  light: 0.92,
  normal: 1,
  heavy: 1.08,
};

export function loadHintMultiplier(hint: LoadHint): number {
  return LOAD_HINT_MULT[hint] ?? 1;
}

export function loadIndoorSensorPrefs(): IndoorSensorPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_INDOOR_SENSOR_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INDOOR_SENSOR_PREFS };
    const o = JSON.parse(raw) as Partial<IndoorSensorPrefs>;
    return {
      ...DEFAULT_INDOOR_SENSOR_PREFS,
      ...o,
      loadHint: o.loadHint === 'light' || o.loadHint === 'heavy' ? o.loadHint : 'normal',
      speedCadenceBlendMode:
        o.speedCadenceBlendMode === 'speed' || o.speedCadenceBlendMode === 'cadence'
          ? o.speedCadenceBlendMode
          : 'auto',
      calibrationAvgRpm: typeof o.calibrationAvgRpm === 'number' && o.calibrationAvgRpm > 0 ? o.calibrationAvgRpm : null,
      calibrationAt: typeof o.calibrationAt === 'number' ? o.calibrationAt : null,
      calibrationBaseAnchorApplied: o.calibrationBaseAnchorApplied === true,
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
