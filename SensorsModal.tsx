import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Gauge, Bluetooth, BluetoothOff, Scan, ChevronDown } from 'lucide-react';
import { getIndoorBleHub } from './sensor/indoorBleHub';
import type { FitnessLevel, IndoorSensorPrefs, BikeProfile } from './sensor/sensorPrefs';
import { upsertSavedDevice, removeSavedDevice, BIKE_PROFILE_CIRCUMFERENCE_MM } from './sensor/sensorPrefs';
import { initialCapacityFromTestRpm } from './sensor/effortModel';

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
};

const BIKE_PROFILE_OPTIONS: { id: Exclude<BikeProfile, 'unset' | 'custom'>; label: string }[] = [
  { id: 'road700c', label: 'Road 700c' },
  { id: 'mtb29', label: 'MTB 29"' },
  { id: 'mtb275', label: 'MTB 27.5"' },
  { id: 'mtb26', label: 'MTB 26"' },
  { id: 'spinbike', label: 'Indoor' },
];

export const SensorsModal: React.FC<SensorsModalProps> = ({ open, onClose, prefs, onChangePrefs }) => {
  const hub = useMemo(() => getIndoorBleHub(), []);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [, bump] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [testFinished, setTestFinished] = useState(false);

  const [calibRunning, setCalibRunning] = useState(false);
  const [calibLeftSec, setCalibLeftSec] = useState(0);
  const calibSamplesRef = useRef<number[]>([]);
  const calibTimerRef = useRef<number | null>(null);
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

  const connectedLabel = connected.length > 0
    ? connected.map((item) => item.name).join(', ')
    : 'No sensor';

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
        hub.requestPersistentConnection([{ deviceId, name }], { allowUnknown: true });
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
    if (calibTimerRef.current) window.clearInterval(calibTimerRef.current);
    calibTimerRef.current = window.setInterval(() => {
      const c = hub.getPrimaryCadenceRpm();
      if (c != null && c > 10) calibSamplesRef.current.push(c);
      calibSecRef.current -= 1;
      setCalibLeftSec(calibSecRef.current);
      if (calibSecRef.current <= 0) {
        if (calibTimerRef.current) window.clearInterval(calibTimerRef.current);
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
    if (calibTimerRef.current) window.clearInterval(calibTimerRef.current);
    calibTimerRef.current = null;
    setCalibRunning(false);
    setCalibLeftSec(0);
  };

  useEffect(() => {
    return () => {
      if (calibTimerRef.current) window.clearInterval(calibTimerRef.current);
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
      hub.requestPersistentConnection(saved, { allowUnknown: true });
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
      <div className="bg-white rounded-xl shadow-xl max-w-[420px] w-full max-h-[90vh] overflow-y-auto text-slate-800 border border-slate-200" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
          <h2 id="sensors-modal-title" className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Gauge size={18} className="text-blue-600" />
            Sensor settings
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-3 py-2 space-y-2 text-[12px]">
          {initError && <p className="text-red-600 text-[11px] leading-snug">{initError}</p>}
          {actionError && <p className="text-red-600 text-[11px] leading-snug">{actionError}</p>}

          <section className="grid grid-cols-[auto_1fr] gap-2 items-center min-w-0">
            <span className="text-[10px] font-semibold text-slate-500 shrink-0">Mode</span>
            <div className="flex w-full min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setSensorDrive(false)}
                className={`h-8 min-w-0 flex-1 flex items-center justify-center px-1 rounded-md text-[10px] font-bold border whitespace-nowrap ${
                  !prefs.sensorDriveEnabled ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                }`}
                style={!prefs.sensorDriveEnabled ? { WebkitTextFillColor: '#ffffff' } : { WebkitTextFillColor: '#334155' }}
              >
                Manual Mode
              </button>
              <button
                type="button"
                onClick={() => setSensorDrive(true)}
                className={`h-8 min-w-0 flex-1 flex items-center justify-center px-1 rounded-md text-[10px] font-bold border whitespace-nowrap ${
                  prefs.sensorDriveEnabled ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                }`}
                style={prefs.sensorDriveEnabled ? { WebkitTextFillColor: '#ffffff' } : { WebkitTextFillColor: '#334155' }}
              >
                Sensor Mode
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <div className="min-w-0 flex items-center gap-2 text-[11px]">
                {connState === 'connected' ? <Bluetooth size={15} className="text-emerald-600 shrink-0" /> : connState === 'scanning' || connState === 'reconnecting' ? <Bluetooth size={15} className="text-amber-500 animate-pulse shrink-0" /> : <BluetoothOff size={15} className="text-slate-400 shrink-0" />}
                <span className="truncate font-semibold text-slate-700">
                  {connState === 'disconnected' && `Disconnected | ${connectedLabel}`}
                  {connState === 'scanning' && `Scanning... | ${connectedLabel}`}
                  {connState === 'reconnecting' && `${autoPhase === 'connecting' ? 'Connecting...' : autoPhase === 'waiting' ? 'Waiting...' : 'Auto-scan...'} | ${connectedLabel}`}
                  {connState === 'connected' && `Connected (${connected.length}) | ${connectedLabel}`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void handleScan()}
                  disabled={scanning}
                  className="h-8 flex items-center gap-1 px-2 rounded-md bg-blue-600 text-white text-[10px] font-bold disabled:opacity-50"
                >
                  <Scan size={13} />
                  Scan
                </button>
                <button type="button" onClick={() => setMenuOpen((v) => !v)} className="h-8 px-2 rounded-md border border-slate-200 text-[10px] font-bold text-slate-600 bg-white">
                  Menu
                </button>
              </div>
            </div>

            {menuOpen && (
              <div className="border border-slate-100 rounded-md p-2 space-y-1.5 bg-slate-50">
                {scanning && (
                  <button type="button" className="h-8 text-[10px] font-bold text-slate-600 px-2 rounded-md border border-slate-200 bg-white" onClick={() => void hub.stopScan().then(() => bump((n) => n + 1))}>
                    Stop scan
                  </button>
                )}
                {connected.length > 0 && (
                  <ul className="space-y-1">
                    {connected.map((c) => (
                      <li key={c.deviceId} className="grid grid-cols-[1fr_auto] items-center gap-1.5 min-w-0">
                        <span className="truncate font-medium text-[11px] text-slate-800 min-w-0">{c.name}</span>
                        <button type="button" className="h-7 text-[10px] font-bold text-red-700 bg-white border border-red-200 rounded-md px-2" onClick={() => void handleDisconnect(c.deviceId)}>
                          Disconnect
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {scanList.length > 0 && (
                  <ul className="max-h-24 overflow-y-auto space-y-1">
                    {scanList.map((d) => (
                      <li key={d.deviceId} className="grid grid-cols-[1fr_auto] items-center gap-1.5 min-w-0">
                        <span className="truncate text-[11px] text-slate-700 min-w-0">{d.name}</span>
                        <button
                          type="button"
                          disabled={connected.some((c) => c.deviceId === d.deviceId)}
                          className="h-7 text-[10px] font-bold text-blue-700 bg-white border border-blue-200 rounded-md px-2 disabled:text-slate-400 disabled:border-slate-100"
                          onClick={() => void handleConnect(d.deviceId, d.name)}
                        >
                          Connect
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {prefs.lastConnectedDevices.length > 0 && (
                  <div className="grid grid-cols-[1fr_auto] gap-1">
                    <span className="text-[10px] text-slate-500 self-center">Saved {prefs.lastConnectedDevices.length}</span>
                    <button type="button" className="h-7 px-2 text-[10px] font-bold text-red-600 border border-red-200 rounded-md bg-white" onClick={forgetAllSavedDevices}>
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="grid grid-cols-[auto_1fr] gap-2 items-center min-w-0">
            <span className="text-[10px] font-semibold text-slate-500 shrink-0">Level</span>
            <div className="flex w-full min-w-0 items-center gap-1">
              {FITNESS_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFitnessLevel(id)}
                  className={`h-8 min-w-0 flex-1 flex items-center justify-center px-1 rounded-md text-[10px] font-bold border whitespace-nowrap ${
                    prefs.fitnessLevel === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                  }`}
                  style={prefs.fitnessLevel === id ? { WebkitTextFillColor: '#ffffff' } : { WebkitTextFillColor: '#334155' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-1">
            <button type="button" className="h-8 flex items-center gap-1 text-[11px] font-bold text-slate-700" onClick={() => setCalibrationOpen((v) => !v)}>
              <ChevronDown size={14} className={`transition-transform ${calibrationOpen ? 'rotate-180' : ''}`} />
              Calibration
            </button>
            {calibrationOpen && (
              <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center pl-5">
                {!calibRunning ? (
                  <>
                    <button type="button" onClick={startCalibration} className="h-8 text-[10px] font-bold bg-slate-800 text-white px-2 rounded-md">
                      Start Test
                    </button>
                    <span className="text-[10px] text-slate-500">{prefs.calibrationAvgRpm != null ? `${prefs.calibrationAvgRpm} RPM` : ''}</span>
                    {prefs.calibrationAvgRpm != null && (
                      <button
                        type="button"
                        className="h-7 px-2 text-[10px] font-bold text-blue-600 border border-blue-200 rounded-md bg-white"
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
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-[13px] font-black text-blue-700 tabular-nums">{calibLeftSec}s</span>
                    <span className="text-[10px] text-emerald-600">{testFinished ? 'Done' : ''}</span>
                    <button type="button" onClick={cancelCalibration} className="h-7 px-2 text-[10px] font-bold text-slate-600 border border-slate-200 rounded-md bg-white">
                      Cancel
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="space-y-1">
            <button type="button" className="h-8 flex items-center gap-1 text-[11px] font-bold text-slate-700" onClick={() => setAdvancedOpen((v) => !v)}>
              <ChevronDown size={14} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              Advanced
            </button>
            {advancedOpen && (
              <div className="pl-5 grid grid-cols-2 gap-2 items-center">
                <span className="text-[10px] text-slate-500">Bike</span>
                <select
                  className="h-8 px-2 rounded-md border border-slate-200 text-[11px] bg-white"
                  value={prefs.bikeProfile === 'unset' || prefs.bikeProfile === 'custom' ? 'spinbike' : prefs.bikeProfile}
                  onChange={(e) => setBikeProfile(e.target.value as Exclude<BikeProfile, 'unset' | 'custom'>)}
                >
                  {BIKE_PROFILE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <span className="text-[10px] text-slate-500">Reconnect</span>
                <label className="h-8 px-2 rounded-md border border-slate-200 flex items-center gap-2 text-[11px] bg-white">
                  <input type="checkbox" checked={prefs.autoReconnectEnabled} onChange={(e) => setAutoReconnect(e.target.checked)} />
                  Auto
                </label>

                <span className="text-[10px] text-slate-500">Merge</span>
                <select
                  className="h-8 px-2 rounded-md border border-slate-200 text-[11px] bg-white"
                  value={prefs.speedCadenceBlendMode}
                  onChange={(e) => setBlendMode(e.target.value as IndoorSensorPrefs['speedCadenceBlendMode'])}
                >
                  <option value="auto">Auto</option>
                  <option value="speed">Speed</option>
                  <option value="cadence">Cadence</option>
                </select>

                <span className="text-[10px] text-slate-500">Default</span>
                <div className="flex items-center gap-1">
                  <button type="button" className="h-8 px-2 text-[10px] font-bold text-blue-700 border border-blue-200 rounded-md bg-white" onClick={saveCurrentModeAsDefault}>
                    Save
                  </button>
                  <span className="text-[10px] text-slate-400">{prefs.preferredRideMode === 'sensor' ? 'Sensor' : 'Manual'}</span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
