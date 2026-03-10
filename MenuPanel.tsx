import React, { useEffect } from "react";
import { ChevronRight, ChevronDown, ChevronLeft, X } from "lucide-react";

const APP_NAME = "Ride the World – Indoor Cycling";

function HelpContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">How to use</h3>
      <p className="mb-3">
        Choose a route on the map or search for a destination. Start the ride to begin indoor cycling with elevation and distance based on your selection.
      </p>
      <h3 className="font-semibold text-slate-900 mb-2">Controls</h3>
      <p className="mb-3">
        Use Play/Pause to control the simulation. You can adjust speed, view the elevation chart, and use street view where available.
      </p>
      <p>
        For more details, see the About screen from the menu.
      </p>
    </>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-4 text-slate-800">
      <h3 className="font-semibold text-slate-900 mb-2">개인정보처리방침</h3>
      <p className="text-xs">
        Ride the World – Indoor Cycling은 실내 사이클링 경로 시뮬레이션 및 지도·경로 탐색 서비스를 제공합니다. 개발·운영: LiveOnSoft. 앱은 자체 서버에 개인정보를 저장하지 않습니다.
      </p>

      <h4 className="font-medium text-slate-900 mt-3 mb-1">1. 수집·이용하는 정보</h4>
      <ul className="list-disc pl-5 space-y-1 text-xs">
        <li><strong>직접 입력:</strong> 출발지·도착지·경유지, 장소 검색어 — 경로 검색·지도 표시·표고 계산 목적으로만 사용합니다.</li>
        <li><strong>위치(선택):</strong> 브라우저 위치 권한 동의 시 현재 위치를 지도 초기 중심 설정에만 사용하며, 서버로 전송하지 않습니다.</li>
        <li>이름, 이메일, 전화번호, 계정·결제 정보는 수집하지 않으며, 로그인·회원가입을 요구하지 않습니다.</li>
      </ul>

      <h4 className="font-medium text-slate-900 mt-3 mb-1">2. 저장 데이터 (기기 내)</h4>
      <p className="text-xs">
        다음 데이터만 사용자 기기의 브라우저 저장소(localStorage)에 저장됩니다. 자체 서버에는 저장하지 않습니다.
      </p>
      <ul className="list-disc pl-5 space-y-1 text-xs">
        <li><strong>favorite_routes:</strong> 저장한 경로(출발·도착·경유지·경로 지오메트리) — My Routes 복원용.</li>
        <li><strong>recent_places:</strong> 최근 장소 검색어 — 검색 편의용. 저장·삭제는 사용자 행위로 제어됩니다.</li>
      </ul>

      <h4 className="font-medium text-slate-900 mt-3 mb-1">3. 제3자 서비스</h4>
      <p className="text-xs">
        경로 검색·지도·표고·거리뷰를 위해 OpenStreetMap/Nominatim, OSRM, Open-Elevation, Google Maps/Street View 등이 사용됩니다. 검색어·좌표·IP 등이 해당 서비스로 전달될 수 있으며, 처리 방식은 각 사업자의 개인정보처리방침을 따릅니다. 앱은 광고주나 데이터 브로커에게 데이터를 판매·공유하지 않습니다.
      </p>

      <h4 className="font-medium text-slate-900 mt-3 mb-1">4. 보관·권리·보안</h4>
      <ul className="list-disc pl-5 space-y-1 text-xs">
        <li>기기 내 저장 데이터는 사용자가 삭제하거나 저장소를 초기화할 때까지 유지됩니다.</li>
        <li>My Routes에서 항목 삭제, 브라우저/기기에서 위치 권한 해제 등으로 이용자 권리를 행사할 수 있습니다.</li>
        <li>통신은 HTTPS 등 암호화된 환경 사용을 권장합니다.</li>
      </ul>

      <h4 className="font-medium text-slate-900 mt-3 mb-1">5. 정책 변경</h4>
      <p className="text-xs">
        본 방침은 법령·서비스 변경에 따라 수정될 수 있습니다. 변경 후에도 앱을 계속 이용하시면 변경된 정책에 동의한 것으로 봅니다. 최종 업데이트 일자는 앱 또는 문서에 표기합니다.
      </p>

      <p className="text-xs text-slate-500 mt-3">
        전문은 프로젝트 내 docs/PRIVACY_POLICY_KO.md에서 확인할 수 있습니다. 문의는 앱 스토어 또는 공식 프로젝트 페이지 연락처를 이용해 주세요.
      </p>
    </div>
  );
}

function TermsContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Terms of Service</h3>
      <p className="mb-3">
        By using Ride the World – Indoor Cycling you agree to use the app for personal, non-commercial indoor training only. You must not misuse the service or attempt to access systems or data you are not authorised to use.
      </p>
      <p className="mb-3">
        Route and map data are provided by third parties; we do not guarantee accuracy or availability. Use at your own risk, especially when planning outdoor activities.
      </p>
      <p>
        We may change these terms from time to time. Your continued use of the app after changes constitutes acceptance of the updated terms.
      </p>
    </>
  );
}

function DisclaimerContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Disclaimer</h3>
      <p className="mb-3">
        This app is for indoor cycling simulation and entertainment only. It is not a substitute for professional medical or fitness advice. Consult a doctor before starting or changing any exercise program.
      </p>
      <p className="mb-3">
        Elevation, distance, and route data are approximate and may differ from real-world conditions. Do not rely on this app for navigation or safety-critical decisions outdoors.
      </p>
      <p>
        The developers are not liable for any injury, loss, or damage arising from use of this app or the data it displays.
      </p>
    </>
  );
}

function LicensesContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Open Source Licenses</h3>
      <p className="mb-3">
        This application uses open source software. Key components may include (depending on build):
      </p>
      <ul className="list-disc pl-5 space-y-1 mb-3">
        <li>React – MIT License</li>
        <li>Lucide React (icons) – ISC License</li>
        <li>Vite – MIT License</li>
        <li>Google Maps / APIs – Google Terms of Service</li>
      </ul>
      <p>
        Full license texts are available in the app repository or from the respective projects. We do not claim ownership of third-party open source code; all rights remain with their authors.
      </p>
    </>
  );
}

function ContactContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Contact</h3>
      <p className="mb-3">
        For support, feedback, or legal inquiries regarding Ride the World – Indoor Cycling, please use the contact method provided in the app store listing or the official project page.
      </p>
      <p>
        We aim to respond to reasonable requests in a timely manner. Please include a clear subject and description so we can help you effectively.
      </p>
    </>
  );
}

function AboutContent() {
  return (
    <>
      <h3 className="font-semibold text-slate-900 mb-2">Ride the World – Indoor Cycling</h3>
      <p className="mb-4 text-slate-700">
        Cycling route planner and map-based ride simulator with elevation analysis.
      </p>
      <h3 className="font-semibold text-slate-900 mb-2">Key Features</h3>
      <ul className="list-disc pl-5 space-y-1 mb-4">
        <li>Cycling route planner on real-world maps</li>
        <li>Bike route exploration with interactive map</li>
        <li>Elevation profile for climbs and descents</li>
        <li>Ride simulation along selected routes</li>
      </ul>
      <h3 className="font-semibold text-slate-900 mb-2">Who This App Is For</h3>
      <ul className="list-disc pl-5 space-y-1 mb-4">
        <li>Cyclists planning new bike routes</li>
        <li>Riders exploring unfamiliar cycling areas</li>
        <li>Users checking elevation before a ride</li>
        <li>Anyone interested in cycling route maps</li>
      </ul>
      <h3 className="font-semibold text-slate-900 mb-2">Data Sources</h3>
      <p className="mb-1 font-medium text-slate-900">Map Data</p>
      <p className="mb-3 text-slate-700">OpenStreetMap contributors</p>
      <p className="mb-1 font-medium text-slate-900">Routing Engine</p>
      <p className="mb-3 text-slate-700">OSRM (Open Source Routing Machine)</p>
      <p className="mb-1 font-medium text-slate-900">Elevation Data</p>
      <p className="mb-3 text-slate-700">Open-Elevation API</p>
      <p className="mb-1 font-medium text-slate-900">Map Rendering</p>
      <p className="mb-3 text-slate-700">Leaflet JS</p>
      <p className="mb-1 font-medium text-slate-900">Icons</p>
      <p className="mb-4 text-slate-700">Lucide Icons</p>
      <h3 className="font-semibold text-slate-900 mb-2">Disclaimer</h3>
      <p className="mb-3 text-slate-700">
        Ride the World – Indoor Cycling is provided for route exploration and simulation purposes only. Map data, routes, and elevation may contain inaccuracies. Users must follow local traffic laws and ensure their own safety. The developer assumes no responsibility for any loss, damage, or injury resulting from the use of this application.
      </p>
    </>
  );
}

