import React, { useEffect } from "react";
import { ChevronRight, ChevronDown, ChevronLeft, X } from "lucide-react";

const APP_NAME = "Ride the World – Indoor Cycling";

function HelpContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">How to use</h3>
      <p className="mb-3">
        Choose a route on the map or search for a destination. Start the ride to begin indoor cycling with elevation and distance based on your selection.
      </p>
      <h3 className="font-semibold text-slate-900 mb-2">Controls</h3>
      <p className="mb-3">
        Use Play/Pause to control the simulation. You can adjust speed, view the elevation chart, and use street view where available.
      </p>
      <p>
        For more details, see the About screen from the menu.
      </p>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Privacy Policy</h3>
      <p className="mb-3">
        This app may use your location and map search input only to provide route and elevation data. No personal data is stored on our servers unless you explicitly save routes in the app.
      </p>
      <p className="mb-3">
        Third-party services (e.g. maps, elevation APIs) have their own privacy policies; we recommend reviewing them when using those features.
      </p>
      <p>
        We do not sell or share your data with advertisers. This policy may be updated; continued use of the app constitutes acceptance.
      </p>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Terms of Service</h3>
      <p className="mb-3">
        By using Ride the World – Indoor Cycling you agree to use the app for personal, non-commercial indoor training only. You must not misuse the service or attempt to access systems or data you are not authorised to use.
      </p>
      <p className="mb-3">
        Route and map data are provided by third parties; we do not guarantee accuracy or availability. Use at your own risk, especially when planning outdoor activities.
      </p>
      <p>
        We may change these terms from time to time. Your continued use of the app after changes constitutes acceptance of the updated terms.
      </p>
    </>
  );
}

function DisclaimerContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Disclaimer</h3>
      <p className="mb-3">
        This app is for indoor cycling simulation and entertainment only. It is not a substitute for professional medical or fitness advice. Consult a doctor before starting or changing any exercise program.
      </p>
      <p className="mb-3">
        Elevation, distance, and route data are approximate and may differ from real-world conditions. Do not rely on this app for navigation or safety-critical decisions outdoors.
      </p>
      <p>
        The developers are not liable for any injury, loss, or damage arising from use of this app or the data it displays.
      </p>
    </>
  );
}

function LicensesContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Open Source Licenses</h3>
      <p className="mb-3">
        This application uses open source software. Key components may include (depending on build):
      </p>
      <ul className="list-disc pl-5 space-y-1 mb-3">
        <li>React – MIT License</li>
        <li>Lucide React (icons) – ISC License</li>
        <li>Vite – MIT License</li>
        <li>Google Maps / APIs – Google Terms of Service</li>
      </ul>
      <p>
        Full license texts are available in the app repository or from the respective projects. We do not claim ownership of third-party open source code; all rights remain with their authors.
      </p>
    </>
  );
}

function ContactContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Contact</h3>
      <p className="mb-3">
        For support, feedback, or legal inquiries regarding Ride the World – Indoor Cycling, please use the contact method provided in the app store listing or the official project page.
      </p>
      <p>
        We aim to respond to reasonable requests in a timely manner. Please include a clear subject and description so we can help you effectively.
      </p>
    </>
  );
}

export type MenuView =
  | "list"
  | "help"
  | "privacy"
  | "terms"
  | "disclaimer"
  | "licenses"
  | "contact";

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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  const isList = menuView === "list";

  const backToMenu = () => {
    setMenuView("list");
  };

  const viewMap = {
    help: <HelpContent />,
    privacy: <PrivacyContent />,
    terms: <TermsContent />,
    disclaimer: <DisclaimerContent />,
    licenses: <LicensesContent />,
    contact: <ContactContent />,
  };

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-[10001] bg-black/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* panel */}
      <div
        className="fixed left-0 top-0 bottom-0 z-[10002] w-[88%] max-w-[360px] bg-white shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* navigation */}
        <header className="border-b border-slate-200">

          <div className="flex items-center justify-between px-4 h-10 text-sm">

            <button
              onClick={backToMenu}
              className="flex items-center gap-1 text-slate-700"
            >
              <ChevronLeft size={18} />
              Back to Menu
            </button>

            <button
              onClick={onClose}
              className="flex items-center gap-1 text-slate-700"
            >
              Back to Simulator
              <X size={18} />
            </button>

          </div>

          <div className="h-12 flex items-center px-4 font-semibold text-slate-900">
            {isList ? "Menu" : "Information"}
          </div>

        </header>

        {/* content */}
        <div className="flex-1 overflow-y-auto">

          {isList ? (
            <ul className="py-2 text-slate-800">

              <li>
                <button
                  onClick={() => {
                    onOpenAbout();
                    onClose();
                  }}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  About
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

              <li>
                <button
                  onClick={() => setMenuView("help")}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Help
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

              {/* legal section */}

              <li>
                <button
                  onClick={() => setLegalExpanded(!legalExpanded)}
                  aria-expanded={legalExpanded}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Legal
                  {legalExpanded ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} className="text-slate-400" />
                  )}
                </button>

                {legalExpanded && (
                  <ul className="ml-6 border-l border-slate-200">

                    {[
                      { key: "privacy", label: "Privacy Policy" },
                      { key: "terms", label: "Terms of Service" },
                      { key: "disclaimer", label: "Disclaimer" },
                      { key: "licenses", label: "Open Source Licenses" },
                    ].map(({ key, label }) => (
                      <li key={key}>
                        <button
                          onClick={() => setMenuView(key as MenuView)}
                          className="w-full text-left pl-4 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          {label}
                        </button>
                      </li>
                    ))}

                  </ul>
                )}
              </li>

              <li>
                <button
                  onClick={() => setMenuView("contact")}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Contact
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

            </ul>
          ) : (
            <div className="px-4 py-4 pb-8 text-sm text-slate-800 leading-relaxed">
              {viewMap[menuView as keyof typeof viewMap]}
            </div>
          )}

        </div>

        {/* footer */}

        <div className="px-4 py-3 border-t text-xs text-slate-500">
          {APP_NAME}
          <br />
          Version 1.0
        </div>

      </div>
    </>
  );
}