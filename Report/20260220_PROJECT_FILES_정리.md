# 프로젝트 파일 정리

## 1. 앱 실행과 관련된 파일

| 폴더/파일명 | 주요 기능 | 속성 | 참고사항 |
|-------------|-----------|------|----------|
| **진입점·설정** | | | |
| `index.html` | SPA 진입 HTML, 루트 div, PWA 메타·manifest 링크, importmap, 캐시/SW 비활성 스크립트 | 루트 | `index.tsx` 로드, viewport·theme-color·preconnect 설정 |
| `index.tsx` | React 앱 마운트 진입점 | ESM 모듈 | `main.css` 임포트, `App` 렌더링 |
| `App.tsx` | 메인 앱 컴포넌트(지도·경로·시뮬·거리뷰·AI 코칭·패널) | React 컴포넌트 | 대부분 UI·비즈니스 로직 포함 |
| `main.css` | 전역 스타일, Tailwind 진입 | CSS | Tailwind 지시문 등 |
| `package.json` | 의존성·스크립트(dev/build/preview) 정의 | JSON | react, vite, recharts, lucide-react 등 |
| `vite.config.ts` | Vite 빌드·개발서버·프록시·env 정의 | 설정 | `/api/*` → Nominatim/Open-Elevation/OSRM 프록시, GOOGLE_MAPS_API_KEY |
| `tsconfig.json` | TypeScript 컴파일 옵션 | 설정 | ESNext, react-jsx, bundler |
| `tailwind.config.js` | Tailwind content 경로·테마 | 설정 | index.html, App, index, ElevationChartView, services 등 |
| `postcss.config.js` | PostCSS 플러그인(tailwindcss, autoprefixer) | 설정 | Tailwind 빌드 파이프라인 |
| `vercel.json` | Vercel 배포 설정 | 설정 | `"framework": "vite"` |
| **타입·컴포넌트** | | | |
| `types.ts` | PanoDataItem, RouteInfo, ElevationPoint, AppPhase, TravelMode 등 공용 타입 | TypeScript | 앱 전역에서 import |
| `ElevationChartView.tsx` | 고도 프로필 차트 컴포넌트(Recharts) | React 컴포넌트 | App에서 경로 고도 표시 |
| `About.tsx` | 앱 정보/About UI 컴포넌트 | React 컴포넌트 | about 페이지용 |
| **서비스 레이어** | | | |
| `services/aiCoach.ts` | AI 코칭(Gemini) 요청·응답 처리 | TS 모듈 | 예측/레거시 코칭 호출 |
| `services/audioCache.ts` | 오디오(TTS 등) 캐시·재생 | TS 모듈 | 코칭 멘트 재생 |
| `services/geoUtils.ts` | 좌표·거리·방향 등 지리 유틸 | TS 모듈 | computeDistanceBetween, computeHeading 등 |
| `services/nominatim.ts` | Nominatim 검색/역지오코딩 클라이언트 | TS 모듈 | 주소 검색·좌표→주소 |
| `services/openElevation.ts` | 고도 API(Open-Elevation 등) 호출 | TS 모듈 | 고도 데이터 조회 |
| `services/phraseManifest.ts` | 코칭 문구 매니페스트 | TS 모듈 | 멘트 텍스트 관리 |
| `services/plusCode.ts` | Plus Code(Open Location Code) 유틸 | TS 모듈 | 주소/코드 변환 |
| **API (배포 시 서버리스)** | | | |
| `api/elevation.js` | 고도 조회 서버리스 핸들러(Open-Elevation → OpenTopoData 폴백) | Vercel serverless | POST, locations 배열 |
| `api/nominatim-search.js` | Nominatim 검색 프록시 핸들러 | Vercel serverless | GET, q 파라미터 |
| `api/nominatim-reverse.js` | Nominatim 역지오코딩 프록시 핸들러 | Vercel serverless | GET |
| `api/osrm-route.js` | OSRM 경로 요청 프록시 핸들러 | Vercel serverless | 경로 좌표 반환 |
| **정적·PWA** | | | |
| `public/manifest.json` | PWA 매니페스트(이름, 아이콘, theme_color, orientation) | JSON | index.html에서 링크 |
| `public/icon-512.png` | PWA·favicon 아이콘 512×512 | 이미지 | 앱 아이콘 |
| `public/cycling-position-marker.png` | 지도 주행 마커 이미지 | 이미지 | 시뮬레이션 마커 |
| `public/cycle-road.png` | 거리뷰(Street View) 버튼 아이콘 | 이미지 | UI 버튼 |
| `public/index.css` | public에서 제공하는 전역 CSS(최소) | CSS | 보조 스타일 |
| `public/about.html` | About 정적 페이지(앱 소개·저작권 등) | HTML | 별도 경로로 제공 |
| `public/sw.js` | 서비스 워커(현재 비활성: 캐시 삭제·unregister만 수행) | JS | index.html에서 등록 해제 스크립트로 캐시 정리 |

---

## 2. 앱 실행과 무관한 파일 (Report 폴더 및 하위 제외)

| 파일 경로 | 내용 요약 |
|-----------|-----------|
| `.gitignore` | 무시 대상: `.env`, `.env.local`, `node_modules/`, `package-lock.json`, `dist/` |
| `.cursor/rules/git-after-edit.mdc` | Cursor 규칙: 코드 수정 후 git add/commit, 푸시 요청 시 push 수행. `alwaysApply: true`. |
| `README.md` | 프로젝트 소개, 로컬 실행 방법(Prerequisites, npm install, .env.local의 GEMINI_API_KEY, npm run dev), AI Studio 링크. |
| `DEVELOPMENT_STATUS_REPORT.md` | 개발 현황 보고서: 프로젝트 개요, 기술 스택(React, Vite, Tailwind, Recharts, Google Maps, Gemini), 외부 서비스, 배포, 기능 현황, 개선 권장사항 등. |
| `Analysis.md` | 레거시 데스크톱→스마트폰 전환 분석: 현재 코드 구조, 모바일 전환 계획(레이아웃·FAB·제스처·React·Tailwind·Recharts·Gemini·지오로케이션), 구현 로드맵. |
| `metadata.json` | 앱 메타데이터: name "Cycle simulator", description(모바일 사이클·고도·거리뷰·Gemini 코칭), requestFramePermissions ["geolocation"]. (도구/플랫폼용) |

---

*Report 폴더 및 그 하위 파일은 제외하였습니다.*
