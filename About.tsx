import React from 'react';

interface AboutProps {
  onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[100] bg-[#0f172a] overflow-y-auto"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      {/* Header */}
      <header
        className="fixed top-0 left-0 right-0 h-[52px] flex items-center bg-[#0f172a]/95 backdrop-blur-md border-b border-white/10 z-10"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <button
          onClick={onClose}
          className="bg-transparent border-none text-white text-[20px] px-4 cursor-pointer hover:opacity-70 transition-opacity"
          aria-label="Back"
        >
          ←
        </button>
        <div className="text-[16px] font-semibold text-white">About</div>
      </header>

      {/* Main */}
      <main className="pt-[72px] px-5 pb-8 max-w-[720px] mx-auto">
        {/* App Info */}
        <section className="mb-5">
          <h1 className="text-[22px] mb-2 text-white font-semibold">Cycle Simulator</h1>
          <p className="my-1.5 text-slate-200">
            Virtual cycling simulation based on real-world map and street data.
          </p>
        </section>

        {/* Credits */}
        <section className="mb-5">
          <h2 className="text-[18px] mt-8 mb-3 border-b border-white/15 pb-1 text-white font-semibold">
            Data & Credits
          </h2>

          <div className="mb-2.5">
            <div className="font-semibold text-white">Maps & Street View</div>
            <p className="my-1.5 text-slate-200">Google Maps Platform</p>
          </div>

          <div className="mb-2.5">
            <div className="font-semibold text-white">Geocoding</div>
            <p className="my-1.5 text-slate-200">Nominatim (OpenStreetMap)</p>
          </div>

          <div className="mb-2.5">
            <div className="font-semibold text-white">Routing</div>
            <p className="my-1.5 text-slate-200">OSRM (Data © OpenStreetMap contributors)</p>
          </div>

          <div className="mb-2.5">
            <div className="font-semibold text-white">Elevation</div>
            <p className="my-1.5 text-slate-200">Open-Elevation</p>
          </div>
        </section>

        {/* Legal */}
        <section className="mb-5">
          <h2 className="text-[18px] mt-8 mb-3 border-b border-white/15 pb-1 text-white font-semibold">
            Legal
          </h2>

          <p className="my-1.5 text-slate-200">
            This application uses third-party services and map data.
            All rights belong to their respective owners.
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
