// about.tsx
import React, { useState } from "react";

type AboutSubview = "about" | "help" | "licenses" | "contact";

interface AboutProps {
  onClose: () => void;
}

const HEADER_HEIGHT = 52;

const NAV_ITEMS: { key: AboutSubview; label: string }[] = [
  { key: "about", label: "About" },
  { key: "help", label: "Help" },
  { key: "licenses", label: "Licenses" },
  { key: "contact", label: "Contact" },
];

const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const GOOGLE_MAPS_TERMS = "https://cloud.google.com/maps-platform/terms";
const OSRM_LICENCE = "https://osmfoundation.org/wiki/Licence/Attribution_Guidelines";
const OPEN_ELEVATION_URL = "https://www.open-elevation.com/";
const LUCIDE_URL = "https://lucide.dev/";

const About: React.FC<AboutProps> = ({ onClose }) => {
  const [view, setView] = useState<AboutSubview>("about");

  return (
    <div
      className="min-h-screen bg-white box-border"
      style={{
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        paddingRight: "max(16px, env(safe-area-inset-right))",
        paddingBottom: "max(24px, env(safe-area-inset-bottom))",
      }}
    >
      <header
        className="fixed left-0 right-0 flex items-center z-20 px-4 bg-white border-b border-slate-200"
        style={{
          top: 0,
          minHeight: HEADER_HEIGHT,
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: 12,
        }}
      >
        <button
          onClick={onClose}
          className="text-slate-900 font-semibold hover:opacity-70"
        >
          ← <span className="ml-2">Back to Simulator</span>
        </button>
      </header>

      <div
        aria-hidden
        style={{
          minHeight: HEADER_HEIGHT,
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: 12,
        }}
      />

      <main
        className="max-w-[720px] mx-auto pt-4 pb-12 text-slate-900 leading-relaxed"
        style={{ paddingLeft: 24, paddingRight: 24 }}
      >
        {/* Navigation: About / Help / Licenses / Contact */}
        <nav className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-3">
          {NAV_ITEMS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === key
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {view === "about" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Cycle Simulator</h1>
            <p className="text-slate-700 mb-6">
              Virtual cycling simulation with real-world maps and AI coaching.
            </p>
            <Section title="Features">
              <ul className="list-disc list-inside space-y-1">
                <li>Virtual riding worldwide</li>
                <li>Gradient simulation</li>
                <li>Street View playback</li>
                <li>Elevation analysis</li>
              </ul>
            </Section>
            <Section title="Technology Stack">
              <Credit title="Frontend">
                React, TypeScript, Vite, Tailwind
              </Credit>
              <Credit title="Maps & Data">
                Google Maps Platform (maps, Street View), Nominatim (geocoding), OSRM (routing), Open-Elevation (elevation). See Licenses for attributions.
              </Credit>
            </Section>
            <Section title="Disclaimer">
              <p className="text-slate-700">
                This application is for educational and fitness purposes only.
              </p>
            </Section>
          </>
        )}

        {view === "help" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Help</h1>
            <Section title="How to use">
              <ol className="list-decimal list-inside space-y-2 text-slate-700">
                <li>Tap the route (waypoints) button at the bottom left to open route settings.</li>
                <li>Enter Start and End (and optional waypoints), then tap Go to search for a route.</li>
                <li>After the route is drawn, tap Go again to start the simulation with Street View.</li>
                <li>Use the elevation panel on the right to see the profile and control playback (play/pause, step).</li>
                <li>Use the map style and Street View buttons at the top right to switch map type and toggle Street View.</li>
              </ol>
            </Section>
          </>
        )}

        {view === "licenses" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Licenses &amp; Attributions</h1>
            <p className="text-slate-700 mb-6">
              This app uses the following services and data. Please see each provider’s terms and attribution requirements.
            </p>
            <Section title="OpenStreetMap">
              <p className="text-slate-700 mb-2">
                Map data and geocoding/routing data derived from <strong>OpenStreetMap</strong> and its <strong>contributors</strong> (ODbL).
              </p>
              <p className="text-slate-700">
                <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  OpenStreetMap copyright and attribution
                </a>
              </p>
            </Section>
            <Section title="Google Maps Platform">
              <p className="text-slate-700 mb-2">
                Maps and Street View: © Google.
              </p>
              <p className="text-slate-700">
                <a href={GOOGLE_MAPS_TERMS} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Google Maps Platform Terms
                </a>
              </p>
            </Section>
            <Section title="OSRM (Open Source Routing Machine)">
              <p className="text-slate-700 mb-2">
                Route calculations use OSRM. Route data © OpenStreetMap contributors.
              </p>
              <p className="text-slate-700">
                <a href={OSRM_LICENCE} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  OSM attribution guidelines
                </a>
              </p>
            </Section>
            <Section title="Open-Elevation">
              <p className="text-slate-700 mb-2">
                Elevation data provided by Open-Elevation.
              </p>
              <p className="text-slate-700">
                <a href={OPEN_ELEVATION_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  open-elevation.com
                </a>
              </p>
            </Section>
            <Section title="Lucide">
              <p className="text-slate-700">
                UI icons by <a href={LUCIDE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Lucide</a>.
              </p>
            </Section>
          </>
        )}

        {view === "contact" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Contact</h1>
            <Section title="Support &amp; feedback">
              <p className="text-slate-700">
                For questions, support, or feedback about Cycle Simulator, please use the app store or distribution channel where you obtained the app, or refer to the project repository if applicable.
              </p>
            </Section>
          </>
        )}

        <p className="text-sm text-slate-600 text-center mt-12">
          © 2026 Cycle Simulator
        </p>
      </main>
    </div>
  );
};

export default About;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 mb-6">
      <h2 className="text-lg font-semibold text-blue-700 border-b border-slate-300 pb-2 mb-3">
        {title}
      </h2>
      <div className="text-slate-800 space-y-2">{children}</div>
    </section>
  );
}

function Credit({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="text-slate-700">{children}</div>
    </div>
  );
}
