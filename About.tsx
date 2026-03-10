// about.tsx
import React from "react";

interface AboutProps {
  onClose: () => void;
  /** 메뉴에서 진입했을 때만 전달. 있으면 "Back to Menu" 버튼 표시 */
  onBackToMenu?: () => void;
}

const HEADER_HEIGHT = 52;

const About: React.FC<AboutProps> = ({ onClose, onBackToMenu }) => {
  return (
    <div
      className="min-h-screen bg-white box-border"
      style={{
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        paddingRight: "max(16px, env(safe-area-inset-right))",
        paddingBottom: "max(24px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Header */}
      <header
        className="fixed left-0 right-0 flex items-center justify-between gap-2 z-20 px-4 bg-white border-b border-slate-200"
        style={{
          top: 0,
          minHeight: HEADER_HEIGHT,
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: 12,
        }}
      >
        <div className="flex items-center">
          {onBackToMenu ? (
            <button
              onClick={onBackToMenu}
              className="text-slate-700 font-medium hover:opacity-70"
            >
              ← <span className="ml-1">Back to Menu</span>
            </button>
          ) : (
            <span aria-hidden />
          )}
        </div>
        <div className="flex items-center">
          <button
            onClick={onClose}
            className="text-slate-700 font-medium hover:opacity-70"
          >
            <span>Back to Simulator</span>
            <span className="ml-1">×</span>
          </button>
        </div>
      </header>

      {/* Spacer */}
      <div
        aria-hidden
        style={{
          minHeight: HEADER_HEIGHT,
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: 12,
        }}
      />

      {/* Content */}
      <main
        className="max-w-[720px] mx-auto pt-4 pb-12 text-slate-900 leading-relaxed"
        style={{
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        {/* Title */}
        <h1 className="text-2xl font-bold mb-2">
          Ride the World – Indoor Cycling
        </h1>

        <p className="text-slate-700 mb-6">
          Cycling route planner and map-based ride simulator with elevation analysis.
        </p>

        {/* Features */}
        <Section title="Key Features">
          <ul className="list-disc list-inside space-y-1">
            <li>Cycling route planner on real-world maps</li>
            <li>Bike route exploration with interactive map</li>
            <li>Elevation profile for climbs and descents</li>
            <li>Ride simulation along selected routes</li>
          </ul>
        </Section>

        {/* Use Cases */}
        <Section title="Who This App Is For">
          <ul className="list-disc list-inside space-y-1">
            <li>Cyclists planning new bike routes</li>
            <li>Riders exploring unfamiliar cycling areas</li>
            <li>Users checking elevation before a ride</li>
            <li>Anyone interested in cycling route maps</li>
          </ul>
        </Section>

        {/* Data Sources */}
        <Section title="Data Sources">
          <Credit title="Map Data">
            OpenStreetMap contributors
          </Credit>

          <Credit title="Routing Engine">
            OSRM (Open Source Routing Machine)
          </Credit>

          <Credit title="Elevation Data">
            Open-Elevation API
          </Credit>

          <Credit title="Map Rendering">
            Leaflet JS
          </Credit>

          <Credit title="Icons">
            Lucide Icons
          </Credit>
        </Section>

        {/* Disclaimer */}
        <Section title="Disclaimer">
          <p className="text-slate-700">
            Ride the World – Indoor Cycling is provided for route exploration and simulation
            purposes only.
          </p>

          <p className="text-slate-700">
            Map data, routes, and elevation information may contain
            inaccuracies and may not reflect real-world conditions such
            as road closures, construction, or traffic restrictions.
          </p>

          <p className="text-slate-700">
            Users must follow local traffic laws and ensure their own
            safety when cycling. The developer assumes no responsibility
            for any loss, damage, or injury resulting from the use of
            this application.
          </p>
        </Section>

        {/* Footer */}
        <p className="text-sm text-slate-600 text-center mt-12">
          © 2026 LiveOnSoft
        </p>
      </main>
    </div>
  );
};

export default About;


/* ---------- Components ---------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 mb-6">
      <h2
        className="
          text-lg
          font-semibold
          text-blue-700
          border-b
          border-slate-300
          pb-2
          mb-3
        "
      >
        {title}
      </h2>

      <div className="text-slate-800 space-y-2">
        {children}
      </div>
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
      <div className="font-semibold text-slate-900">
        {title}
      </div>

      <div className="text-slate-700">
        {children}
      </div>
    </div>
  );
}