export type MenuView =
  | "list"
  | "about"
  | "help"
  | "privacy"
  | "terms"
  | "disclaimer"
  | "licenses"
  | "contact";

interface MenuPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenAbout: () => void;
  menuView: MenuView;
  setMenuView: (v: MenuView) => void;
  legalExpanded: boolean;
  setLegalExpanded: (v: boolean) => void;
}

export default function MenuPanel({
  open,
  onClose,
  onOpenAbout,
  menuView,
  setMenuView,
  legalExpanded,
  setLegalExpanded,
}: MenuPanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  const isList = menuView === "list";

  const backToMenu = () => {
    setMenuView("list");
  };

  const viewMap = {
    about: <AboutContent />,
    help: <HelpContent />,
    privacy: <PrivacyContent />,
    terms: <TermsContent />,
    disclaimer: <DisclaimerContent />,
    licenses: <LicensesContent />,
    contact: <ContactContent />,
  };

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-[10001] bg-black/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* panel */}
      <div
        className="fixed left-0 top-0 bottom-0 z-[10002] w-[88%] max-w-[360px] bg-white shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* navigation */}
        <header className="border-b border-slate-200">

          <div className="flex items-center justify-between px-4 h-10 text-sm">

            <button
              onClick={backToMenu}
              className="flex items-center gap-1 text-slate-700"
            >
              <ChevronLeft size={18} />
              Back to Menu
            </button>

            <button
              onClick={onClose}
              className="flex items-center gap-1 text-slate-700"
            >
              Back to Simulator
              <X size={18} />
            </button>

          </div>

          <div className="h-12 flex items-center px-4 font-semibold text-slate-900">
            {isList ? "Menu" : "Information"}
          </div>

        </header>

        {/* content */}
        <div className="flex-1 overflow-y-auto">

          {isList ? (
            <ul className="py-2 text-slate-800">

              <li>
                <button
                  onClick={() => setMenuView("about")}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  About
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

              <li>
                <button
                  onClick={() => setMenuView("help")}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Help
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

              {/* legal section */}

              <li>
                <button
                  onClick={() => setLegalExpanded(!legalExpanded)}
                  aria-expanded={legalExpanded}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Legal
                  {legalExpanded ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} className="text-slate-400" />
                  )}
                </button>

                {legalExpanded && (
                  <ul className="ml-6 border-l border-slate-200">

                    {[
                      { key: "privacy", label: "Privacy Policy" },
                      { key: "terms", label: "Terms of Service" },
                      { key: "disclaimer", label: "Disclaimer" },
                      { key: "licenses", label: "Open Source Licenses" },
                    ].map(({ key, label }) => (
                      <li key={key}>
                        <button
                          onClick={() => setMenuView(key as MenuView)}
                          className="w-full text-left pl-4 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          {label}
                        </button>
                      </li>
                    ))}

                  </ul>
                )}
              </li>

              <li>
                <button
                  onClick={() => setMenuView("contact")}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Contact
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

            </ul>
          ) : (
            <div className="px-4 py-4 pb-8 text-sm text-slate-800 leading-relaxed">
              {viewMap[menuView as keyof typeof viewMap]}
            </div>
          )}

        </div>

        {/* footer */}

        <div className="px-4 py-3 border-t text-xs text-slate-500 text-center">
          {APP_NAME}
          <br />
          Version 1.0
        </div>

      </div>
    </>
  );
}