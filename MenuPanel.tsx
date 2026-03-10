import React, { useEffect } from "react";
import { ChevronRight, ChevronLeft, X } from "lucide-react";

const APP_NAME = "Ride the World – Indoor Cycling";

const docTitle = "text-base font-bold text-slate-900 mt-4 mb-2 first:mt-0";
const docBody = "text-sm text-slate-700 leading-relaxed mb-2";
const docList = "list-disc pl-5 space-y-1 text-sm text-slate-700 mb-2";

function SimpleGuideContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Quick Guide</h2>
      <p className={docBody}>1) Select two points on the map to set the start and destination.</p>
      <p className={docBody}>2) Choose the travel mode. (Car / Bike / Foot)</p>
      <p className={docBody}>3) Press the Go! button to start the ride.</p>
    </div>
  );
}

function UserGuideContent() {
  return (
    <div className="pb-6 space-y-2">
      <h2 className={docTitle}>Detailed Guide</h2>
      <p className={docBody}>This guide explains the main features of Ride the World – Indoor Cycling. You can choose real-world routes and simulate them indoors with elevation and Street View.</p>
      <h3 className={docTitle}>1. App Overview</h3>
      <p className={docBody}>Plan bike / walk / car routes on real maps, view elevation along the route, watch Street View, and simulate the ride indoors at your chosen speed. Data: OpenStreetMap, OSRM, Open-Elevation API.</p>
      <h3 className={docTitle}>2. Getting Started</h3>
      <p className={docBody}>The route panel is in the bottom-left. Set Start and End (type addresses with autocomplete, or click the map and use START / WAYPOINT / END in the popup).</p>
      <h3 className={docTitle}>3. Route and Speed</h3>
      <p className={docBody}>Choose Car, Bike, or Foot. Set speed 10–70 km/h. Use the star to save routes to My Routes (up to 5). Press Go to start; first time shows a countdown.</p>
      <h3 className={docTitle}>4. During the Ride</h3>
      <p className={docBody}>Use Play / Pause, Restart, Stop in the elevation panel. Step back / Fast forward buttons move along the route. Toggle Street View and elevation chart from the controls.</p>
      <h3 className={docTitle}>5. Menu</h3>
      <p className={docBody}>About, Guide (Simple Guide, User Guide), Settings, Legal (Privacy, Terms, Disclaimer, Licenses), and Contact are available from the menu.</p>
    </div>
  );
}

function SettingsContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Settings</h2>
      <p className={docBody}>Settings screen will be available here in a future update.</p>
    </div>
  );
}

function AboutContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>About</h2>
      <p className={docBody}>Ride the World – Indoor Cycling lets you plan cycling routes on real maps, check elevation, and simulate the chosen route indoors. Last updated: March 2026.</p>
      <h3 className={docTitle}>1. App Overview</h3>
      <p className={docBody}>Set a route anywhere in the world and experience it on your indoor bike.</p>
      <h3 className={docTitle}>2. Main Features</h3>
      <ul className={docList}>
        <li>Route planning on real maps (start, end, waypoints; car, bike, foot)</li>
        <li>Elevation analysis and chart along the route</li>
        <li>Ride simulation with speed control</li>
        <li>Street View along the route</li>
        <li>AI coaching and background music (when available)</li>
      </ul>
      <h3 className={docTitle}>3. Who It's For</h3>
      <ul className={docList}>
        <li>Cyclists planning new routes</li>
        <li>Users who want to preview routes or check elevation</li>
        <li>Users who want to simulate routes from around the world indoors</li>
      </ul>
      <h3 className={docTitle}>4. Data Sources and Credits</h3>
      <p className={docBody}>Map data: OpenStreetMap (© OpenStreetMap contributors). Routing: OSRM. Geocoding: Nominatim. Elevation: Open-Elevation API. Street View: subject to the respective service terms. Icons: Lucide Icons.</p>
      <h3 className={docTitle}>5. Disclaimer</h3>
      <p className={docBody}>This App is for route exploration, simulation, and fitness entertainment only. Do not use for real outdoor navigation or safety decisions. Use at your own risk. See Disclaimer and Terms of Service in the menu.</p>
      <p className={`${docBody} font-semibold`}>Ride the World – Indoor Cycling © 2026 LiveOnSoft</p>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Privacy Policy</h2>
      <p className={docBody}>Ride the World – Indoor Cycling. Last updated: March 2026.</p>
      <h3 className={docTitle}>1. Overview</h3>
      <p className={docBody}>The App provides indoor cycling route simulation and map and route exploration. Developer: LiveOnSoft. The App does not store personal information on its own servers.</p>
      <h3 className={docTitle}>2. Information Collected and Used</h3>
      <p className={docBody}>Route search input (start, end, waypoints) and place search terms are used for route search, map display, and elevation. Location may be used once with your consent to set the map center; not sent to our servers. We do not collect name, email, phone, account, or payment information. No login or registration required.</p>
      <h3 className={docTitle}>3. Stored Data (On Device)</h3>
      <p className={docBody}>favorite_routes: saved routes for My Routes. recent_places: recent search terms. Stored only in your browser (localStorage). Clearing storage removes this data.</p>
      <h3 className={docTitle}>4. Third-Party Services</h3>
      <p className={docBody}>OpenStreetMap/Nominatim, OSRM, Open-Elevation, Google Maps/Street View are used. Search terms, coordinates, and IP may be sent to those services under their policies. We do not sell or share data with ad networks or data brokers.</p>
      <h3 className={docTitle}>5. Your Rights and Policy Changes</h3>
      <p className={docBody}>You can delete saved routes in My Routes and revoke location in browser/device settings. This policy may be updated; continued use constitutes acceptance.</p>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Terms of Service</h2>
      <p className={docBody}>Last updated: March 2026.</p>
      <h3 className={docTitle}>1. Application and Acceptance</h3>
      <p className={docBody}>These Terms govern the relationship between LiveOnSoft (“Operator”) and users of Ride the World – Indoor Cycling. Using the App constitutes acceptance. No registration or login required.</p>
      <h3 className={docTitle}>2. Definition of the Service</h3>
      <p className={docBody}>The App provides indoor cycling route simulation and map and route exploration (route search, elevation, ride simulation, Street View, saved routes, AI coaching, etc.). Content and scope may change without notice. The Operator does not guarantee continuity, completeness, or accuracy.</p>
      <h3 className={docTitle}>3. Eligibility and Use Restrictions</h3>
      <p className={docBody}>Use only for personal, non-commercial purposes. Commercial use, reverse engineering, crawling, and use that violates laws or others’ rights are prohibited.</p>
      <h3 className={docTitle}>4. Third-Party Data and Liability</h3>
      <p className={docBody}>Route, map, and elevation data are provided by third parties; we do not guarantee accuracy. Do not use for real outdoor navigation or safety. The Operator disclaims liability for injury, loss, or damage from use of the App or its data, to the extent permitted by law.</p>
      <h3 className={docTitle}>5. Changes</h3>
      <p className={docBody}>Terms may be amended. Continued use after changes constitutes acceptance of the updated terms.</p>
    </div>
  );
}

function DisclaimerContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Disclaimer</h2>
      <p className={docBody}>Last updated: March 2026.</p>
      <h3 className={docTitle}>1. Purpose and Nature of the App</h3>
      <p className={docBody}>The App is provided only for indoor cycling route simulation and entertainment. Content is for reference, experience, and motivation; not as an official basis for real-road riding or training.</p>
      <h3 className={docTitle}>2. Medical and Health</h3>
      <p className={docBody}>The App is not a substitute for professional medical or exercise advice. Consult a physician before starting or changing an exercise program. If you experience dizziness, difficulty breathing, chest pain, or muscle or joint pain, stop and seek medical care. The developers accept no responsibility for such symptoms or resulting harm.</p>
      <h3 className={docTitle}>3. Accuracy of Data</h3>
      <p className={docBody}>Routes, distance, elevation, and time are approximations and may differ from actual conditions. Do not rely on this App alone for outdoor riding or elevation measurement.</p>
      <h3 className={docTitle}>4. Outdoor Use and Safety</h3>
      <p className={docBody}>Do not use the App for navigation or safety decisions on real roads. Use official navigation, maps, and traffic rules. The developers are not responsible for accidents or injury from following the App’s routes outdoors.</p>
      <h3 className={docTitle}>5. Limitation of Liability</h3>
      <p className={docBody}>The developers and Operator disclaim all liability, to the extent permitted by law, for bodily injury, death, property loss, or other damage from use of the App or reliance on its content. Use at your own risk.</p>
    </div>
  );
}

function LicensesContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Open Source Licenses</h2>
      <p className={docBody}>Last updated: March 2026. This App is built using open source software. Full license texts can be found in the respective project repositories or npm.</p>
      <h3 className={docTitle}>2. Open Source Software Used</h3>
      <p className={docBody}>Runtime: react, react-dom (MIT), lucide-react (ISC), recharts (MIT). Development: typescript (Apache-2.0), vite, @vitejs/plugin-react, tailwindcss, postcss, autoprefixer (MIT), @types/node (MIT).</p>
      <h3 className={docTitle}>3. Summary of Main Licenses</h3>
      <p className={docBody}>MIT: Use, copy, modify, distribute with license and copyright notice. Apache-2.0: Similar with change notice and license text. ISC: Similarly permissive with notice. This App complies with the above terms. For exact text, see each package’s official repository or npm.</p>
    </div>
  );
}

function ContactContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Contact</h2>
      <p className={docBody}>Ride the World – Indoor Cycling is developed and operated by LiveOnSoft. Last updated: March 2026.</p>
      <h3 className={docTitle}>1. Overview</h3>
      <p className={docBody}>For inquiries about the App, privacy, terms, open source licenses, bugs, or suggestions, use the channels below.</p>
      <h3 className={docTitle}>2. How to Contact</h3>
      <p className={docBody}>In the App: Use the Contact item in the menu. Store or official page: Use the contact information on the App’s store page or LiveOnSoft’s official project or website. Project repository: For technical questions, bug reports, or feature suggestions, use the repository’s issue or contact channel (e.g. GitHub) when available. Specific email or URL may vary; refer to the latest information in the App or on the store/official page.</p>
      <h3 className={docTitle}>3. Response</h3>
      <p className={docBody}>We will respond when possible but do not guarantee response time or that a response will be provided. The App does not require registration or does not store account information on our servers; for account-related questions, refer to the relevant store policy.</p>
      <p className={`${docBody} font-semibold`}>LiveOnSoft – Developer and operator of Ride the World – Indoor Cycling © 2026</p>
    </div>
  );
}

export type MenuView =
  | "list"
  | "about"
  | "guideSimple"
  | "guideDetail"
  | "settings"
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
  legalExpanded?: boolean;
  setLegalExpanded?: (v: boolean) => void;
}

export default function MenuPanel({
  open,
  onClose,
  onOpenAbout,
  menuView,
  setMenuView,
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

  const viewMap: Record<Exclude<MenuView, "list">, React.ReactNode> = {
    about: <AboutContent />,
    guideSimple: <SimpleGuideContent />,
    guideDetail: <UserGuideContent />,
    settings: <SettingsContent />,
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
            <ul className="py-2 text-slate-800 list-none pl-0">
              <li>
                <button
                  onClick={() => setMenuView("about")}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  About
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

              <li className="pt-1">
                <div className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Guide</div>
                <ul className="border-l-2 border-slate-200 ml-4 pl-4 my-0.5 list-none">
                  <li>
                    <button
                      onClick={() => setMenuView("guideSimple")}
                      className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Quick Guide
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setMenuView("guideDetail")}
                      className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Detailed Guide
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                </ul>
              </li>

              <li>
                <button
                  onClick={() => setMenuView("settings")}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Settings
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

              <li className="pt-1">
                <div className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Legal</div>
                <ul className="border-l-2 border-slate-200 ml-4 pl-4 my-0.5 list-none">
                  <li>
                    <button
                      onClick={() => setMenuView("privacy")}
                      className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Privacy Policy
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setMenuView("terms")}
                      className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Terms of Service
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setMenuView("disclaimer")}
                      className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Disclaimer
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setMenuView("licenses")}
                      className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Open Source Licenses
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                </ul>
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
            <div className="px-4 py-4 pb-8 text-slate-800 leading-relaxed overflow-y-auto">
              {viewMap[menuView]}
            </div>
          )}

        </div>

        {/* footer */}

        <div className="px-4 py-3 border-t text-xs text-slate-500 text-center">
          {APP_NAME}
          <br />
          Version 1.0
        </div>

      </div>
    </>
  );
}