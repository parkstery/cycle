# 앱 기능별 API 및 서비스 정리

**작성일:** 2025-02-03  
**프로젝트:** Fitness Pro Mobile GIS (Cycle Simulator)  
**배경:** 구글맵 API 트래픽 증가 시 비용 부담이 있어, 오픈소스·로컬 처리 비중을 높이는 방향으로 정리함.

---

## 1. 요약 표 (기능 → API/서비스 → 유형)

| 기능 영역 | 사용 API/서비스 | 유형 | 비고 |
|-----------|-----------------|------|------|
| **지도 표시** | Google Maps JavaScript API | 유료(과금) | 세션당 1회 로드, Places·Geometry·Elevation 라이브러리 포함 |
| **경로 탐색** | Google Directions API (1차) | 유료(과금) | 경로 계산 시 1회 |
| **경로 탐색 폴백** | **OSRM** (router.project-osrm.org) | **오픈소스(무료)** | Google 실패 시 cycling/foot 프로필 |
| **주소↔좌표** | Google Geocoder | 유료(과금) | 지도 클릭·OSRM 폴백 시 |
| **장소 검색** | Google Places (findPlaceFromQuery, getDetails) | 유료(과금) | 검색창·지도 클릭 시 |
| **고도 데이터** | Google Elevation API | 유료(과금) | 경로 확정 후 1회 (samples: 100) |
| **스트리트뷰** | Google Street View (getPanorama) | 유료(과금) | 시뮬 중 SV 켜짐 시 15m 이격마다 호출 가능 |
| **거리 계산** | Google Maps Geometry (spherical) | 유료(동일 키) | Maps JS 로드 시 포함, 코칭 경사 계산 등 |
| **AI 코칭** | **로컬 로직 + phraseManifest + Cache TTS** | **로컬/무료** | Gemini 미사용, 경사→저항 규칙 + 미리 녹음 MP3 |
| **주행 시작/종료 멘트** | **고정 문구 + 브라우저 TTS** | **로컬/무료** | getCourseBriefing / getRideEncouragement |
| **고도 프로필 차트** | Recharts | 오픈소스(번들) | 외부 API 없음 |
| **배경음** | Dropbox MP3 링크 | 서드파티(제한 있음) | 시뮬 중 스트리밍, 브라우저 직접 요청 |
| **배포/호스팅** | Vercel | 서드파티 | 정적 SPA만 제공, API 프록시 없음 |

---

## 2. 기능별 상세

### 2.1 지도·경로 (WEB GIS)

| 서비스 | 용도 | 호출 시점 | 오픈소스 대체 여부 |
|--------|------|-----------|--------------------|
| **Google Maps JS API** | 지도 렌더링, 컨트롤, 스타일 | 앱 마운트 시 1회 | 대체 시 Leaflet + OSM 타일 등 검토 가능 |
| **Google Directions API** | 자전거/도보/자동차 경로 계산 | Go 클릭, 즐겨찾기 로드, 출발·도착·경유 변경 시 | ✅ **OSRM 폴백 이미 적용** (실패 시 자동 전환) |
| **OSRM** | 경로 계산 (폴백) | Directions 실패 시 | ✅ 오픈소스, `router.project-osrm.org` 공개 서비스 |
| **Google Geocoder** | 주소→좌표, 클릭 위치→주소 | 지도 클릭(placeId 없음), OSRM용 주소 변환 | Nominatim 등 오픈소스 대체 가능(별도 도입 시) |
| **Google Places** | 장소 검색, placeId→상세 | 검색창 검색, 지도 클릭(placeId 있음) | 대체 시 자체 검색/오픈 데이터 연동 필요 |
| **Google Elevation API** | 경로 고도 (100 샘플) | 경로 확정 후 1회 | Open-Elevation 등 오픈소스 대체 가능(별도 도입 시) |
| **Google Street View** | 파노라마 이미지·메타데이터 | 시뮬레이션 + SV ON, 15m 이격 시 getPanorama | Mapillary 등 대체 시 기능·커버리지 검토 필요 |
| **Google Geometry** | 거리 계산(경사도 등) | 코칭 로직 내 (spherical.computeDistanceBetween) | Maps JS와 함께 로드, 단독 과금 아님 |

### 2.2 AI 코칭·음성

| 서비스 | 용도 | 호출 시점 | 비고 |
|--------|------|-----------|------|
| **로컬 코칭 로직** (aiCoach.ts) | 경사도→저항 밴드, tip/resId 결정 | 시뮬레이션 스텝(예: 80 포인트 구간) | **Gemini 미사용** |
| **phraseManifest + audioCache** | 코칭 문구 매핑, 미리 생성된 MP3 재생 | 코칭 이벤트 시 | `/choaching/*.mp3` 로컬(또는 배포본) |
| **getCourseBriefing / getRideEncouragement** | 주행 시작/종료 멘트 | 시작 1회, 종료 1회 | 고정 문구 반환, **브라우저 TTS** 또는 캐시 재생 |
| **Gemini API** | 현재 코드·package.json 기준 **미사용** | — | 과거 검토 문서에는 21스텝마다 호출안이 있었으나, Cache TTS 전환 후 제거된 상태 |

### 2.3 차트·UI·기타

| 서비스 | 용도 | 비고 |
|--------|------|------|
| **Recharts** | 고도 프로필(AreaChart) | npm 번들, 외부 API 없음 |
| **Lucide React** | 아이콘 | npm 번들 |
| **Tailwind CSS** | 스타일 | 빌드 시 번들 또는 CDN(index.html 기준은 CDN) |
| **Dropbox** | 배경음 MP3 스트리밍 | PLAYLIST URL 직접 재생, 트래픽·정책은 Dropbox 기준 |

---

## 3. 유료(Google) vs 오픈소스/로컬 정리

- **유료(Google Maps Platform):**  
  Maps JS, Directions, Geocoder, Places, Elevation, Street View, Geometry  
  → 트래픽 증가 시 비용 증가 가능. 이미 **경로 탐색은 OSRM 폴백**으로 1차 절감.

- **오픈소스·무료:**  
  - **OSRM**: 경로 탐색 폴백  
  - **Recharts, Lucide**: 번들 라이브러리  
  - **로컬 코칭 + Cache TTS**: AI 코칭·시작/종료 멘트 (Gemini 비용 없음)

- **기타 서드파티:**  
  - **Vercel**: 배포  
  - **Dropbox**: 배경음 (스트리밍 트래픽)

---

## 4. 참고 문서

- `Report/traffic_analysis.md` — API 호출 빈도·시나리오별 정리  
- `Report/gemini_utilization_review.md` — Gemini 활용 검토(캐시 TTS 전환 정책)  
- `DEVELOPMENT_STATUS_REPORT.md` — 기술 스택·외부 서비스 요약  
