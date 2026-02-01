# API 호출 및 Vercel 서버 트래픽 분석 보고서

**작성일:** 2025-01-31  
**대상:** Fitness Pro Mobile GIS (Cycle Simulator)  
**배포:** Vercel (SPA)

---

## 1. 개요

본 앱은 **클라이언트(브라우저) 중심 SPA**이며, Vercel은 **정적 자산(HTML/JS/CSS)**만 제공합니다.  
실제 **API 호출은 모두 브라우저 → 외부 서비스**로 직접 이루어지며, Vercel 서버를 경유하지 않습니다.

| 구분 | 경로 | 비고 |
|------|------|------|
| **Vercel** | 사용자 → Vercel → 정적 파일 | index.html, JS 청크, CSS, manifest, sw.js |
| **외부 API** | 브라우저 → Google / OSRM / Gemini / Dropbox | Vercel 미경유 |

---

## 2. Vercel 서버 요청 (Server Requests)

### 2.1 배포 구조 (vercel.json)

- **빌드:** `npm run build` → 출력 디렉터리 `dist`
- **rewrites:** 모든 경로 `/(.*)` → `/index.html` (SPA 라우팅)

### 2.2 Vercel로 들어오는 요청 유형

| 요청 유형 | URI 예시 | 트리거 | 빈도 |
|-----------|----------|--------|------|
| **초기 로드** | `/` | 사용자 진입 | 세션당 1회 |
| **SPA 라우팅** | `/any-path` | 직접 URL 입력·새로고침 | 사용자 행동에 따름 |
| **정적 자산** | `/assets/*.js`, `/assets/*.css` | HTML 파싱 후 | 초기 로드 시 1회 |
| **매니페스트** | `/manifest.json` | PWA·설치 시 | 필요 시 |
| **Service Worker** | `/sw.js` | SW 등록 (load 이벤트) | 초기 로드 시 1회 |

### 2.3 예상 요청 수 (세션당)

- **최소:** 1 (HTML) + N (JS/CSS 청크) + 1 (manifest) + 1 (sw.js) ≈ **4~8건**
- **특징:** API 라우트 없음 → 서버 측 비즈니스 로직 호출 없음, **트래픽은 정적 파일 위주**

### 2.4 HTML에서 로드하는 외부 리소스 (Vercel 미경유)

- `https://cdn.tailwindcss.com` — Tailwind CDN
- `https://maps.googleapis.com/maps/api/js` — Google Maps JS (동적 스크립트 삽입, App.tsx)
- index.html import map: `esm.sh` (react, react-dom, @google/genai, recharts, lucide-react, vite 등) — **실제 빌드 시에는 Vite가 번들링하므로 프로덕션에서는 Vercel에서 제공하는 JS/CSS만 로드**

---

## 3. 외부 API 호출 (Client → External APIs)

### 3.1 Google Maps Platform (maps.googleapis.com)

| API | 트리거 | 호출 빈도 | 코드 위치 |
|-----|--------|-----------|-----------|
| **Maps JavaScript API 로드** | 앱 마운트 시 (useEffect) | **세션당 1회** | App.tsx:359–364 |
| **Directions API (ds.route)** | 경로 계산(Go 클릭, 즐겨찾기 로드, 출발/도착/경유 변경) | **경로 계산 1회당 1회** (Google 성공 시) | App.tsx:824–830 |
| **Geocoder (geocode)** | ① 지도 클릭(placeId 없음) ② Google 경로 실패 시 OSRM용 주소→좌표 | ① 클릭당 1회 ② 폴백 시 출발+도착 최대 2회 | App.tsx:458, 855–856 |
| **Places Service (getDetails)** | 지도 클릭 시 placeId 있음 | **클릭당 1회** | App.tsx:445 |
| **Places Service (findPlaceFromQuery)** | 장소 검색창에서 검색(Enter 또는 검색) | **검색 1회당 1회** | App.tsx:1071 |
| **Elevation Service (getElevationAlongPath)** | 경로 계산 성공 후 path 확정 시 | **경로 계산 1회당 1회** (samples: 100) | App.tsx:888 |
| **Street View Service (getPanorama)** | 시뮬레이션 진행 중 + SV 켜짐 + (현재 파노라마와 15m 이상 이격 또는 파노 없음) | **시뮬레이션 스텝마다 조건 충족 시** (50m → look-ahead 5회 → 100m 순차) | App.tsx:275–279, 543–562 (findStreetView) |

**Google 호출량 요약 (시나리오별)**

- **경로 1회 계산 (Google 성공):** Directions 1 + Elevation 1 = **2회**
- **경로 1회 계산 (Google 실패 → OSRM):** Geocoder 최대 2 + (OSRM 1) + Elevation 1
- **지도 클릭 1회:** getDetails **또는** geocode **1회**
- **장소 검색 1회:** findPlaceFromQuery **1회**
- **시뮬레이션 + Street View:** 15m 초과 시마다 getPanorama **1~7회** (50m 1 + look-ahead 최대 5 + 100m 1) — 세마포어로 동시 중복은 1회만 실행

