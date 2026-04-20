import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Gauge, Bluetooth, BluetoothOff, Scan, ChevronDown, ChevronUp } from 'lucide-react';
import { getIndoorBleHub } from './sensor/indoorBleHub';
import type { IndoorSensorPrefs } from './sensor/sensorPrefs';

type ConnState = 'disconnected' | 'scanning' | 'connected';

export type SensorsModalProps = {
  open: boolean;
  onClose: () => void;
  prefs: IndoorSensorPrefs;
  onChangePrefs: (next: IndoorSensorPrefs) => void;
};

export const SensorsModal: React.FC<SensorsModalProps> = ({ open, onClose, prefs, onChangePrefs }) => {
  const hub = useMemo(() => getIndoorBleHub(), []);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [, bump] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const connState: ConnState = useMemo(() => {
    if (scanning) return 'scanning';
    if (connected.length > 0) return 'connected';
    return 'disconnected';
  }, [scanning, connected.length]);

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
      const next = { ...prefsRef.current, sensorDriveEnabled: true };
      onChangePrefs(next);
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
      if (hub.connectedCount() === 0) {
        const next = { ...prefsRef.current, sensorDriveEnabled: false };
        onChangePrefs(next);
      }
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Disconnect failed.');
    }
  };

  const startCalibration = () => {
    if (calibRunning) return;
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
          const next = { ...prefsRef.current, calibrationAvgRpm: Math.round(avg * 10) / 10, calibrationAt: Date.now() };
          onChangePrefs(next);
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

  const setLoadHint = (loadHint: IndoorSensorPrefs['loadHint']) => {
    onChangePrefs({ ...prefsRef.current, loadHint });
  };

  const setSensorDrive = (sensorDriveEnabled: boolean) => {
    onChangePrefs({ ...prefsRef.current, sensorDriveEnabled });
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
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Connection</div>
            <div className="flex items-center gap-2 text-[12px]">
              {connState === 'connected' ? (
                <Bluetooth size={16} className="text-emerald-600 shrink-0" />
              ) : connState === 'scanning' ? (
                <Bluetooth size={16} className="text-amber-500 animate-pulse shrink-0" />
              ) : (
                <BluetoothOff size={16} className="text-slate-400 shrink-0" />
              )}
              <span>
                {connState === 'disconnected' && 'Disconnected'}
                {connState === 'scanning' && 'Scanning…'}
                {connState === 'connected' && `Connected (${connected.length})`}
              </span>
            </div>
            {connected.length > 0 && (
              <ul className="mt-1 space-y-1">
                {connected.map((c) => (
                  <li key={c.deviceId} className="flex items-center justify-between gap-2 bg-slate-50 rounded px-2 py-1">
                    <span className="truncate font-medium text-[11px]">{c.name}</span>
                    <button
                      type="button"
                      className="text-[10px] font-bold text-red-600 hover:underline shrink-0"
                      onClick={() => void handleDisconnect(c.deviceId)}
                    >
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleScan()}
                disabled={scanning}
                className="flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white text-[11px] font-bold disabled:opacity-50"
              >
                <Scan size={14} />
                {scanning ? 'Scanning…' : 'Scan'}
              </button>
              {scanning && (
                <button type="button" className="text-[11px] text-slate-500 underline" onClick={() => void hub.stopScan().then(() => bump((n) => n + 1))}>
                  Stop scan
                </button>
              )}
            </div>
            {scanList.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto border border-slate-100 rounded divide-y divide-slate-100">
                {scanList.map((d) => (
                  <li key={d.deviceId} className="flex items-center justify-between px-2 py-1 gap-2">
                    <span className="truncate text-[11px] font-medium">{d.name}</span>
                    <button
                      type="button"
                      disabled={connected.some((c) => c.deviceId === d.deviceId)}
                      className="text-[10px] font-bold text-blue-600 disabled:text-slate-300 shrink-0"
                      onClick={() => void handleConnect(d.deviceId, d.name)}
                    >
                      Connect
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!scanning && scanList.length === 0 && (
              <p className="text-[10px] text-slate-400 mt-1">No devices in list yet. Tap Scan, then choose your sensor or trainer.</p>
            )}
          </section>

          <section>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Live</div>
            <div className="flex items-baseline gap-3">
              <div>
                <span className="text-[28px] font-black text-slate-900 tabular-nums">{rpmDisplay}</span>
                <span className="text-[11px] font-bold text-slate-500 ml-1">RPM</span>
              </div>
              {wattDisplay != null && (
                <div>
                  <span className="text-[18px] font-black text-slate-800 tabular-nums">{wattDisplay}</span>
                  <span className="text-[11px] font-bold text-slate-500 ml-1">W</span>
                </div>
              )}
            </div>
          </section>

          {dualBadge && (
            <div className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-1">
              Dual sensors: speed + cadence
            </div>
          )}

          <section>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">1-minute calibration</div>
            <p className="text-[10px] text-slate-500 leading-snug mb-1">
              Set the bike to <strong>highest resistance</strong>, then pedal hard for one minute. We store your <strong>average RPM</strong> as your personal anchor.
            </p>
            {!calibRunning ? (
              <button type="button" onClick={startCalibration} className="text-[11px] font-bold bg-slate-800 text-white px-2 py-1 rounded">
                Start 1-minute test
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-black text-blue-700 tabular-nums">{calibLeftSec}s</span>
                <button type="button" onClick={cancelCalibration} className="text-[11px] text-slate-500 underline">
                  Cancel
                </button>
              </div>
            )}
            {prefs.calibrationAvgRpm != null && (
              <p className="text-[11px] text-slate-600 mt-1">
                Saved average: <strong>{prefs.calibrationAvgRpm}</strong> RPM
                <button
                  type="button"
                  className="ml-2 text-blue-600 font-bold"
                  onClick={() => {
                    const next = { ...prefs, calibrationAvgRpm: null, calibrationAt: null };
                    onChangePrefs(next);
                  }}
                >
                  Clear
                </button>
              </p>
            )}
          </section>

          <section className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold">Sensor-driven speed</span>
            <button
              type="button"
              onClick={() => setSensorDrive(!prefs.sensorDriveEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${prefs.sensorDriveEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
              aria-pressed={prefs.sensorDriveEnabled}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prefs.sensorDriveEnabled ? 'translate-x-5' : ''}`}
              />
            </button>
          </section>

          <section>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Load hint</div>
            <div className="flex gap-1">
              {(['light', 'normal', 'heavy'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setLoadHint(h)}
                  className={`flex-1 py-1 rounded text-[10px] font-bold border ${
                    prefs.loadHint === h ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {h[0].toUpperCase() + h.slice(1)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <button type="button" className="flex items-center gap-1 text-[11px] font-bold text-slate-600" onClick={() => setAdvancedOpen((v) => !v)}>
              {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Advanced
            </button>
            {advancedOpen && (
              <div className="mt-2 space-y-1 pl-1 border-l-2 border-slate-100">
                <p className="text-[10px] text-slate-500 mb-1">Speed / cadence merge priority</p>
                {(['auto', 'speed', 'cadence'] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-[11px] cursor-pointer">
                    <input type="radio" name="blend" checked={prefs.speedCadenceBlendMode === m} onChange={() => setBlendMode(m)} />
                    <span>{m === 'auto' ? 'Auto (default)' : m === 'speed' ? 'Speed priority' : 'Cadence priority'}</span>
                  </label>
                ))}
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
