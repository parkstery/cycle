// about.tsx
import React from 'react';

interface AboutProps {
  onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/95 text-white overflow-y-auto backdrop-blur-md"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      {/* Header */}
      <header
        className="fixed top-0 left-0 right-0 h-[52px] flex items-center bg-slate-900/95 backdrop-blur-md border-b border-white/10 z-10 px-4"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <button
          onClick={onClose}
          className="bg-transparent border-none text-white text-xl p-0 mr-2 cursor-pointer hover:opacity-70 transition-opacity"
          aria-label="Back"
        >
          ←
        </button>
        <div className="text-base font-semibold">About</div>
      </header>

      {/* Main */}
      <main className="pt-[72px] px-5 pb-8 max-w-[720px] mx-auto">
        {/* App Info */}
        <section className="mb-5">
          <h1 className="text-[22px] mb-2 font-semibold">Cycle Simulator</h1>
          <p className="my-1.5 text-slate-200">
            Virtual cycling simulation combining real-world map & street data with AI coaching.
          </p>
        </section>

        {/* Key Features */}
        <section className="mb-5">
          <h2 className="text-lg mt-8 mb-3 border-b border-white/15 pb-1 font-semibold">
            Key Features
          </h2>
          <ul className="list-disc list-inside space-y-1 text-slate-200">
            <li>Route calculation (OSRM) for cycling and walking</li>
            <li>Street View playback along route</li>
            <li>Elevation-based AI coaching with TTS</li>
            <li>Route search, place search (Nominatim), traffic layer (Google)</li>
            <li>Favorite routes, background music, speed control</li>
          </ul>
        </section>

        {/* Credits */}
        <section className="mb-5">
          <h2 className="text-lg mt-8 mb-3 border-b border-white/15 pb-1 font-semibold">
            Data & Credits
          </h2>
          <div className="mb-2.5">
            <div className="font-semibold">Maps & Street View</div>
            <p className="my-1.5 text-slate-200">Google Maps Platform</p>
          </div>
          <div className="mb-2.5">
            <div className="font-semibold">Geocoding</div>
            <p className="my-1.5 text-slate-200">Nominatim (OpenStreetMap)</p>
          </div>
          <div className="mb-2.5">
            <div className="font-semibold">Routing</div>
            <p className="my-1.5 text-slate-200">OSRM (Data © OpenStreetMap contributors)</p>
          </div>
          <div className="mb-2.5">
            <div className="font-semibold">Elevation</div>
            <p className="my-1.5 text-slate-200">Open-Elevation</p>
          </div>
        </section>

        {/* Legal */}
        <section className="mb-5">
          <h2 className="text-lg mt-8 mb-3 border-b border-white/15 pb-1 font-semibold">Legal</h2>
          <p className="my-1.5 text-slate-200">
            This application uses third-party services and map data. All rights belong to their respective owners.
          </p>
          <p className="my-1.5 text-slate-200">
            Map data © OpenStreetMap contributors.
          </p>
        </section>

        {/* Footer */}
        <div className="mt-10 text-xs text-slate-400 text-center">
          © 2026 Cycle Simulator
        </div>
      </main>
    </div>
  );
};

export default About;