---

### 3.2 OSRM (router.project-osrm.org)

| API | 트리거 | 호출 빈도 | 코드 위치 |
|-----|--------|-----------|-----------|
| **GET /route/v1/{profile}/{coords}** | Google Directions 실패 시 (catch 블록) | **경로 계산 1회당 최대 1회** | App.tsx:876–878 (fetch) |

- **profile:** `cycling` 또는 `foot` (TravelMode에 따라)
- **coords:** 출발;경유1;…;도착 (lng,lat)

---

### 3.3 Google Gemini (generativelanguage.googleapis.com)

| API | 트리거 | 호출 빈도 | 코드 위치 |
|-----|--------|-----------|-----------|
| **generateContent** (gemini-3-flash-preview) | ① 경로 계산 후 Go로 시뮬 자동 시작 시 ② 시뮬레이션 중 `currentIndex % 21 === 0` 일 때 | ① **1회** ② **약 (path 길이/21) 회** | App.tsx:968, 585–591 / aiCoach.ts:111 |

- **특징:** 시뮬레이션 인덱스 21 스텝마다 1회, `lastCoachedIndex`로 중복 방지

---

### 3.4 Dropbox (www.dropbox.com)

| API | 트리거 | 호출 빈도 | 코드 위치 |
|-----|--------|-----------|-----------|
| **MP3 스트리밍** | 시뮬레이션 활성화 시 배경음 재생, 트랙 종료 시 다음 트랙 | **시뮬 중 재생 트랙 수만큼** (PLAYLIST 6개 중 랜덤) | App.tsx:643–648, PLAYLIST |

- **특징:** `<audio src={url}>` 로 직접 요청, Vercel/백엔드 미경유

---

## 4. 호출 흐름 요약 (시나리오별)

### 4.1 앱 최초 로드 (1회)

1. **Vercel:** `GET /` → index.html  
2. **Vercel:** `GET /assets/*.js`, `GET /assets/*.css` (빌드 결과)  
3. **Vercel:** `GET /manifest.json`, `GET /sw.js` (선택)  
4. **Google:** Maps JS API 스크립트 로드 (동적 삽입)  
5. **CDN:** Tailwind (index.html 기준)

### 4.2 경로 계산 1회 (Go 클릭)

1. **Google Directions** 1회 (성공 시)  
2. **Google Elevation** 1회 (path 확정 후)  
3. 실패 시: **Google Geocoder** 최대 2회 + **OSRM fetch** 1회 + **Google Elevation** 1회

### 4.3 시뮬레이션 + Street View 진행 중 (연속)

- **Google Street View (getPanorama):** 15m 이격 시마다 1~7회(전략별), 세마포어로 직렬화  
- **Google Gemini (generateContent):** 인덱스 21 스텝마다 1회  
- **Dropbox:** 재생 중인 트랙 요청 (스트리밍)

### 4.4 기타 사용자 행동

- **지도 클릭 1회:** getDetails **또는** geocode **1회**  
- **장소 검색 1회:** findPlaceFromQuery **1회**  
- **즐겨찾기 로드:** Directions 1 + Elevation 1 (경로 재계산과 동일)

---

## 5. 트래픽·비용 관점 정리

| 구간 | 주된 트래픽 | 비고 |
|------|-------------|------|
| **Vercel** | 정적 파일 (HTML, JS, CSS, manifest, sw.js) | 함수/API 미사용 → 실행 시간 과금 없음, 대역폭·빌드만 고려 |
| **Google Maps** | Directions, Geocoder, Places, Elevation, Street View | Maps Platform 과금 정책(요청당/스킴) 확인 필요 |
| **Google Gemini** | generateContent | 토큰/요청 기준 과금 |
| **OSRM** | 공개 서비스 GET /route | 사용 제한 정책 확인 권장 |
| **Dropbox** | MP3 스트리밍 | 링크 트래픽·제한 정책 확인 권장 |

### 5.1 호출량이 커질 수 있는 부분

1. **Street View (getPanorama):** 시뮬레이션 + SV 사용 시, 15m마다 최대 7회까지 호출 가능 → **장거리·저속 주행 시 호출 수 증가**  
2. **Gemini (generateContent):** 경로 길이에 비례해 `currentIndex % 21` 횟수만큼 호출 → **긴 경로일수록 호출 증가**  
3. **Directions/Elevation:** 경로 변경·즐겨찾기 로드마다 호출 → **사용자 행동에 비례**

---

## 6. 요약

- **Vercel:** SPA 정적 호스팅 + rewrites만 사용, **API 라우트 없음** → 서버 요청은 **정적 자산 위주**, 세션당 수~수십 건 수준 예상.  
- **외부 API:** Google (Maps + Gemini), OSRM, Dropbox로 **브라우저가 직접 요청**하며, Vercel 서버는 이 트래픽에 관여하지 않음.  
- **트래픽·비용:** Google Maps/Gemini 요청 수·OSRM/Dropbox 사용량을 모니터링하면 비용 및 한도 관리에 유리함.
