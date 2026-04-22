import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Gauge, Bluetooth, BluetoothOff, Scan, ChevronDown, ChevronUp } from 'lucide-react';
import { getIndoorBleHub } from './sensor/indoorBleHub';
import type { FitnessLevel, IndoorSensorPrefs, BikeProfile } from './sensor/sensorPrefs';
import { upsertSavedDevice, removeSavedDevice, BIKE_PROFILE_CIRCUMFERENCE_MM } from './sensor/sensorPrefs';
import { initialCapacityFromTestRpm } from './sensor/effortModel';
import type { SpeedSource } from './sensor/effortModel';

type ConnState = 'disconnected' | 'scanning' | 'connected' | 'reconnecting';

const FITNESS_OPTIONS: { id: FitnessLevel; label: string }[] = [
  { id: 'frail', label: 'Light' },
  { id: 'normal', label: 'Average' },
  { id: 'active', label: 'Active' },
  { id: 'high', label: 'Strong' },
];

export type SensorsModalProps = {
  open: boolean;
  onClose: () => void;
  prefs: IndoorSensorPrefs;
  onChangePrefs: (next: IndoorSensorPrefs) => void;
  speedSource?: SpeedSource;
};

const BIKE_PROFILE_OPTIONS: { id: Exclude<BikeProfile, 'unset' | 'custom'>; label: string }[] = [
  { id: 'road700c', label: 'Road bike (700c)' },
  { id: 'mtb29', label: 'MTB 29"' },
  { id: 'mtb275', label: 'MTB 27.5"' },
  { id: 'mtb26', label: 'MTB 26"' },
  { id: 'spinbike', label: 'Indoor / spin bike' },
];

