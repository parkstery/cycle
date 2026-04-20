import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';
import type { BleSnapshot } from './dualMerge';

const CSC_SERVICE = numberToUUID(0x1816);
const CSC_MEASUREMENT = numberToUUID(0x2a5b);
const FTMS_SERVICE = numberToUUID(0x1826);
const INDOOR_BIKE_DATA = numberToUUID(0x2ad2);

const EMA_A = 0.38;
const NOTIFY_THROTTLE_MS = 125;
const MIN_CADENCE_VALID = 6;

type DeviceCrankState = { rev: number; t1024: number };
type DeviceWheelState = { rev: number; t1024: number };

type DeviceSmooth = {
  cadenceRpm: number | null;
  cadenceTs: number;
  wheelRpm: number | null;
  wheelTs: number;
  powerW: number | null;
  powerTs: number;
};

function ema(prev: number | null, next: number): number {
  if (prev == null || !Number.isFinite(prev)) return next;
  return prev * (1 - EMA_A) + next * EMA_A;
}

function parseIndoorBikeData(view: DataView): { cadence?: number; power?: number } {
  const out: { cadence?: number; power?: number } = {};
  if (view.byteLength < 2) return out;
  const flags = view.getUint16(0, true);
  let o = 2;
  if (flags & 0x02) {
    if (o + 2 > view.byteLength) return out;
    o += 2;
  }
  if (flags & 0x04) {
    if (o + 2 > view.byteLength) return out;
    const raw = view.getUint16(o, true);
    o += 2;
    out.cadence = raw / 2;
  }
  if (flags & 0x08) {
    if (o + 2 > view.byteLength) return out;
    o += 2;
  }
  if (flags & 0x10) {
    if (o + 3 > view.byteLength) return out;
    o += 3;
  }
  if (flags & 0x20) {
    if (o + 2 > view.byteLength) return out;
    o += 2;
  }
  if (flags & 0x40) {
    if (o + 2 > view.byteLength) return out;
    out.power = view.getInt16(o, true);
    o += 2;
  }
  return out;
}

function parseCscMeasurement(
  view: DataView,
  prevCrank: DeviceCrankState | null,
  prevWheel: DeviceWheelState | null
): { cadenceRpm?: number; wheelRpm?: number; nextCrank: DeviceCrankState | null; nextWheel: DeviceWheelState | null } {
  const flags = view.getUint8(0);
  let o = 1;
  let nextWheel: DeviceWheelState | null = prevWheel;
  let nextCrank: DeviceCrankState | null = prevCrank;
  let wheelRpm: number | undefined;
  let cadenceRpm: number | undefined;

  if (flags & 0x01) {
    if (o + 6 > view.byteLength) return { nextCrank, nextWheel };
    const rev = view.getUint32(o, true);
    const t = view.getUint16(o + 4, true);
    o += 6;
    nextWheel = { rev, t1024: t };
    if (prevWheel) {
      const dRev = (rev - prevWheel.rev + 0x100000000) % 0x100000000;
      const dt = (t - prevWheel.t1024 + 65536) % 65536;
      if (dt > 0 && dRev < 5000) {
        wheelRpm = (dRev * 60 * 1024) / dt;
      }
    }
  }
  if (flags & 0x02) {
    if (o + 4 > view.byteLength) return { wheelRpm, cadenceRpm, nextCrank, nextWheel };
    const rev = view.getUint16(o, true);
    const t = view.getUint16(o + 2, true);
    o += 4;
    nextCrank = { rev, t1024: t };
    if (prevCrank) {
      const dRev = (rev - prevCrank.rev + 65536) % 65536;
      const dt = (t - prevCrank.t1024 + 65536) % 65536;
      if (dt > 0 && dRev < 5) {
        cadenceRpm = (dRev * 60 * 1024) / dt;
      }
    }
  }
  return { cadenceRpm, wheelRpm, nextCrank, nextWheel };
}

type Listener = () => void;

class IndoorBleHubImpl {
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private lastNotify = 0;

  private scanning = false;
  private scanHits = new Map<string, { name: string; rssi: number }>();

  /** Connection order defines primary cadence / wheel resolution */
  private order: string[] = [];
  private deviceNames = new Map<string, string>();
  private crankPrev = new Map<string, DeviceCrankState | null>();
  private wheelPrev = new Map<string, DeviceWheelState | null>();
  private smooth = new Map<string, DeviceSmooth>();

