export type FitnessLevel = 'frail' | 'normal' | 'active' | 'high';
export type SpeedCadenceBlendMode = 'auto' | 'speed' | 'cadence';
export type RideMode = 'manual' | 'sensor';
export type BikeProfile =
  | 'unset'      // First launch / first dual-sensor connection: ask user once
  | 'road700c'
  | 'mtb29'
  | 'mtb275'
  | 'mtb26'
  | 'spinbike'
  | 'custom';

/** Default wheel circumference (mm) for each bike profile preset. */
export const BIKE_PROFILE_CIRCUMFERENCE_MM: Record<Exclude<BikeProfile, 'custom'>, number> = {
  unset: 2100,
  road700c: 2105,
  mtb29: 2300,
  mtb275: 2148,
  mtb26: 2070,
  spinbike: 2100,
};

export interface SavedSensorDevice {
  deviceId: string;
  name: string;
}

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
  /** Up to 2 most recently connected sensors; used for silent auto-reconnect on app launch. */
  lastConnectedDevices: SavedSensorDevice[];
  /** When true, the app will attempt silent reconnect to lastConnectedDevices on launch. */
  autoReconnectEnabled: boolean;
  /** Bike preset. 'unset' triggers a one-time "which bike?" prompt when a speed sensor is first detected. */
  bikeProfile: BikeProfile;
  /** Wheel circumference in mm, derived from bikeProfile unless user picked 'custom'. */
  wheelCircumferenceMm: number;
}

const MAX_SAVED_DEVICES = 2;

function parseSavedDevices(value: unknown): SavedSensorDevice[] {
  if (!Array.isArray(value)) return [];
  const out: SavedSensorDevice[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { deviceId?: unknown; name?: unknown };
    if (typeof rec.deviceId !== 'string' || !rec.deviceId) continue;
    const name = typeof rec.name === 'string' && rec.name ? rec.name : 'Sensor';
    if (out.some((d) => d.deviceId === rec.deviceId)) continue;
    out.push({ deviceId: rec.deviceId, name });
    if (out.length >= MAX_SAVED_DEVICES) break;
  }
  return out;
}

export function upsertSavedDevice(
  list: SavedSensorDevice[],
  device: SavedSensorDevice
): SavedSensorDevice[] {
  const filtered = list.filter((d) => d.deviceId !== device.deviceId);
  return [device, ...filtered].slice(0, MAX_SAVED_DEVICES);
}

export function removeSavedDevice(list: SavedSensorDevice[], deviceId: string): SavedSensorDevice[] {
  return list.filter((d) => d.deviceId !== deviceId);
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
  lastConnectedDevices: [],
  autoReconnectEnabled: true,
  bikeProfile: 'unset',
  wheelCircumferenceMm: BIKE_PROFILE_CIRCUMFERENCE_MM.unset,
};

function isBikeProfile(v: unknown): v is BikeProfile {
  return (
    v === 'unset' ||
    v === 'road700c' ||
    v === 'mtb29' ||
    v === 'mtb275' ||
    v === 'mtb26' ||
    v === 'spinbike' ||
    v === 'custom'
  );
}

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

    let preferredRideMode: RideMode = DEFAULT_INDOOR_SENSOR_PREFS.preferredRideMode;
    if (o.preferredRideMode === 'sensor' || o.preferredRideMode === 'manual') {
      preferredRideMode = o.preferredRideMode;
    } else if (o.sensorDriveEnabled === true) {
      preferredRideMode = 'sensor';
    }

    const sensorDriveEnabled =
      typeof o.sensorDriveEnabled === 'boolean' ? o.sensorDriveEnabled : preferredRideMode === 'sensor';

    return {
      ...DEFAULT_INDOOR_SENSOR_PREFS,
      ...o,
      sensorDriveEnabled,
      preferredRideMode,
      fitnessLevel,
      speedCadenceBlendMode:
        o.speedCadenceBlendMode === 'speed' || o.speedCadenceBlendMode === 'cadence'
          ? o.speedCadenceBlendMode
          : 'auto',
      calibrationAvgRpm,
      calibrationAt: typeof o.calibrationAt === 'number' ? o.calibrationAt : null,
      capacityRpm,
      wheelCadenceK: typeof o.wheelCadenceK === 'number' && o.wheelCadenceK > 0 ? o.wheelCadenceK : null,
      lastConnectedDevices: parseSavedDevices((o as { lastConnectedDevices?: unknown }).lastConnectedDevices),
      autoReconnectEnabled:
        typeof o.autoReconnectEnabled === 'boolean' ? o.autoReconnectEnabled : DEFAULT_INDOOR_SENSOR_PREFS.autoReconnectEnabled,
      bikeProfile: isBikeProfile(o.bikeProfile) ? o.bikeProfile : 'unset',
      wheelCircumferenceMm:
        typeof o.wheelCircumferenceMm === 'number' &&
        o.wheelCircumferenceMm >= 1500 &&
        o.wheelCircumferenceMm <= 2500
          ? o.wheelCircumferenceMm
          : BIKE_PROFILE_CIRCUMFERENCE_MM.unset,
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
