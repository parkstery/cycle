# Capacitor 경로 API·터치 레이어·아이콘 변경 보고

**일자:** 2026-03-21

## 1. 경로 탐색(OSRM) 실패 원인

- 웹(Vite dev / Vercel의 `/api/*`)에서는 `api/osrm-route.js` 등으로 OSRM·Nominatim·고도를 프록시합니다.
- **Capacitor Android** 는 `https://localhost` 에 **정적 파일만** 있어 `/api/osrm-route` 요청이 HTML(예: index)을 반환 → JSON 파싱 오류로 경로 계산 실패.

## 2. 적용한 해결(코드 요약)

- **네이티브 앱**(`Capacitor.isNativePlatform() === true`)일 때:
  - OSRM: `services/osrmRoute.ts` 에서 `routing.openstreetmap.de` 직접 호출 (기존 `api/osrm-route.js` 와 동일 로직).
  - Nominatim: `services/nominatim.ts` 에서 직접 `nominatim.openstreetmap.org` 호출.
  - 고도: `services/openElevation.ts` 에서 `api.open-elevation.com` 직접 POST.
- **웹**은 기존처럼 `/api/*` 프록시 유지.

## 3. 버튼 무응답과 z-index (웹 vs Android WebView)

- DOM 상으로는 맵 컨테이너 `z-10`, 툴바 `z-50` 등으로 **버튼이 위**에 있어야 하나, **Android WebView** 에서 Google Maps 가 그리는 **내부 레이어(타일/오버레이)** 가 터치를 먼저 받는 경우가 있습니다. 데스크톱 Chrome과 **합성(compositing) 순서**가 달라, **같은 CSS라도 앱에서만** 버튼이 먹히지 않는 현상으로 이해할 수 있습니다.
- 대응: 맵 위에 떠 있는 **주요 컨트롤**의 `z-index` 를 `z-[1000]` 수준으로 올리고, `pointer-events-auto` 를 명시해 터치 타깃을 분리했습니다. (레이아웃·버튼 배치는 동일, 스택 순서만 조정.)

## 4. 아이콘: `icon-512.png` → `bike_conti-128.png`

| 구분 | 경로 | 변경 내용 |
|------|------|-----------|
| 소스 HTML 파비콘 | `index.html` | `link rel="icon"` → `./bike_conti-128.png` |
| PWA manifest | `manifest.json` | `icons[0].src` → `/bike_conti-128.png`, `sizes` → `128x128` |
| 실제 이미지 파일 | `public/bike_conti-128.png` | 기존 자산 사용 (빌드 시 `dist/` 로 복사됨) |

**참고:** `android/app/src/main/assets/public/` 는 `.gitignore` 로 동기화 산출물이므로, 반드시 **`npm run build` 후 `npx cap sync android`** 로 반영합니다.

## 5. 수정·추가된 소스 파일 목록

| 파일 | 역할 |
|------|------|
| `services/osrmRoute.ts` | 네이티브용 OSRM 직접 호출 (신규) |
| `services/nominatim.ts` | `USE_PROXY = !Capacitor.isNativePlatform()` |
| `services/openElevation.ts` | 네이티브 시 Open-Elevation 직접 URL |
| `App.tsx` | OSRM 분기, 컨트롤 z-index·pointer-events |
| `index.html` | favicon 경로 |
| `manifest.json` | PWA 아이콘 |
