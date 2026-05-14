import React, { useState } from 'react';
import { Bike, X } from 'lucide-react';
import type { BikeProfile } from './sensor/sensorPrefs';
import { BIKE_PROFILE_CIRCUMFERENCE_MM } from './sensor/sensorPrefs';

const OPTIONS: { id: Exclude<BikeProfile, 'unset' | 'custom'>; label: string; hint: string }[] = [
  { id: 'road700c', label: 'Road bike (700c)', hint: '가장 일반적인 로드/하이브리드' },
  { id: 'mtb29', label: 'MTB 29"', hint: '29er 산악자전거' },
  { id: 'mtb275', label: 'MTB 27.5"', hint: '27.5인치 산악자전거' },
  { id: 'mtb26', label: 'MTB 26"', hint: '26인치 산악자전거' },
  { id: 'spinbike', label: 'Indoor / spin bike', hint: '실내 전용 스핀바이크' },
];

export type BikeProfileModalProps = {
  open: boolean;
  onSave: (profile: Exclude<BikeProfile, 'unset'>, circumferenceMm: number) => void;
  onDismiss: () => void;
};

export const BikeProfileModal: React.FC<BikeProfileModalProps> = ({ open, onSave, onDismiss }) => {
  const [selected, setSelected] = useState<Exclude<BikeProfile, 'unset' | 'custom'>>('spinbike');

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/50 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bike-profile-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-[360px] w-full text-slate-800 border border-slate-200">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
          <h2 id="bike-profile-title" className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Bike size={18} className="text-emerald-600" />
            Speed sensor detected
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="Skip for now"
            title="Skip"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3 py-3 space-y-3 text-[12px]">
          <p className="text-slate-600 leading-snug">
            Which bike are you using? We&apos;ll use this to convert wheel speed into real km/h.
          </p>

          <div className="space-y-1.5">
            {OPTIONS.map((opt) => (
              <label
                key={opt.id}
                title={opt.label}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selected === opt.id ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="bike-profile"
                  className="shrink-0"
                  checked={selected === opt.id}
                  onChange={() => {
                    setSelected(opt.id);
                    onSave(opt.id, BIKE_PROFILE_CIRCUMFERENCE_MM[opt.id]);
                  }}
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-slate-800">{opt.label}</div>
                  <div className="text-[10px] text-slate-500">{opt.hint}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onDismiss}
              title="Set later"
              className="w-full px-3 py-1.5 text-[12px] font-bold text-slate-600 bg-white border border-slate-200 rounded-md active:scale-[0.98]"
            >
              I&apos;ll set later
            </button>
          </div>

          <p className="text-[10px] text-slate-400 leading-snug">
            You can change this any time in Sensors → Advanced.
          </p>
        </div>
      </div>
    </div>
  );
};
