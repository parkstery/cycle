// about.tsx
import React from "react";

interface AboutProps {
  onClose: () => void;
}

const HEADER_HEIGHT = 52;

const About: React.FC<AboutProps> = ({ onClose }) => {
  return (
    /* Full white background */
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
          Cycle Simulator
        </h1>

        <p className="text-slate-700 mb-6">
          Virtual cycling simulation with real-world maps and AI coaching.
        </p>

        {/* Features */}
        <Section title="Features">
          <ul className="list-disc list-inside space-y-1">
            <li>Virtual riding worldwide</li>
            <li>Gradient simulation</li>
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

        {/* Disclaimer */}
        <Section title="Disclaimer">
          <p className="text-slate-700">
            This application is for educational and fitness purposes only.
          </p>
        </Section>

        {/* Footer */}
        <p className="text-sm text-slate-600 text-center mt-12">
          © 2026 Cycle Simulator
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