const SPEED_SOURCE_LABEL: Record<SpeedSource, { text: string; color: string }> = {
  trainer: { text: 'Trainer speed', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  wheel: { text: 'Wheel sensor', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  cadence: { text: 'Cadence estimate', color: 'bg-violet-100 text-violet-800 border-violet-300' },
  manual: { text: 'Manual slider', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  coast: { text: 'Coasting', color: 'bg-amber-100 text-amber-800 border-amber-300' },
};

export const SensorsModal: React.FC<SensorsModalProps> = ({ open, onClose, prefs, onChangePrefs, speedSource }) => {
  const hub = useMemo(() => getIndoorBleHub(), []);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [, bump] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [testFinished, setTestFinished] = useState(false);

  const [calibRunning, setCalibRunning] = useState(false);
  const [calibLeftSec, setCalibLeftSec] = useState(0);
  const calibSamplesRef = useRef<number[]>([]);
  const calibTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const calibSecRef = useRef(0);

  useEffect(() => {
    return hub.subscribe(() => bump((n) => n + 1));
  }, [hub]);

  useEffect(() => {
    if (!open) return;
    setInitError(null);
    hub
      .initialize()
      .catch((e: unknown) => {
        setInitError(e instanceof Error ? e.message : 'Bluetooth could not be started.');
      });
  }, [open, hub]);

  const connected = hub.getConnected();
  const scanning = hub.isScanning();
  const scanList = hub.listScanResults();
  const autoPhase = hub.getAutoConnectPhase();

  const connState: ConnState = useMemo(() => {
    if (connected.length > 0) return 'connected';
    if (scanning) return 'scanning';
    if (autoPhase !== 'idle') return 'reconnecting';
    return 'disconnected';
  }, [scanning, connected.length, autoPhase]);

  const snap = hub.buildSnapshot();
  const rpmDisplay = snap.cadenceRpm != null ? Math.round(snap.cadenceRpm) : '—';
  const wattDisplay = snap.powerW != null ? Math.round(snap.powerW) : null;

  const dualBadge = hub.hasDualSpeedCadence();

  const handleScan = async () => {
    setActionError(null);
    try {
      await hub.initialize();
      await hub.startScan();
      window.setTimeout(async () => {
        try {
          await hub.stopScan();
          bump((n) => n + 1);
        } catch {
          // ignore
        }
      }, 8000);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Scan failed. Check Bluetooth permissions and try again.');
    }
  };

  const handleConnect = async (deviceId: string, name: string) => {
    setActionError(null);
    try {
      await hub.stopScan();
      await hub.connect(deviceId, name);
      const cur = prefsRef.current;
      const nextList = upsertSavedDevice(cur.lastConnectedDevices, { deviceId, name });
      onChangePrefs({ ...cur, lastConnectedDevices: nextList });
      if (cur.autoReconnectEnabled) {
        hub.requestPersistentConnection([{ deviceId, name }]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connection failed.';
      if (/zwift|busy|133|0x85|timeout/i.test(msg)) {
        setActionError('Close other training apps before connecting. Only one app can use the trainer at a time.');
      } else {
        setActionError(msg);
      }
    }
  };

  const handleDisconnect = async (deviceId: string) => {
    setActionError(null);
    try {
      await hub.disconnect(deviceId);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Disconnect failed.');
    }
  };

  const startCalibration = () => {
    if (calibRunning) return;
    setTestFinished(false);
    calibSamplesRef.current = [];
    calibSecRef.current = 60;
    setCalibRunning(true);
    setCalibLeftSec(60);
    if (calibTimerRef.current) clearInterval(calibTimerRef.current);
    calibTimerRef.current = window.setInterval(() => {
      const c = hub.getPrimaryCadenceRpm();
      if (c != null && c > 10) calibSamplesRef.current.push(c);
      calibSecRef.current -= 1;
      setCalibLeftSec(calibSecRef.current);
      if (calibSecRef.current <= 0) {
        if (calibTimerRef.current) clearInterval(calibTimerRef.current);
        calibTimerRef.current = null;
        setCalibRunning(false);
        const arr = calibSamplesRef.current;
        const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        if (avg != null && avg > 0) {
          const avgRounded = Math.round(avg * 10) / 10;
          const cap = initialCapacityFromTestRpm(avgRounded);
          const next = {
            ...prefsRef.current,
            calibrationAvgRpm: avgRounded,
            calibrationAt: Date.now(),
            capacityRpm: cap,
          };
          onChangePrefs(next);
          setTestFinished(true);
        }
      }
    }, 1000);
  };

  const cancelCalibration = () => {
    if (calibTimerRef.current) clearInterval(calibTimerRef.current);
    calibTimerRef.current = null;
    setCalibRunning(false);
    setCalibLeftSec(0);
  };

  useEffect(() => {
    return () => {
      if (calibTimerRef.current) clearInterval(calibTimerRef.current);
    };
  }, []);

  const setBlendMode = (speedCadenceBlendMode: IndoorSensorPrefs['speedCadenceBlendMode']) => {
    onChangePrefs({ ...prefsRef.current, speedCadenceBlendMode });
  };

  const setAutoReconnect = (autoReconnectEnabled: boolean) => {
    onChangePrefs({ ...prefsRef.current, autoReconnectEnabled });
    if (!autoReconnectEnabled) {
      hub.stopPersistentConnection();
    } else {
      const saved = prefsRef.current.lastConnectedDevices ?? [];
      hub.requestPersistentConnection(saved, { allowUnknown: saved.length === 0 });
    }
  };

  const forgetSavedDevice = (deviceId: string) => {
    const cur = prefsRef.current;
    onChangePrefs({ ...cur, lastConnectedDevices: removeSavedDevice(cur.lastConnectedDevices, deviceId) });
  };

  const forgetAllSavedDevices = () => {
    onChangePrefs({ ...prefsRef.current, lastConnectedDevices: [] });
    hub.stopPersistentConnection();
  };

  const setBikeProfile = (id: Exclude<BikeProfile, 'unset' | 'custom'>) => {
    onChangePrefs({
      ...prefsRef.current,
      bikeProfile: id,
      wheelCircumferenceMm: BIKE_PROFILE_CIRCUMFERENCE_MM[id],
    });
  };

  const setFitnessLevel = (fitnessLevel: FitnessLevel) => {
    onChangePrefs({ ...prefsRef.current, fitnessLevel });
  };

  const setSensorDrive = (sensorDriveEnabled: boolean) => {
    onChangePrefs({ ...prefsRef.current, sensorDriveEnabled });
  };

  const saveCurrentModeAsDefault = () => {
    onChangePrefs({
      ...prefsRef.current,
      preferredRideMode: prefsRef.current.sensorDriveEnabled ? 'sensor' : 'manual',
    });
  };

  const onBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-3"
      onMouseDown={onBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sensors-modal-title"
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-[380px] w-full max-h-[90vh] overflow-y-auto text-slate-800 border border-slate-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
          <h2 id="sensors-modal-title" className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Gauge size={18} className="text-blue-600" />
            Sensors & speed
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-3 py-2 space-y-3 text-[12px]">
          {initError && <p className="text-red-600 text-[11px] leading-snug">{initError}</p>}
          {actionError && <p className="text-red-600 text-[11px] leading-snug">{actionError}</p>}

          <section>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">1) Scan & connect</div>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              {connState === 'connected' ? (
                <Bluetooth size={16} className="text-emerald-600 shrink-0" />
              ) : connState === 'scanning' || connState === 'reconnecting' ? (
                <Bluetooth size={16} className="text-amber-500 animate-pulse shrink-0" />
              ) : (
                <BluetoothOff size={16} className="text-slate-400 shrink-0" />
              )}
              <span className="min-w-0">
                {connState === 'disconnected' && 'Disconnected'}
                {connState === 'scanning' && 'Scanning…'}
                {connState === 'reconnecting' &&
                  (autoPhase === 'connecting' ? 'Connecting…' : autoPhase === 'waiting' ? 'Waiting for sensor…' : 'Auto-scanning…')}
                {connState === 'connected' && `Connected (${connected.length})`}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleScan()}
                  disabled={scanning}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 text-white text-[10px] font-bold disabled:opacity-50"
                >
                  <Scan size={13} />
                  {scanning ? 'Scanning…' : 'Scan'}
                </button>
                {scanning && (
                  <button
                    type="button"
                    className="text-[10px] font-bold text-slate-600 px-2 py-1 rounded-md border border-slate-200 bg-white"
                    onClick={() => void hub.stopScan().then(() => bump((n) => n + 1))}
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>

            {connected.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {connected.map((c) => (
                  <li key={c.deviceId} className="flex items-center gap-1.5 bg-slate-50 rounded-md px-2 py-1 min-w-0">
                    <span className="truncate font-medium text-[11px] text-slate-800 flex-1 min-w-0">{c.name}</span>
                    <button
                      type="button"
                      className="shrink-0 text-[10px] font-bold text-red-700 bg-white border border-red-200 rounded-md px-2 py-0.5 active:scale-[0.98]"
                      onClick={() => void handleDisconnect(c.deviceId)}
                    >
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {scanList.length > 0 && (
              <ul className="mt-1.5 max-h-28 overflow-y-auto border border-slate-100 rounded-md divide-y divide-slate-100">
                {scanList.map((d) => (
                  <li key={d.deviceId} className="flex items-center gap-1.5 px-2 py-1 min-w-0">
                    <span className="truncate text-[11px] font-medium text-slate-800 flex-1 min-w-0">{d.name}</span>
                    <button
                      type="button"
                      disabled={connected.some((c) => c.deviceId === d.deviceId)}
                      className="shrink-0 text-[10px] font-bold text-blue-700 bg-white border border-blue-200 rounded-md px-2 py-0.5 disabled:text-slate-400 disabled:border-slate-100 active:scale-[0.98]"
                      onClick={() => void handleConnect(d.deviceId, d.name)}
                    >
                      Connect
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!scanning && scanList.length === 0 && connected.length === 0 && (
              <p className="text-[10px] text-slate-400 mt-1 leading-snug">Tap Scan, then Connect next to your sensor or trainer.</p>
            )}

            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-0.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Live</div>
                {speedSource && (
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${SPEED_SOURCE_LABEL[speedSource].color}`}
                  >
                    {SPEED_SOURCE_LABEL[speedSource].text}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-3">
                <div>
                  <span className="text-[24px] font-black text-slate-900 tabular-nums">{rpmDisplay}</span>
                  <span className="text-[10px] font-bold text-slate-500 ml-1">RPM</span>
                </div>
                {wattDisplay != null && (
                  <div>
                    <span className="text-[16px] font-black text-slate-800 tabular-nums">{wattDisplay}</span>
                    <span className="text-[10px] font-bold text-slate-500 ml-1">W</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {dualBadge && (
            <div className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-1">
              Dual sensors: speed + cadence
            </div>
          )}

          <section>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">2) Ride mode</div>
            <p className="text-[10px] text-slate-500 leading-snug mb-1.5">
              Default app mode is <strong>manual speed</strong>. Switch for this session, then save your default if you want.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSensorDrive(false)}
                className={`min-h-[2.5rem] px-1.5 py-1.5 rounded-lg text-[10px] font-bold border text-center leading-tight transition-colors ${
                  !prefs.sensorDriveEnabled
                    ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Manual speed
              </button>
              <button
                type="button"
                onClick={() => setSensorDrive(true)}
                className={`min-h-[2.5rem] px-1.5 py-1.5 rounded-lg text-[10px] font-bold border text-center leading-tight transition-colors ${
                  prefs.sensorDriveEnabled
                    ? 'bg-emerald-100 text-emerald-950 border-emerald-500 ring-2 ring-emerald-400 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                }`}
                style={prefs.sensorDriveEnabled ? { color: '#022c22', WebkitTextFillColor: '#022c22' } : undefined}
              >
                Sensor-based ride
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <button type="button" className="text-[10px] font-bold text-blue-600 underline" onClick={saveCurrentModeAsDefault}>
                Set current mode as default
              </button>
              <span className="text-[10px] text-slate-400">
                Current default: {prefs.preferredRideMode === 'sensor' ? 'Sensor-based' : 'Manual'}
              </span>
            </div>
            {prefs.sensorDriveEnabled && connected.length === 0 && (
              <p className="text-[10px] text-amber-700 mt-1.5 leading-snug">Connect a sensor or trainer for live speed. Until then, speed may coast low.</p>
            )}
          </section>

          <section>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">3) Fitness (base pace)</div>
            <p className="text-[10px] text-slate-500 leading-snug mb-1">How you would describe your usual stamina — this sets the baseline when using sensors.</p>
            <div className="grid grid-cols-4 gap-1">
              {FITNESS_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFitnessLevel(id)}
                  className={`py-1 px-0.5 rounded-md text-[9px] font-bold border leading-tight ${
                    prefs.fitnessLevel === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                  }`}
                  style={prefs.fitnessLevel === id ? { WebkitTextFillColor: '#ffffff' } : { WebkitTextFillColor: '#334155' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">4) 1-minute calibration (optional)</div>
            <p className="text-[10px] text-slate-500 leading-snug mb-1">
              Set the bike to <strong>highest resistance</strong>, then pedal hard for one minute. We use your <strong>average RPM</strong> as your personal capacity anchor.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {!calibRunning ? (
                <>
                  <button type="button" onClick={startCalibration} className="text-[11px] font-bold bg-slate-800 text-white px-2 py-1 rounded shrink-0">
                    {prefs.calibrationAvgRpm != null ? 'Retest 1 minute' : 'Start 1-minute test'}
                  </button>
                  {testFinished && (
                    <span className="text-[11px] font-semibold text-emerald-600" role="status">
                      Test finished
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-[14px] font-black text-blue-700 tabular-nums">{calibLeftSec}s</span>
                  <button type="button" onClick={cancelCalibration} className="text-[11px] text-slate-500 underline">
                    Cancel
                  </button>
                </>
              )}
            </div>
            {prefs.calibrationAvgRpm != null && (
              <p className="text-[11px] text-slate-600 mt-1">
                Saved average: <strong>{prefs.calibrationAvgRpm}</strong> RPM
                <button
                  type="button"
                  className="ml-2 text-blue-600 font-bold"
                  onClick={() => {
                    const next = {
                      ...prefsRef.current,
                      calibrationAvgRpm: null,
                      calibrationAt: null,
                      capacityRpm: null,
                    };
                    onChangePrefs(next);
                    setTestFinished(false);
                  }}
                >
                  Clear
                </button>
              </p>
            )}
          </section>

          <section>
            <button type="button" className="flex items-center gap-1 text-[11px] font-bold text-slate-600" onClick={() => setAdvancedOpen((v) => !v)}>
              {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Advanced
            </button>
            {advancedOpen && (
              <div className="mt-2 space-y-3 pl-1 border-l-2 border-slate-100">
                <div>
                  <p className="text-[10px] font-semibold text-slate-600 mb-1">Bike type</p>
                  <p className="text-[10px] text-slate-500 leading-snug mb-1.5">
                    Used to convert wheel sensor speed into km/h. Only relevant when a speed sensor is connected.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {BIKE_PROFILE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBikeProfile(opt.id)}
                        className={`px-1.5 py-1.5 rounded-lg text-[10px] font-bold border text-center leading-tight transition-colors ${
                          prefs.bikeProfile === opt.id
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                        style={prefs.bikeProfile === opt.id ? { WebkitTextFillColor: '#ffffff' } : { WebkitTextFillColor: '#334155' }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">
                    Current: {prefs.wheelCircumferenceMm} mm circumference
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.autoReconnectEnabled}
                      onChange={(e) => setAutoReconnect(e.target.checked)}
                    />
                    <span className="font-semibold text-slate-700">Auto-reconnect on app launch</span>
                  </label>
                  <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                    Silently reconnects to the last used sensors when the app opens. No buttons needed.
                  </p>
                  {prefs.lastConnectedDevices.length > 0 && (
                    <div className="mt-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-slate-500">Saved sensors</p>
                        <button
                          type="button"
                          className="text-[10px] font-bold text-red-600 underline"
                          onClick={forgetAllSavedDevices}
                        >
                          Forget all
                        </button>
                      </div>
                      <ul className="mt-1 space-y-1">
                        {prefs.lastConnectedDevices.map((d) => (
                          <li key={d.deviceId} className="flex items-center gap-1.5 bg-slate-50 rounded-md px-2 py-1 min-w-0">
                            <span className="truncate text-[11px] text-slate-800 flex-1 min-w-0">{d.name}</span>
                            <button
                              type="button"
                              className="shrink-0 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded-md px-2 py-0.5 active:scale-[0.98]"
                              onClick={() => forgetSavedDevice(d.deviceId)}
                            >
                              Forget
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[10px] text-slate-500 mb-1">Speed / cadence merge priority</p>
                  {(['auto', 'speed', 'cadence'] as const).map((m) => (
                    <label key={m} className="flex items-center gap-2 text-[11px] cursor-pointer">
                      <input type="radio" name="blend" checked={prefs.speedCadenceBlendMode === m} onChange={() => setBlendMode(m)} />
                      <span>{m === 'auto' ? 'Auto (default)' : m === 'speed' ? 'Speed priority' : 'Cadence priority'}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>

          <p className="text-[10px] text-slate-400 leading-snug border-t border-slate-100 pt-2">
            Keep the phone close to the sensor. Other training apps must be closed — most trainers allow only one BLE connection at a time. Data stays on this device.
          </p>
        </div>
      </div>
    </div>
  );
};
