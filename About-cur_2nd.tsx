import React from 'react';

interface AboutProps {
  onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-900 overflow-y-auto" 
      style={{ 
        paddingTop: 'env(safe-area-inset-top)', 
        paddingRight: 'env(safe-area-inset-right)', 
        paddingBottom: 'env(safe-area-inset-bottom)', 
        paddingLeft: 'env(safe-area-inset-left)' 
      }}
    >
      {/* Header */}
      <header 
        className="fixed top-0 left-0 right-0 h-[52px] flex items-center bg-slate-900/95 backdrop-blur-md border-b border-white/10 z-10" 
        style={{ 
          paddingTop: 'env(safe-area-inset-top)', 
          paddingLeft: 'env(safe-area-inset-left)', 
          paddingRight: 'env(safe-area-inset-right)' 
        }}
      >
        <button
          onClick={onClose}
          className="bg-transparent border-none text-white text-xl p-0 px-4 cursor-pointer hover:opacity-70 transition-opacity"
          aria-label="Back"
        >
          ←
        </button>
        <div className="text-base font-semibold text-white">About</div>
      </header>

      {/* Main */}
      <main className="pt-[72px] px-5 pb-8 max-w-[720px] mx-auto">
        {/* App Info */}
        <section className="mb-5">
          <h1 className="text-[22px] mb-2 text-white font-semibold">Cycle Simulator</h1>
          <p className="my-1.5 text-slate-200">
            Virtual cycling simulation based on real-world map and street data.
          </p>
          <p className="my-1.5 text-slate-300 text-sm">
            A PWA mobile GIS application that provides bicycle and walking route simulation with Street View integration, 
            elevation-based AI coaching, and route planning features.
          </p>
        </section>

        {/* Features */}
        <section className="mb-5">
          <h2 className="text-lg mt-8 mb-3 border-b border-white/15 pb-1 text-white font-semibold">Features</h2>
          <ul className="list-disc list-inside space-y-1.5 text-slate-200 text-sm">
            <li>Interactive map with route planning (origin, destination, waypoints)</li>
            <li>Real-time Street View integration during simulation</li>
            <li>Elevation profile chart with route visualization</li>
            <li>AI coaching based on slope and resistance</li>
            <li>Place search and location information</li>
            <li>Favorite routes (save up to 5 routes)</li>
            <li>Background music and TTS coaching</li>
          </ul>
        </section>

        {/* Technology Stack */}
        <section className="mb-5">
          <h2 className="text-lg mt-8 mb-3 border-b border-white/15 pb-1 text-white font-semibold">Technology</h2>
          <div className="mb-2.5">
            <div className="font-semibold text-white">Frontend</div>
            <p className="my-1.5 text-slate-200 text-sm">React 18.2, TypeScript 5.2, Vite 5, Tailwind CSS 3.3</p>
          </div>
          <div className="mb-2.5">
            <div className="font-semibold text-white">Libraries</div>
            <p className="my-1.5 text-slate-200 text-sm">Recharts (elevation chart), Lucide React (icons)</p>
          </div>
          <div className="mb-2.5">
            <div className="font-semibold text-white">Deployment</div>
            <p className="my-1.5 text-slate-200 text-sm">Vercel (SPA + Serverless API)</p>
          </div>
        </section>

        {/* Data & Credits */}
        <section className="mb-5">
          <h2 className="text-lg mt-8 mb-3 border-b border-white/15 pb-1 text-white font-semibold">Data & Credits</h2>

          <div className="mb-2.5">
            <div className="font-semibold text-white">Maps & Street View</div>
            <p className="my-1.5 text-slate-200">Google Maps Platform</p>
            <p className="my-1 text-slate-400 text-xs">
              <a 
                href="https://cloud.google.com/maps-platform/terms" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="underline hover:text-slate-300"
              >
                Google Maps Platform Terms
              </a>
            </p>
          </div>

          <div className="mb-2.5">
            <div className="font-semibold text-white">Geocoding & Reverse Geocoding</div>
            <p className="my-1.5 text-slate-200">Nominatim (OpenStreetMap)</p>
            <p className="my-1 text-slate-400 text-xs">
              <a 
                href="https://www.openstreetmap.org/copyright" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="underline hover:text-slate-300"
              >
                © OpenStreetMap contributors
              </a>
            </p>
          </div>

          <div className="mb-2.5">
            <div className="font-semibold text-white">Routing</div>
            <p className="my-1.5 text-slate-200">OSRM (Open Source Routing Machine)</p>
            <p className="my-1 text-slate-400 text-xs">
              Data ©{' '}
              <a 
                href="https://www.openstreetmap.org/copyright" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="underline hover:text-slate-300"
              >
                OpenStreetMap contributors
              </a>
            </p>
          </div>

          <div className="mb-2.5">
            <div className="font-semibold text-white">Elevation</div>
            <p className="my-1.5 text-slate-200">Open-Elevation</p>
            <p className="my-1 text-slate-400 text-xs">
              <a 
                href="https://www.open-elevation.com/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="underline hover:text-slate-300"
              >
                open-elevation.com
              </a>
            </p>
          </div>
        </section>

        {/* Architecture */}
        <section className="mb-5">
          <h2 className="text-lg mt-8 mb-3 border-b border-white/15 pb-1 text-white font-semibold">Architecture</h2>
          <p className="my-1.5 text-slate-200 text-sm">
            This application uses open-source services (OSRM, Nominatim, Open-Elevation) to reduce dependency on Google APIs 
            while maintaining high-quality map and Street View experience. Route calculation, geocoding, and elevation data 
            are handled through Vercel Serverless API proxies.
          </p>
        </section>

        {/* Legal */}
        <section className="mb-5">
          <h2 className="text-lg mt-8 mb-3 border-b border-white/15 pb-1 text-white font-semibold">Legal</h2>

          <p className="my-1.5 text-slate-200 text-sm">
            This application uses third-party services and map data.
            All rights belong to their respective owners.
          </p>
          <p className="my-1.5 text-slate-200 text-sm">
            Map data ©{' '}
            <a 
              href="https://www.openstreetmap.org/copyright" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="underline hover:text-slate-300"
            >
              OpenStreetMap contributors
            </a>.
          </p>
          <p className="my-1.5 text-slate-200 text-sm">
            Google Maps and Street View are provided by Google Maps Platform. 
            The Google logo and copyright notices displayed on the map are required by Google's Terms of Service.
          </p>
        </section>

        {/* Footer */}
        <div className="mt-10 text-xs text-slate-400 text-center">
          © 2026 Cycle Simulator (Fitness Pro Mobile GIS)
        </div>
      </main>
    </div>
  );
};

export default About;
