// about.tsx
import React from "react";

interface AboutProps {
  onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
  return (
    /* Background Overlay */
    <div className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm overflow-y-auto">

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-[52px] flex items-center bg-white/90 backdrop-blur border-b border-slate-200 z-20 px-4">
        <button
          onClick={onClose}
          className="text-slate-800 font-semibold hover:opacity-70"
        >
          ← <span className="ml-2">Back to Simulator</span>
        </button>
      </header>

      {/* Center Wrapper (Margin Controller) */}
      <div className="pt-[72px] pb-12 px-4 sm:px-6">

        {/* Document Card */}
        <main
          className="
            mx-auto
            max-w-[720px]
            bg-white
            rounded-xl
            shadow-xl
            px-6
            sm:px-8
            py-8
            text-slate-800
            leading-relaxed
          "
        >

          {/* Title */}
          <h1 className="text-2xl font-bold mb-2">
            Cycle Simulator
          </h1>

          <p className="text-slate-700 mb-5">
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

          {/* Technology */}
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
            <p>
              This application is for educational and fitness purposes only.
            </p>
          </Section>

          {/* Footer */}
          <p className="text-sm text-slate-500 text-center mt-10">
            © 2026 Cycle Simulator
          </p>

        </main>
      </div>
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
          text-lg
          font-semibold
          text-blue-700
          border-b
          border-slate-200
          pb-2
          mb-3
        "
      >
        {title}
      </h2>

      <div className="text-slate-700 space-y-2">
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