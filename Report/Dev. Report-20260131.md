## 개발 보고서 및 사용자 매뉴얼 (Development Report) & User Manual

1. 개발 보고서 (Development Report)
1.1 프로젝트 개요
프로젝트명: Fitness Pro Mobile GIS (Cycle Simulator)
개발 목적: 모바일 환경에 최적화된 웹 기반 사이클 시뮬레이터로, 실시간 고도 분석 및 AI 코칭 기능을 통해 가상 라이딩 경험을 제공함.
1.2 기술 스택 (Tech Stack)
Frontend: React 19, TypeScript, Tailwind CSS
GIS/Maps: Google Maps JS API (Places, Directions, Elevation, Street View)
AI Engine: Google Gemini 1.5 Flash (Advanced Coaching Logic)
Data Visualization: Recharts (Dynamic Elevation Profile)
Icons: Lucide-React
Routing Fallback: OSRM (Open Source Routing Machine)
1.3 핵심 구현 사양
하이브리드 경로 탐색: Google Directions API를 우선 사용하며, 실패 시 OSRM을 통해 안정적으로 경로를 생성함.
Double Buffering Street View: 두 개의 파노라마 인스턴스를 교차 렌더링하여 화면 끊김(Black-out) 없는 부드러운 주행 시뮬레이션을 구현함.
AI 사이클링 코치: 고도 변화와 실시간 주행 속도를 Gemini API가 분석하여 맞춤형 저항 단계 및 페달링 전략을 음성(TTS)과 텍스트로 제공함.
반응형 UI/UX: 모바일 최적화를 위해 접이식(Collapsible) 패널 구조를 채택하여 지도 가독성을 극대화함.
지형 정보 강화: Google Elevation Service를 이용한 고도 차트 구현 및 최근 업데이트를 통해 지도 축척바(Scale Bar)를 활성화하여 지리적 인지도를 높임.
2. 사용자 매뉴얼 (User Manual)
2.1 시작하기 (경로 설정)
장소 검색: 좌측 상단 검색창을 클릭하여 목적지를 검색하거나, 지도를 클릭하여 핀을 생성합니다.
지점 설정: 지도 클릭 시 나타나는 팝업에서 START (A), WAYPOINT, END (B) 버튼을 눌러 경로를 구성합니다.
경로 확인: 하단 패널에 표시된 총 거리와 예상 소요 시간을 확인한 후 Go 버튼을 클릭하여 시뮬레이션을 준비합니다.
2.2 시뮬레이션 제어
주행 시작/일시정지: 하단 우측의 Play/Pause 버튼을 사용하여 시뮬레이션을 제어합니다.
스트리트 뷰 전환: 우측 상단의 사람 아이콘(User)을 클릭하여 가상 주행 화면을 켜거나 끌 수 있습니다. 전체화면 버튼을 누르면 몰입형 모드로 전환됩니다.
속도 조절: 하단 설정 패널의 슬라이더를 통해 주행 속도(10km/h ~ 100km/h)를 실시간으로 변경할 수 있습니다.
2.3 주요 기능 활용
AI 코칭: 주행 중 고도가 변하면 AI 코치가 화면 상단에 라이딩 팁을 제시하며 음성으로 안내합니다. 지시에 따라 실내 자전거의 저항을 조절하십시오.
고도 차트: 하단 우측의 차트 패널을 통해 전체 경로의 경사도를 확인하고, 현재 본인의 위치를 실시간으로 추적할 수 있습니다.
경로 저장 (My Routes): 자주 이용하는 경로는 별표(Star) 아이콘을 눌러 즐겨찾기에 추가할 수 있으며, 하단 패널에서 즉시 불러올 수 있습니다.
레이어 설정: 우측 상단의 레이어 아이콘을 통해 일반 지도와 위성 지도를 전환할 수 있으며, 경로 아이콘을 눌러 구글 스트리트 뷰 지원 구간을 지도상에 파란 선으로 표시할 수 있습니다.
2.4 지형 확인
축척바 활용: 지도 하단에 표시된 축척바를 통해 현재 보고 있는 지도의 실제 거리감을 확인할 수 있습니다.