import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Gauge, Bluetooth, BluetoothOff, Scan, ChevronDown } from 'lucide-react';
import { getIndoorBleHub } from './sensor/indoorBleHub';
import type { FitnessLevel, IndoorSensorPrefs, BikeProfile } from './sensor/sensorPrefs';
import { upsertSavedDevice, BIKE_PROFILE_CIRCUMFERENCE_MM } from './sensor/sensorPrefs';
import { initialCapacityFromTestRpm } from './sensor/effortModel';
import { cadenceChannelValid } from './sensor/dualMerge';

type ConnState = 'disconnected' | 'scanning' | 'connected' | 'reconnecting';

const FITNESS_OPTIONS: { id: FitnessLevel; label: string }[] = [
  { id: 'veryLow', label: '1' },
  { id: 'low', label: '2' },
  { id: 'medium', label: '3' },
  { id: 'high', label: '4' },
  { id: 'veryHigh', label: '5' },
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
  const [calibRunning, setCalibRunning] = useState(false);
  /** 캘리브레이션 직후 사용자 안내 (성공/실패 요약) */
  const [calibResultMessage, setCalibResultMessage] = useState<string | null>(null);
  const [calibLeftSec, setCalibLeftSec] = useState(0);
  const calibSamplesRef = useRef<number[]>([]);
  const calibTimerRef = useRef<number | null>(null);
  const calibSecRef = useRef(0);
  /** 캘리브레이션 중 라이브 RPM 표시용 주기 리렌더 */
  const [calibUiRev, setCalibUiRev] = useState(0);

  useEffect(() => {
    return hub.subscribe(() => bump((n) => n + 1));
  }, [hub]);

  useEffect(() => {
    if (!calibRunning) return;
    const id = window.setInterval(() => setCalibUiRev((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [calibRunning]);

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

  /** 이미 Connected에 나온 장치는 Found에서 숨김(연결 시 중복 표시 방지) */
  const foundDevicesNotYetConnected = useMemo(
    () => scanList.filter((d) => !connected.some((c) => c.deviceId === d.deviceId)),
    [scanList, connected]
  );

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
    setCalibResultMessage(null);
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
          const capRounded = Math.round(cap * 10) / 10;
          const next = {
            ...prefsRef.current,
            calibrationAvgRpm: avgRounded,
            calibrationAt: Date.now(),
            capacityRpm: cap,
          };
          onChangePrefs(next);
          setCalibResultMessage(
            `Calibration done: average ${avgRounded} RPM · personal capacity set to ~${capRounded} RPM.`
          );
        } else {
          setCalibResultMessage(
            'No cadence samples over 10 RPM. Pedal steadily during the test and try again.'
          );
        }
      }
    }, 1000);
  };

  const cancelCalibration = () => {
    if (calibTimerRef.current) window.clearInterval(calibTimerRef.current);
    calibTimerRef.current = null;
    setCalibRunning(false);
    setCalibLeftSec(0);
    setCalibResultMessage(null);
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

  const calibSnap = calibRunning ? hub.buildSnapshot() : null;
  const showCalibCadenceRpm = calibSnap != null && cadenceChannelValid(calibSnap);
  void calibUiRev;

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
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Close" title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-3 py-2 text-[12px]">
          {initError && <p className="text-red-600 text-[11px] leading-snug mb-2">{initError}</p>}
          {actionError && <p className="text-red-600 text-[11px] leading-snug mb-2">{actionError}</p>}

          <section className="grid grid-cols-[auto_1fr] gap-2 items-center min-w-0 pb-3">
            <span className="text-[12px] font-semibold text-slate-500 shrink-0">* Riding Mode</span>
            <div className="flex w-full min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setSensorDrive(false)}
                title="Manual (no sensor)"
                className={`h-8 min-w-0 flex-1 flex items-center justify-center px-1 rounded-md text-[12px] font-bold border whitespace-nowrap ${
                  !prefs.sensorDriveEnabled ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                }`}
                style={!prefs.sensorDriveEnabled ? { WebkitTextFillColor: '#ffffff' } : { WebkitTextFillColor: '#334155' }}
              >
                Manual(No Sensor)
              </button>
              <button
                type="button"
                onClick={() => setSensorDrive(true)}
                title="Sensor mode"
                className={`h-8 min-w-0 flex-1 flex items-center justify-center px-1 rounded-md text-[12px] font-bold border whitespace-nowrap ${
                  prefs.sensorDriveEnabled ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                }`}
                style={prefs.sensorDriveEnabled ? { WebkitTextFillColor: '#ffffff' } : { WebkitTextFillColor: '#334155' }}
              >
                Sensor Mode
              </button>
            </div>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-3 pb-3">
            <div className="text-[12px] font-semibold text-slate-500">* Sensor Connection</div>
            <div className="min-w-0 flex items-center gap-2 text-[11px]">
              {connState === 'connected' ? <Bluetooth size={15} className="text-emerald-600 shrink-0" /> : connState === 'scanning' || connState === 'reconnecting' ? <Bluetooth size={15} className="text-amber-500 animate-pulse shrink-0" /> : <BluetoothOff size={15} className="text-slate-400 shrink-0" />}
              <span className="truncate font-semibold text-slate-700">
                {connState === 'disconnected' && `Disconnected | ${connectedLabel}`}
                {connState === 'scanning' && `Scanning... | ${connectedLabel}`}
                {connState === 'reconnecting' && `${autoPhase === 'connecting' ? 'Connecting...' : autoPhase === 'waiting' ? 'Waiting...' : 'Auto-scan...'} | ${connectedLabel}`}
                {connState === 'connected' && `Connected (${connected.length}) | ${connectedLabel}`}
              </span>
            </div>

            <div className="border border-slate-100 rounded-md p-2 space-y-1.5 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => void handleScan()}
                  disabled={scanning}
                  title="Scan for sensors"
                  className="h-8 min-w-0 flex-1 flex items-center justify-center gap-1 px-2 rounded-md bg-blue-600 text-white text-[12px] font-bold disabled:opacity-50"
                >
                  <Scan size={13} />
                  Scan
                </button>
                {scanning && (
                  <button
                    type="button"
                    className="h-8 shrink-0 px-2 text-[11px] font-bold text-slate-600 rounded-md border border-slate-200 bg-white whitespace-nowrap"
                    title="Stop scan"
                    onClick={() => void hub.stopScan().then(() => bump((n) => n + 1))}
                  >
                    Stop scan
                  </button>
                )}
              </div>
              {connected.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Connected</div>
                  <ul className="space-y-1">
                    {connected.map((c) => (
                      <li key={c.deviceId} className="grid grid-cols-[1fr_auto] items-center gap-1.5 min-w-0">
                        <span className="truncate font-medium text-[11px] text-slate-800 min-w-0">{c.name}</span>
                        <button type="button" title="Disconnect" className="h-7 text-[12px] font-bold text-red-700 bg-white border border-red-200 rounded-md px-2" onClick={() => void handleDisconnect(c.deviceId)}>
                          Disconnect
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {foundDevicesNotYetConnected.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Found</div>
                  <ul className="max-h-28 overflow-y-auto space-y-1">
                    {foundDevicesNotYetConnected.map((d) => (
                      <li key={d.deviceId} className="grid grid-cols-[1fr_auto] items-center gap-1.5 min-w-0">
                        <span className="truncate text-[11px] text-slate-700 min-w-0">{d.name}</span>
                        <button
                          type="button"
                          disabled={connected.some((c) => c.deviceId === d.deviceId)}
                          title="Connect"
                          className="h-7 text-[12px] font-bold text-blue-700 bg-white border border-blue-200 rounded-md px-2 disabled:text-slate-400 disabled:border-slate-100"
                          onClick={() => void handleConnect(d.deviceId, d.name)}
                        >
                          Connect
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!scanning && connected.length === 0 && scanList.length === 0 && (
                <p className="text-[11px] text-slate-500 text-center py-2">Tap Scan to find nearby sensors.</p>
              )}
            </div>
          </section>

          <section className="grid grid-cols-[auto_1fr] gap-2 items-center min-w-0 border-t border-slate-200 pt-3 pb-3">
            <span className="text-[12px] font-bold text-slate-500 shrink-0">* Your Fittness</span>
            <div className="flex w-full min-w-0 items-center gap-1">
              {FITNESS_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFitnessLevel(id)}
                  title={label}
                  className={`h-8 min-w-0 flex-1 flex items-center justify-center px-1 rounded-md text-[12px] font-bold border whitespace-nowrap ${
                    prefs.fitnessLevel === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
                  }`}
                  style={prefs.fitnessLevel === id ? { WebkitTextFillColor: '#ffffff' } : { WebkitTextFillColor: '#334155' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-1 border-t border-slate-200 pt-3 pb-1">
            <button type="button" title="More options" className="h-8 flex items-center gap-1 text-[12px] font-bold text-slate-700" onClick={() => setAdvancedOpen((v) => !v)}>
              <ChevronDown size={14} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              Others
            </button>
            {advancedOpen && (
              <div className="pl-5 space-y-3">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-500">Sensor Calibration (Optional)</div>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    Capacity is auto-tuned while you ride; this 1-minute test only gives a more accurate starting point.
                  </p>
                  {!calibRunning ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                        <button type="button" onClick={startCalibration} title="Start calibration test" className="h-8 text-[12px] font-bold bg-gray-700 hover:bg-gray-600 text-white px-2 rounded-md border border-gray-800 shadow-sm">
                          Start Test
                        </button>
                        <span className="text-[10px] text-slate-500">{prefs.calibrationAvgRpm != null ? `${prefs.calibrationAvgRpm} RPM` : ''}</span>
                        {prefs.calibrationAvgRpm != null && (
                          <button
                            type="button"
                            title="Clear calibration"
                            className="h-7 px-2 text-[12px] font-bold text-blue-600 border border-blue-200 rounded-md bg-white"
                            onClick={() => {
                              const next = {
                                ...prefsRef.current,
                                calibrationAvgRpm: null,
                                calibrationAt: null,
                                capacityRpm: null,
                              };
                              onChangePrefs(next);
                              setCalibResultMessage(null);
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {calibResultMessage && (
                        <p className="text-[11px] font-medium text-emerald-700 leading-snug pr-1">{calibResultMessage}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-[13px] font-black text-blue-700 tabular-nums w-[2.75rem]">{calibLeftSec}s</span>
                      <span className="flex-1 min-w-0 text-center text-[12px] font-bold tabular-nums text-slate-800">
                        {showCalibCadenceRpm && calibSnap!.cadenceRpm != null
                          ? `${Math.round(calibSnap.cadenceRpm)} RPM`
                          : '\u00a0'}
                      </span>
                      <button type="button" onClick={cancelCalibration} title="Cancel" className="shrink-0 h-7 px-2 text-[12px] font-bold text-slate-600 border border-slate-200 rounded-md bg-white">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

              <div className="grid grid-cols-2 gap-2 items-center">
                <span className="text-[10px] text-slate-500">Bike</span>
                <select
                  className="h-8 px-2 rounded-md border border-slate-200 text-[11px] bg-white"
                  title="Bike type"
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
                <label className="h-8 px-2 rounded-md border border-slate-200 flex items-center gap-2 text-[11px] bg-white" title="Auto reconnect">
                  <input type="checkbox" checked={prefs.autoReconnectEnabled} onChange={(e) => setAutoReconnect(e.target.checked)} title="Auto reconnect" />
                  Auto
                </label>

                <span className="text-[10px] text-slate-500">Sensor Speed Merge</span>
                <select
                  className="h-8 px-2 rounded-md border border-slate-200 text-[11px] bg-white"
                  title="Speed blend mode"
                  value={prefs.speedCadenceBlendMode}
                  onChange={(e) => setBlendMode(e.target.value as IndoorSensorPrefs['speedCadenceBlendMode'])}
                >
                  <option value="auto">Auto</option>
                  <option value="speed">Speed</option>
                  <option value="cadence">Cadence</option>
                </select>

                <span className="text-[10px] font-bold text-slate-500">Selected Riding Mode</span>
                <div className="flex items-center gap-1">
                  <button type="button" className="h-8 px-2 text-[12px] font-bold text-blue-700 border border-blue-200 rounded-md bg-white" title="Save default ride mode" onClick={saveCurrentModeAsDefault}>
                    Save
                  </button>
                  <span className="text-[10px] text-slate-400">{prefs.preferredRideMode === 'sensor' ? 'Sensor' : 'Manual'}</span>
                </div>
              </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
