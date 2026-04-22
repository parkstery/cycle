import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';
import type { BleSnapshot } from './dualMerge';

const CSC_SERVICE = numberToUUID(0x1816);
const CSC_MEASUREMENT = numberToUUID(0x2a5b);
const FTMS_SERVICE = numberToUUID(0x1826);
const INDOOR_BIKE_DATA = numberToUUID(0x2ad2);

const EMA_A = 0.38;
const NOTIFY_THROTTLE_MS = 125;
const MIN_CADENCE_VALID = 6;
const CADENCE_STALE_MS = 3000;
const WHEEL_STALE_MS = 3000;
const POWER_STALE_MS = 3000;
const TRAINER_SPEED_STALE_MS = 3000;

type DeviceCrankState = { rev: number; t1024: number };
type DeviceWheelState = { rev: number; t1024: number };

type DeviceSmooth = {
  cadenceRpm: number | null;
  cadenceTs: number;
  wheelRpm: number | null;
  wheelTs: number;
  powerW: number | null;
  powerTs: number;
  trainerSpeedKmh: number | null;
  trainerSpeedTs: number;
};

function ema(prev: number | null, next: number): number {
  if (prev == null || !Number.isFinite(prev)) return next;
  return prev * (1 - EMA_A) + next * EMA_A;
}

/**
 * FTMS Indoor Bike Data (0x2AD2) parser.
 *
 * Field layout per the Bluetooth FTMS spec (flags are uint16 LE at offset 0):
 *   bit 0  More Data          — when SET, Instantaneous Speed is NOT present
 *                                (i.e. inst speed is present by default)
 *   bit 1  Average Speed Present        (uint16, 0.01 km/h)
 *   bit 2  Instantaneous Cadence Present (uint16, 0.5 rpm)
 *   bit 3  Average Cadence Present       (uint16, 0.5 rpm)
 *   bit 4  Total Distance Present        (uint24, m)
 *   bit 5  Resistance Level Present      (sint16)
 *   bit 6  Instantaneous Power Present   (sint16, W)
 *   bit 7  Average Power Present         (sint16, W)
 *   ...
 * Previous parser skipped Instantaneous Speed entirely and read every subsequent
 * field from the wrong offset. This rewrites the whole parse.
 */