  private notifyStops = new Map<string, Array<{ service: string; characteristic: string }>>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const now = Date.now();
    if (now - this.lastNotify < NOTIFY_THROTTLE_MS) return;
    this.lastNotify = now;
    this.listeners.forEach((l) => l());
  }

  async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = BleClient.initialize({ androidNeverForLocation: true }).catch((e) => {
        this.initPromise = null;
        throw e;
      });
    }
    return this.initPromise;
  }

  /** Flat list for UI */
  listScanResults(): Array<{ deviceId: string; name: string; rssi: number }> {
    return [...this.scanHits.entries()].map(([deviceId, v]) => ({ deviceId, name: v.name, rssi: v.rssi }));
  }

  isScanning(): boolean {
    return this.scanning;
  }

  async startScan(): Promise<void> {
    await this.initialize();
    this.scanHits.clear();
    if (this.scanning) await this.stopScan();
    this.scanning = true;
    await BleClient.requestLEScan({ services: [CSC_SERVICE, FTMS_SERVICE] }, (result) => {
      const id = result.device.deviceId;
      const name = result.localName ?? result.device.name ?? 'Unknown';
      const prev = this.scanHits.get(id);
      const rssi = result.rssi ?? prev?.rssi ?? 0;
      this.scanHits.set(id, { name, rssi });
      this.emit();
    });
  }

  async stopScan(): Promise<void> {
    if (!this.scanning) return;
    try {
      await BleClient.stopLEScan();
    } finally {
      this.scanning = false;
    }
  }

  getConnected(): Array<{ deviceId: string; name: string }> {
    return this.order.map((id) => ({ deviceId: id, name: this.deviceNames.get(id) ?? 'Device' }));
  }

  connectedCount(): number {
    return this.order.length;
  }

  buildSnapshot(): BleSnapshot {
    const now = Date.now();
    let cadenceRpm: number | null = null;
    let cadenceTs = 0;
    let wheelRpm: number | null = null;
    let wheelTs = 0;
    let powerW: number | null = null;
    let powerTs = 0;

    for (const id of this.order) {
      const s = this.smooth.get(id);
      if (!s) continue;
      if (cadenceRpm == null && s.cadenceRpm != null && s.cadenceRpm > 0) {
        cadenceRpm = s.cadenceRpm;
        cadenceTs = s.cadenceTs;
      }
    }
    for (const id of this.order) {
      const s = this.smooth.get(id);
      if (!s) continue;
      if (wheelRpm == null && s.wheelRpm != null && s.wheelRpm > 0) {
        wheelRpm = s.wheelRpm;
        wheelTs = s.wheelTs;
      }
    }
    for (const id of this.order) {
      const s = this.smooth.get(id);
      if (!s) continue;
      if (powerW == null && s.powerW != null && s.powerW > 0) {
        powerW = s.powerW;
        powerTs = s.powerTs;
      }
    }

    return { now, cadenceRpm, cadenceTs, wheelRpm, wheelTs, powerW, powerTs };
  }

  /** Raw smoothed cadence (first active device) — for calibration average */
  getPrimaryCadenceRpm(): number | null {
    const snap = this.buildSnapshot();
    return snap.cadenceRpm;
  }

  private ensureSmooth(deviceId: string): DeviceSmooth {
    let s = this.smooth.get(deviceId);
    if (!s) {
      s = {
        cadenceRpm: null,
        cadenceTs: 0,
        wheelRpm: null,
        wheelTs: 0,
        powerW: null,
        powerTs: 0,
      };
      this.smooth.set(deviceId, s);
    }
    return s;
  }

  async connect(deviceId: string, advertisedName: string): Promise<void> {
    await this.initialize();
    if (this.order.includes(deviceId)) return;
    if (this.order.length >= 2) {
      throw new Error('At most two sensors can be connected. Disconnect one first.');
    }

    await BleClient.connect(deviceId, (id) => this.handleDisconnect(id));
    this.deviceNames.set(deviceId, advertisedName);
    if (!this.order.includes(deviceId)) this.order.push(deviceId);
    this.crankPrev.set(deviceId, null);
    this.wheelPrev.set(deviceId, null);
    this.ensureSmooth(deviceId);

    try {
      await BleClient.discoverServices(deviceId);
    } catch {
      // Web Bluetooth: discoverServices may be unavailable; notifications can still work.
    }

    const stops: Array<{ service: string; characteristic: string }> = [];
    let ftms = false;
    try {
      await BleClient.startNotifications(deviceId, FTMS_SERVICE, INDOOR_BIKE_DATA, (value) => {
        const p = parseIndoorBikeData(value);
        const sm = this.ensureSmooth(deviceId);
        const t = Date.now();
        if (p.cadence != null && Number.isFinite(p.cadence)) {
          sm.cadenceRpm = ema(sm.cadenceRpm, p.cadence);
          sm.cadenceTs = t;
        }
        if (p.power != null && Number.isFinite(p.power)) {
          sm.powerW = ema(sm.powerW, p.power);
          sm.powerTs = t;
        }
        this.emit();
      });
      stops.push({ service: FTMS_SERVICE, characteristic: INDOOR_BIKE_DATA });
      ftms = true;
    } catch {
      // no FTMS indoor bike on this device
    }

    if (!ftms) {
      await BleClient.startNotifications(deviceId, CSC_SERVICE, CSC_MEASUREMENT, (value) => {
        const prevC = this.crankPrev.get(deviceId) ?? null;
        const prevW = this.wheelPrev.get(deviceId) ?? null;
        const { cadenceRpm, wheelRpm, nextCrank, nextWheel } = parseCscMeasurement(value, prevC, prevW);
        this.crankPrev.set(deviceId, nextCrank);
        this.wheelPrev.set(deviceId, nextWheel);
        const sm = this.ensureSmooth(deviceId);
        const t = Date.now();
        if (cadenceRpm != null && Number.isFinite(cadenceRpm)) {
          sm.cadenceRpm = ema(sm.cadenceRpm, cadenceRpm);
          sm.cadenceTs = t;
        }
        if (wheelRpm != null && Number.isFinite(wheelRpm)) {
          sm.wheelRpm = ema(sm.wheelRpm, wheelRpm);
          sm.wheelTs = t;
        }
        this.emit();
      });
      stops.push({ service: CSC_SERVICE, characteristic: CSC_MEASUREMENT });
    }

    this.notifyStops.set(deviceId, stops);
    this.emit();
  }

  private async handleDisconnect(deviceId: string): Promise<void> {
    await this.cleanupDevice(deviceId, false);
    this.emit();
  }

  private async cleanupDevice(deviceId: string, disconnectRemote: boolean): Promise<void> {
    const stops = this.notifyStops.get(deviceId) ?? [];
    for (const s of stops) {
      try {
        await BleClient.stopNotifications(deviceId, s.service, s.characteristic);
      } catch {
        // ignore
      }
    }
    this.notifyStops.delete(deviceId);
    this.order = this.order.filter((id) => id !== deviceId);
    this.smooth.delete(deviceId);
    this.crankPrev.delete(deviceId);
    this.wheelPrev.delete(deviceId);
    this.deviceNames.delete(deviceId);
    if (disconnectRemote) {
      try {
        await BleClient.disconnect(deviceId);
      } catch {
        // ignore
      }
    }
  }

  async disconnect(deviceId: string): Promise<void> {
    await this.cleanupDevice(deviceId, true);
    this.emit();
  }

  async disconnectAll(): Promise<void> {
    const ids = [...this.order];
    for (const id of ids) {
      await this.cleanupDevice(id, true);
    }
    this.emit();
  }

  hasLiveCadenceOrPower(): boolean {
    const s = this.buildSnapshot();
    return (s.cadenceRpm != null && s.cadenceRpm >= MIN_CADENCE_VALID) || (s.powerW != null && s.powerW > 0);
  }

  hasDualSpeedCadence(): boolean {
    const s = this.buildSnapshot();
    const c = s.cadenceRpm != null && s.cadenceRpm >= MIN_CADENCE_VALID && Date.now() - s.cadenceTs < 3000;
    const w = s.wheelRpm != null && s.wheelRpm > 0 && Date.now() - s.wheelTs < 3000;
    return c && w;
  }
}

let hubSingleton: IndoorBleHubImpl | null = null;

export function getIndoorBleHub(): IndoorBleHubImpl {
  if (!hubSingleton) hubSingleton = new IndoorBleHubImpl();
  return hubSingleton;
}
