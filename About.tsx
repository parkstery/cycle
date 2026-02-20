// about.tsx
import React from "react";

interface AboutProps {
  onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
  return (
    /* Overlay */
    <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm">

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-[52px] flex items-center bg-transparent z-20 px-4">
        <button
          onClick={onClose}
          className="text-slate-900 font-semibold hover:opacity-70"
        >
          ← <span className="ml-2">Back to Simulator</span>
        </button>
      </header>

      {/* Scroll + Padding Controller (중요) */}
      <div
        className="
          absolute
          inset-0
          overflow-y-auto
          pt-[72px]
          pb-12
          px-6
        "
      >

        {/* Content Area */}
        <main
          className="
            max-w-[720px]
            mx-auto
            text-slate-900
            leading-relaxed
          "
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