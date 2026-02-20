// about.tsx
import React from "react";

interface AboutProps {
  onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 text-white overflow-y-auto backdrop-blur-md">

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-[52px] flex items-center bg-slate-900/95 backdrop-blur-md border-b border-white/10 z-10 px-4">
        <button
          onClick={onClose}
          className="text-white text-lg font-semibold hover:opacity-70"
        >
          ← <span className="ml-2">Back to Simulator</span>
        </button>
      </header>

      {/* Container (HTML body 역할) */}
      <main
        className="
          pt-[80px]
          px-6
          pb-10
          max-w-[720px]
          mx-auto
          leading-relaxed
        "
      >

        {/* Title */}
        <h1 className="text-[24px] font-bold mt-12 mb-2">
          Cycle Simulator
        </h1>

        <p className="text-slate-300 text-[15px] mb-4">
          An immersive indoor cycling experience powered by Google Maps Street View.
          Ride anywhere in the world with real-time slope analysis and AI coaching.
        </p>

        {/* Features */}
        <Section title="Features">

          <ul className="list-disc list-inside space-y-1">
            <li>Virtual riding on any route worldwide</li>
            <li>Real-time gradient simulation</li>
            <li>Street View playback</li>
            <li>Elevation analysis</li>
          </ul>

        </Section>

        {/* Tech */}
        <Section title="Technology Stack">

          <Credit title="Frontend">
            React, TypeScript, Vite, Tailwind
          </Credit>

          <Credit title="Maps & Data">
            Google Maps Platform
          </Credit>

        </Section>

        {/* Credits */}
        <Section title="Credits & Licenses">

          <Credit title="Map Data">
            © Google / OpenStreetMap
          </Credit>

          <Credit title="Routing">
            OSRM
          </Credit>

          <Credit title="Elevation">
            Open-Elevation
          </Credit>

        </Section>

        {/* Disclaimer */}
        <Section title="Disclaimer">

          <p className="text-slate-300 text-[15px]">
            This application is for educational and fitness purposes only.
          </p>

        </Section>

        {/* Footer */}
        <p className="text-xs text-slate-500 text-center mt-10">
          Cycle Simulator © 2026
        </p>

      </main>
    </div>
  );
};

export default About;


/* ===== Sub Components ===== */

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
          text-[18px]
          font-semibold
          text-slate-400
          border-b
          border-white/10
          pb-2
          mb-3
        "
      >
        {title}
      </h2>

      <div className="text-[15px] text-slate-300 space-y-2">
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

      <div className="font-semibold text-white">
        {title}
      </div>

      <div className="text-slate-300">
        {children}
      </div>

    </div>
  );
}