function parseIndoorBikeData(view: DataView): {
  instSpeedKmh?: number;
  cadence?: number;
  power?: number;
} {
  const out: { instSpeedKmh?: number; cadence?: number; power?: number } = {};
  if (view.byteLength < 2) return out;
  const flags = view.getUint16(0, true);
  let o = 2;

  // Instantaneous Speed is present unless bit 0 (More Data) is SET.
  const instSpeedPresent = (flags & 0x0001) === 0;
  if (instSpeedPresent) {
    if (o + 2 > view.byteLength) return out;
    const raw = view.getUint16(o, true);
    o += 2;
    const kmh = raw / 100;
    // Guard against firmware glitches (uninitialized fields, wrap-around).
    if (Number.isFinite(kmh) && kmh >= 0 && kmh <= 80) {
      out.instSpeedKmh = kmh;
    }
  }

  if (flags & 0x0002) {
    if (o + 2 > view.byteLength) return out;
    o += 2;
  }
  if (flags & 0x0004) {
    if (o + 2 > view.byteLength) return out;
    const raw = view.getUint16(o, true);
    o += 2;
    out.cadence = raw / 2;
  }
  if (flags & 0x0008) {
    if (o + 2 > view.byteLength) return out;
    o += 2;
  }
  if (flags & 0x0010) {
    if (o + 3 > view.byteLength) return out;
    o += 3;
  }
  if (flags & 0x0020) {
    if (o + 2 > view.byteLength) return out;
    o += 2;
  }
  if (flags & 0x0040) {
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

type AutoConnectPhase = 'idle' | 'scanning' | 'connecting' | 'waiting';

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
  private lastSensorPacketAtMs = 0;

  /** deviceId -> display name of sensors we want to keep reconnecting to. */
  private reconnectWanted = new Map<string, string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectBackoffIdx = 0;
  private autoConnectInFlight = false;
  private autoConnectPhase: AutoConnectPhase = 'idle';
  private allowUnknownConnect = false;

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

  getLastSensorPacketAtMs(): number {
    return this.lastSensorPacketAtMs;
  }

  buildSnapshot(): BleSnapshot {
    const now = Date.now();
    let cadenceRpm: number | null = null;
    let cadenceTs = 0;
    let wheelRpm: number | null = null;
    let wheelTs = 0;
    let powerW: number | null = null;
    let powerTs = 0;
    let trainerSpeedKmh: number | null = null;
    let trainerSpeedTs = 0;

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
    for (const id of this.order) {
      const s = this.smooth.get(id);
      if (!s) continue;
      if (trainerSpeedKmh == null && s.trainerSpeedKmh != null && s.trainerSpeedKmh >= 0) {
        trainerSpeedKmh = s.trainerSpeedKmh;
        trainerSpeedTs = s.trainerSpeedTs;
      }
    }

    if (cadenceTs > 0 && now - cadenceTs > CADENCE_STALE_MS) {
      cadenceRpm = null;
      cadenceTs = 0;
    }
    if (wheelTs > 0 && now - wheelTs > WHEEL_STALE_MS) {
      wheelRpm = null;
      wheelTs = 0;
    }
    if (powerTs > 0 && now - powerTs > POWER_STALE_MS) {
      powerW = null;
      powerTs = 0;
    }
    if (trainerSpeedTs > 0 && now - trainerSpeedTs > TRAINER_SPEED_STALE_MS) {
      trainerSpeedKmh = null;
      trainerSpeedTs = 0;
    }

    return {
      now,
      cadenceRpm, cadenceTs,
      wheelRpm, wheelTs,
      powerW, powerTs,
      trainerSpeedKmh, trainerSpeedTs,
    };
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
        trainerSpeedKmh: null,
        trainerSpeedTs: 0,
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

    await BleClient.connect(deviceId, (id) => {
      void this.handleDisconnect(id);
    });
    this.deviceNames.set(deviceId, advertisedName);
    if (!this.order.includes(deviceId)) this.order.push(deviceId);
    this.reconnectWanted.set(deviceId, advertisedName);
    this.reconnectBackoffIdx = 0;
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
        this.lastSensorPacketAtMs = Date.now();
        const p = parseIndoorBikeData(value);
        const sm = this.ensureSmooth(deviceId);
        const t = this.lastSensorPacketAtMs;
        if (p.instSpeedKmh != null && Number.isFinite(p.instSpeedKmh)) {
          sm.trainerSpeedKmh = ema(sm.trainerSpeedKmh, p.instSpeedKmh);
          sm.trainerSpeedTs = t;
        }
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
        this.lastSensorPacketAtMs = Date.now();
        const prevC = this.crankPrev.get(deviceId) ?? null;
        const prevW = this.wheelPrev.get(deviceId) ?? null;
        const { cadenceRpm, wheelRpm, nextCrank, nextWheel } = parseCscMeasurement(value, prevC, prevW);
        this.crankPrev.set(deviceId, nextCrank);
        this.wheelPrev.set(deviceId, nextWheel);
        const sm = this.ensureSmooth(deviceId);
        const t = this.lastSensorPacketAtMs;
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
    const savedName = this.deviceNames.get(deviceId);
    await this.cleanupDevice(deviceId, false);
    this.emit();
    if (savedName && this.reconnectWanted.has(deviceId)) {
      // Refresh name in case it was cleared by cleanup.
      this.reconnectWanted.set(deviceId, savedName);
    }
    if (this.reconnectWanted.size > 0 || this.allowUnknownConnect) {
      // Give the sensor a short moment to settle before the first retry.
      this.reconnectBackoffIdx = 0;
      this.scheduleReconnectLoop(2500);
    }
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
    // Explicit user disconnect: forget auto-reconnect intent for this device.
    this.reconnectWanted.delete(deviceId);
    if (this.reconnectWanted.size === 0) {
      this.allowUnknownConnect = false;
      this.clearReconnectTimer();
      this.setAutoPhase('idle');
    }
    await this.cleanupDevice(deviceId, true);
    this.emit();
  }

  async disconnectAll(): Promise<void> {
    const ids = [...this.order];
    this.reconnectWanted.clear();
    this.clearReconnectTimer();
    for (const id of ids) {
      await this.cleanupDevice(id, true);
    }
    this.emit();
  }

  isAutoConnecting(): boolean {
    return this.autoConnectPhase !== 'idle';
  }

  getAutoConnectPhase(): AutoConnectPhase {
    return this.autoConnectPhase;
  }

  private setAutoPhase(p: AutoConnectPhase) {
    if (this.autoConnectPhase === p) return;
    this.autoConnectPhase = p;
    this.lastNotify = 0;
    this.emit();
  }

  /** Wanted ids (for external inspection). */
  getReconnectWanted(): Array<{ deviceId: string; name: string }> {
    return [...this.reconnectWanted.entries()].map(([deviceId, name]) => ({ deviceId, name }));
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Scan-first auto-connect. Call this on app launch, after manual connect, and whenever a
   * previously paired device drops.
   *
   * - savedDevices: previously paired sensors (priority, in order).
   * - options.allowUnknown: when true, fills remaining connection slots (up to 2 total)
   *   using scanned CSC/FTMS devices when saved devices are missing or unavailable.
   * - options.scanDurationMs: maximum scan window. Resolves earlier as soon as a saved device
   *   appears in the scan results.
   * - Never throws. Failures (BT off, permissions, no device in range) leave the hub idle.
   *
   * Returns the list of deviceIds that ended up connected.
   */
  async tryAutoReconnect(
    savedDevices: Array<{ deviceId: string; name: string }>,
    options: { allowUnknown?: boolean; scanDurationMs?: number } = {}
  ): Promise<string[]> {
    const scanDurationMs = options.scanDurationMs ?? 12000;
    const allowUnknown = options.allowUnknown ?? false;
    const slotsAvailableAtStart = Math.max(0, 2 - this.order.length);

    if (this.autoConnectInFlight) return [...this.order];
    if (this.order.length >= 2) return [...this.order];

    this.autoConnectInFlight = true;
    try {
      try {
        await this.initialize();
      } catch {
        return [...this.order];
      }

      const savedSet = new Set(savedDevices.map((d) => d.deviceId));
      const savedMap = new Map(savedDevices.map((d) => [d.deviceId, d.name]));
      const foundDuringScan = new Map<string, { name: string; rssi: number }>();

      if (this.scanning) {
        try {
          await this.stopScan();
        } catch {
          // ignore
        }
      }

      this.setAutoPhase('scanning');
      try {
        this.scanning = true;
        this.scanHits.clear();
        this.emit();
        await BleClient.requestLEScan({ services: [CSC_SERVICE, FTMS_SERVICE] }, (result) => {
          const id = result.device.deviceId;
          const name = result.localName ?? result.device.name ?? savedMap.get(id) ?? 'Sensor';
          const prev = this.scanHits.get(id);
          const rssi = result.rssi ?? prev?.rssi ?? 0;
          this.scanHits.set(id, { name, rssi });
          foundDuringScan.set(id, { name, rssi });
          this.emit();
        });
      } catch {
        try {
          await this.stopScan();
        } catch {
          // ignore
        }
        this.setAutoPhase('idle');
        return [...this.order];
      }

      await new Promise<void>((resolve) => {
        const start = Date.now();
        const poll = () => {
          const savedFoundCount = [...savedSet].filter((id) => foundDuringScan.has(id)).length;
          if (savedSet.size > 0) {
            const neededSaved = Math.min(savedSet.size, slotsAvailableAtStart);
            if (savedFoundCount >= neededSaved && savedFoundCount > 0) return resolve();
          }
          if (
            allowUnknown &&
            foundDuringScan.size >= slotsAvailableAtStart &&
            slotsAvailableAtStart > 0 &&
            Date.now() - start > 1500
          ) {
            return resolve();
          }
          if (Date.now() - start > scanDurationMs) return resolve();
          setTimeout(poll, 400);
        };
        poll();
      });

      try {
        await this.stopScan();
      } catch {
        // ignore
      }

      const candidates: Array<{ deviceId: string; name: string }> = [];
      for (const d of savedDevices) {
        if (foundDuringScan.has(d.deviceId)) {
          const hit = foundDuringScan.get(d.deviceId)!;
          candidates.push({ deviceId: d.deviceId, name: d.name || hit.name });
        }
      }
      if (allowUnknown && candidates.length < slotsAvailableAtStart) {
        const byRssi = [...foundDuringScan.entries()]
          .map(([deviceId, v]) => ({ deviceId, name: v.name, rssi: v.rssi }))
          .filter((d) => !candidates.some((c) => c.deviceId === d.deviceId))
          .sort((a, b) => b.rssi - a.rssi);
        const remain = Math.max(0, slotsAvailableAtStart - candidates.length);
        for (const d of byRssi.slice(0, remain)) {
          candidates.push({ deviceId: d.deviceId, name: d.name });
        }
      }

      if (candidates.length === 0) {
        this.setAutoPhase('idle');
        return [...this.order];
      }

      this.setAutoPhase('connecting');
      for (const c of candidates) {
        if (this.order.length >= 2) break;
        if (this.order.includes(c.deviceId)) continue;
        try {
          await Promise.race([
            this.connect(c.deviceId, c.name),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('auto-connect timeout')), 12000)
            ),
          ]);
          this.reconnectBackoffIdx = 0;
        } catch {
          // next candidate / give up
        }
      }

      this.setAutoPhase('idle');
      return [...this.order];
    } finally {
      this.autoConnectInFlight = false;
    }
  }

  /**
   * Declare intent to keep sensors connected. Call after manual connect or at app start.
   * Triggers the retry loop if any requested device is currently missing.
   */
  requestPersistentConnection(
    devices: Array<{ deviceId: string; name: string }>,
    options: { allowUnknown?: boolean } = {}
  ): void {
    this.allowUnknownConnect = options.allowUnknown === true || this.allowUnknownConnect;
    for (const d of devices) {
      if (d.deviceId) this.reconnectWanted.set(d.deviceId, d.name || this.deviceNames.get(d.deviceId) || 'Sensor');
    }
    this.scheduleReconnectLoop(0);
  }

  /** Disable auto-reconnect entirely (e.g. user toggled off in settings). */
  stopPersistentConnection(): void {
    this.reconnectWanted.clear();
    this.allowUnknownConnect = false;
    this.clearReconnectTimer();
    this.setAutoPhase('idle');
  }

  private scheduleReconnectLoop(delayMs?: number): void {
    this.clearReconnectTimer();
    const needsWork =
      this.reconnectWanted.size > 0 || (this.allowUnknownConnect && this.order.length < 2);
    if (!needsWork) {
      this.setAutoPhase('idle');
      return;
    }

    const backoffs = [0, 4000, 8000, 16000, 30000, 60000];
    const wait = delayMs ?? backoffs[Math.min(this.reconnectBackoffIdx, backoffs.length - 1)];
    this.setAutoPhase(wait > 0 ? 'waiting' : 'scanning');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.runReconnectAttempt();
    }, wait);
  }

  private async runReconnectAttempt(): Promise<void> {
    const wanted = [...this.reconnectWanted.entries()].map(([deviceId, name]) => ({ deviceId, name }));
    const missing = wanted.filter((w) => !this.order.includes(w.deviceId));
    const needUnknown = this.allowUnknownConnect && this.order.length < 2;

    if (missing.length === 0 && !needUnknown) {
      this.reconnectBackoffIdx = 0;
      this.setAutoPhase('idle');
      return;
    }

    try {
      await this.tryAutoReconnect(missing, { allowUnknown: needUnknown, scanDurationMs: 10000 });
    } catch {
      // ignore
    }

    const stillMissing =
      [...this.reconnectWanted.keys()].some((id) => !this.order.includes(id)) ||
      (this.allowUnknownConnect && this.order.length < 2);
    if (stillMissing) {
      this.reconnectBackoffIdx = Math.min(this.reconnectBackoffIdx + 1, 5);
      this.scheduleReconnectLoop();
    } else {
      this.reconnectBackoffIdx = 0;
      this.setAutoPhase('idle');
    }
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
