import React from 'react';
import { ChevronRight, ChevronDown, X } from 'lucide-react';

const APP_NAME = 'Ride the World – Indoor Cycling';

export type MenuView = 'list' | 'help' | 'privacy' | 'terms' | 'disclaimer' | 'licenses' | 'contact';

interface MenuPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenAbout: () => void;
  menuView: MenuView;
  setMenuView: (v: MenuView) => void;
  legalExpanded: boolean;
  setLegalExpanded: (v: boolean) => void;
}

export default function MenuPanel({
  open,
  onClose,
  onOpenAbout,
  menuView,
  setMenuView,
  legalExpanded,
  setLegalExpanded,
}: MenuPanelProps) {
  if (!open) return null;

  const backToList = () => setMenuView('list');

  const isList = menuView === 'list';

  return (
    <>
      <div
        className="fixed inset-0 z-[10001] bg-black/40"
        aria-hidden="true"
        onClick={onClose}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      />
      <div
        className="fixed left-0 top-0 bottom-0 z-[10002] w-[85%] max-w-[320px] bg-white shadow-2xl overflow-hidden flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        role="dialog"
        aria-label="Menu"
      >
        <header className="flex items-center justify-between shrink-0 h-12 px-4 border-b border-slate-200">
          {isList ? (
            <span className="font-semibold text-slate-900">Menu</span>
          ) : (
            <button
              type="button"
              onClick={backToList}
              className="text-slate-700 font-medium flex items-center gap-1"
            >
              <ChevronRight className="w-5 h-5 rotate-180" /> Back
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-full"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {isList ? (
            <ul className="py-2 text-slate-800">
              <li>
                <button
                  type="button"
                  onClick={() => { onOpenAbout(); onClose(); }}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  About
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setMenuView('help')}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Help
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>
              <li>
                <div>
                  <button
                    type="button"
                    onClick={() => setLegalExpanded(!legalExpanded)}
                    className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                  >
                    Legal
                    {legalExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} className="text-slate-400" />}
                  </button>
                  {legalExpanded && (
                    <ul className="bg-slate-50 border-t border-slate-100 pl-6">
                      {[
                        { key: 'privacy' as const, label: 'Privacy Policy' },
                        { key: 'terms' as const, label: 'Terms of Service' },
                        { key: 'disclaimer' as const, label: 'Disclaimer' },
                        { key: 'licenses' as const, label: 'Open Source Licenses' },
                      ].map(({ key, label }) => (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => setMenuView(key)}
                            className="w-full text-left pl-4 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
                          >
                            {label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setMenuView('contact')}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Contact
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>
            </ul>
          ) : (
            <div className="px-4 py-4 pb-8 text-slate-800 text-sm leading-relaxed">
              {menuView === 'help' && <HelpContent />}
              {menuView === 'privacy' && <PrivacyContent />}
              {menuView === 'terms' && <TermsContent />}
              {menuView === 'disclaimer' && <DisclaimerContent />}
              {menuView === 'licenses' && <LicensesContent />}
              {menuView === 'contact' && <ContactContent />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function HelpContent() {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Help / User Guide</h2>
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-800">1. Map Navigation</h3>
        <p>Move the map by dragging or zooming in and out.</p>
        <h3 className="font-semibold text-slate-800">2. Setting a Route</h3>
        <p>Click two points on the map to set start (A) and destination (B). You can also search for places. Add waypoints if needed, choose travel mode (car, bike, walking), set speed, then tap Go to start the simulation.</p>
        <h3 className="font-semibold text-slate-800">3. Simulation</h3>
        <p>Use play/pause and stop. Street View shows the road ahead. You can toggle full screen and view elevation profile.</p>
        <h3 className="font-semibold text-slate-800">4. Map Services</h3>
        <p>The app may use multiple map services. Each may display the same location slightly differently.</p>
        <h3 className="font-semibold text-slate-800">5. Location Permission</h3>
        <p>The app may request location to show your position. You can change this in your device settings.</p>
        <h3 className="font-semibold text-slate-800">6. Safety Notice</h3>
        <p>Map information is for reference only. Always be aware of your surroundings and safety in real-world activities.</p>
      </div>
    </section>
  );
}

function PrivacyContent() {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Privacy Policy</h2>
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-800">1. Introduction</h3>
        <p>{APP_NAME} (“the App”) respects user privacy. This policy explains what information may be used and for what purposes.</p>
        <h3 className="font-semibold text-slate-800">2. Information We Use</h3>
        <p><strong>Location:</strong> The App may access device location for map-based services (e.g. GPS or network positioning).</p>
        <p><strong>Device:</strong> Basic device and app version information may be used to maintain functionality.</p>
        <h3 className="font-semibold text-slate-800">3. Purpose of Use</h3>
        <p>Information may be used to provide map and location-based services, display routes, and improve stability.</p>
        <h3 className="font-semibold text-slate-800">4. Data Storage and Sharing</h3>
        <p>The App does not store personal data on external servers and does not sell or share personal information with third parties.</p>
        <h3 className="font-semibold text-slate-800">5. Third-Party Services</h3>
        <p>The App may use Google Maps, OpenStreetMap (e.g. Nominatim), OSRM, Open-Elevation, TMap Mobility, and similar services. Each has its own privacy policy.</p>
        <h3 className="font-semibold text-slate-800">6. User Choices</h3>
        <p>You may disable location in device settings or uninstall the App.</p>
        <h3 className="font-semibold text-slate-800">7. Children’s Privacy</h3>
        <p>The App is not intended for children under 13.</p>
        <h3 className="font-semibold text-slate-800">8. Policy Changes</h3>
        <p>This policy may be updated when necessary. Changes will be announced in the App or related channels.</p>
      </div>
    </section>
  );
}

function TermsContent() {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Terms of Service</h2>
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-800">1. Purpose</h3>
        <p>These Terms govern the use of {APP_NAME} (“the App”) between you and the developer.</p>
        <h3 className="font-semibold text-slate-800">2. Service Description</h3>
        <p>The App provides map-based location display, route display, and indoor cycling simulation. The developer may modify features at any time.</p>
        <h3 className="font-semibold text-slate-800">3. Use of the Service</h3>
        <p>You agree to use the App in compliance with applicable laws. You may not interfere with operation, use it for illegal purposes, or copy, modify, or distribute the software without permission.</p>
        <h3 className="font-semibold text-slate-800">4. Modification or Termination</h3>
        <p>The developer may modify or suspend the service for maintenance, technical issues, or policy changes. The developer is not liable for damages from service interruptions.</p>
        <h3 className="font-semibold text-slate-800">5. Disclaimer</h3>
        <p>The App is for reference only. You are responsible for your decisions and actions. The developer is not responsible for inaccuracies in map or location data, GPS errors, accidents, or device or network issues.</p>
        <h3 className="font-semibold text-slate-800">6. Intellectual Property</h3>
        <p>Software, design, and related content are owned by the developer. You may not copy, modify, or distribute without permission.</p>
        <h3 className="font-semibold text-slate-800">7. Changes to the Terms</h3>
        <p>Terms may be updated when necessary. Changes will be announced in the App or related channels.</p>
      </div>
    </section>
  );
}

function DisclaimerContent() {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Disclaimer</h2>
      <p>Information provided by {APP_NAME} is for reference purposes only.</p>
      <p>Map, location, and route information may differ from real-world conditions.</p>
      <p>You should always follow traffic laws and ensure personal safety.</p>
      <p>The developer is not responsible for accidents, injuries, or damages resulting from use of the App.</p>
    </section>
  );
}

function LicensesContent() {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Open Source Licenses</h2>
      <p>This App may use open-source software and services, including but not limited to:</p>
      <ul className="list-disc list-inside space-y-1">
        <li>OpenStreetMap &amp; Nominatim</li>
        <li>OSRM (Open Source Routing Machine)</li>
        <li>Open-Elevation</li>
        <li>React, Vite, and other front-end libraries</li>
        <li>Map and icon libraries</li>
      </ul>
      <p>Each component is used under its respective license. For details, please refer to each project’s official site.</p>
    </section>
  );
}

function ContactContent() {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">Contact</h2>
      <p><strong>Developer:</strong> LiveOnSoft</p>
      <p><strong>Email:</strong> <a href="mailto:liveonsoft@gmail.com" className="text-blue-600 underline">liveonsoft@gmail.com</a></p>
    </section>
  );
}
