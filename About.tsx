import React from 'react';

interface AboutProps {
  onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/95 overflow-y-auto"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      {/* Header */}
      <header
        className="fixed top-0 left-0 right-0 h-[52px] flex items-center bg-slate-900/95 backdrop-blur-md border-b border-white/10 z-10"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <button
          onClick={onClose}
          className="bg-white/70 hover:bg-gray-300/50 text-blue-600 font-bold border-none text-xl p-0 px-4 cursor-pointer transition-colors rounded flex items-center justify-center"
          style={{
            width: '28px',
            height: '28px',
            lineHeight: 1,
          }}
          aria-label="Back"
        >
          ←
        </button>
        <div className="text-base font-semibold text-white ml-3">About</div>
      </header>

      {/* Main */}
      <main className="pt-[72px] px-5 pb-8 max-w-[720px] mx-auto text-slate-200">
        {/* App Info */}
        <section className="mb-5">
          <h1 className="text-[22px] mb-2 text-white font-semibold">Cycle Simulator</h1>
          <p>
            Virtual cycling & walking route simulation with Street View, elevation-based AI coaching, route search, and place exploration.
          </p>
        </section>

        {/* Project Overview */}
        <section className="mb-5">
          <h2 className="text-lg mt-6 mb-2 border-b border-white/15 pb-1 text-white font-semibold">
            Project Overview
          </h2>
          <ul className="list-disc pl-5">
            <li>PWA 모바일 GIS 기반 자전거/도보 경로 시뮬레이션</li>
            <li>출발지·도착지·경유지 입력 → OSRM 경로 계산</li>
            <li>Google Street View로 주행 전경 표시, 경사도 기반 AI 코칭 멘트 및 TTS 제공</li>
            <li>경로 고도 확인 및 Recharts AreaChart 실시간 갱신</li>
            <li>배경 음악 재생, 즐겨찾기(My Routes), 교통 레이어 토글 지원</li>
          </ul>
        </section>

        {/* Technology Stack */}
        <section className="mb-5">
          <h2 className="text-lg mt-6 mb-2 border-b border-white/15 pb-1 text-white font-semibold">
            Technology Stack
          </h2>
          <ul className="list-disc pl-5">
            <li>TypeScript 5.2 + React 18.2 + Vite 5.x</li>
            <li>Tailwind CSS 3.3 + Recharts 2.10 + Lucide React 0.294</li>
            <li>Google Maps JS API (지도·Street View), Open-Elevation, Nominatim, OSRM, Dropbox MP3</li>
            <li>PWA, Vercel Serverless API 기반 경로/지오코딩</li>
          </ul>
        </section>

        {/* Data & API */}
        <section className="mb-5">
          <h2 className="text-lg mt-6 mb-2 border-b border-white/15 pb-1 text-white font-semibold">
            Data & API
          </h2>
          <div className="mb-2.5">
            <div className="font-semibold text-white">Maps & Street View</div>
            <p className="my-1.5 text-slate-200">Google Maps JavaScript API</p>
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
          <h2 className="text-lg mt-6 mb-2 border-b border-white/15 pb-1 text-white font-semibold">
            Legal
          </h2>
          <p className="my-1.5 text-slate-200">
            This application uses third-party services and map data. All rights belong to their respective owners.
          </p>
          <p className="my-1.5 text-slate-200">Map data © OpenStreetMap contributors.</p>
        </section>

        {/* Footer */}
        <div className="mt-10 text-xs text-slate-400 text-center">
          © 2026 Cycle Simulator — Fitness Pro Mobile GIS
        </div>
      </main>
    </div>
  );
};

export default About;
