# 개발 진행 상황 보고서

**작성일:** 2025-01-31  
**대상:** PM  
**프로젝트:** Fitness Pro Mobile GIS (Cycle Simulator)

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | Fitness Pro Mobile GIS / Cycle Simulator |
| **패키지명** | fitness-pro-mobile-gis |
| **버전** | 1.0.0 |
| **앱 유형** | 웹 기반 사이클 시뮬레이터 (PWA 지원) |
| **개발 목적** | 모바일 환경에 최적화된 가상 라이딩 경험 제공 (실시간 고도·AI 코칭·Street View 연동) |

---

## 2. 기술 스택

| 구분 | 기술 | 비고 |
|------|------|------|
| **프론트엔드** | React 18.2, TypeScript, Tailwind CSS | 함수형 컴포넌트, Hooks |
| **빌드** | Vite 5 | ESM, HMR |
| **지도/GIS** | Google Maps JavaScript API | Places, Directions, Geometry, Elevation, Street View |
| **AI** | Google Gemini (`@google/genai`) | gemini-2.0-flash, 주행 시작/종료 시 각 1회 |
| **차트** | Recharts | 고도 프로필 |
| **아이콘** | Lucide React | UI 아이콘 |
| **라우팅 폴백** | OSRM | Google 실패 시 |
| **배포** | Vercel | SPA rewrites, PWA(manifest, SW) |

---

## 3. 최근 개발 완료 사항 (2025-01-31 기준)

### 3.1 트래픽·API 최적화

| 항목 | 내용 |
|------|------|
| **앱 단계 분리** | `IDLE` / `PREPARING`(API 허용) / `RUNNING`(캐시만 사용) 로 단계 구분 |
| **Street View 점진적 로딩** | 초기 200m(10m 간격)만 pre-fetch 후 즉시 주행 가능, 주행 중 앞쪽 300m 도달 시 다음 200m 구간 온디맨드 로딩 |
| **주행 방향 필터** | `findStreetViewInDirection`: 전방 ±90° 내 파노라마만 채택, 실패 시 비방향 검색 폴백 |
| **캐시 구조** | `RouteInfo.panoData`(pathIndex·panoId·heading), `cachedCoaching`(예측 코칭·validUntilPathIndex) |
| **요청 제한** | getPanorama 세마포어·80ms 스로틀, 중복 스왑 방지(`pendingSwapTimeoutRef`) |

### 3.2 Gemini API 활용 정책

| 시점 | 호출 | 용도 |
|------|------|------|
| **주행 시작** | 1회 | `getCourseBriefing(route)` — 코스 요약·전략 조언 (TTS) |
| **주행 종료** | 1회 | `getRideEncouragement(route)` — 격려 메시지 (TTS) |
| **주행 중 코칭** | 0회 | 캐시 TTS만 사용 (`phraseManifest` + `audioCache` MP3, `getPredictiveCoaching` 로컬 로직) |

### 3.3 Street View 연속성·UX

| 항목 | 내용 |
|------|------|
| **시선 회전 제거** | 파노라마 전환 시 **백그라운드 버퍼**에 heading 적용 후 스왑하여, 사용자 화면에서는 회전 애니메이션 없이 전환 |
| **이중 버퍼링** | 2개 파노라마 인스턴스 교차 렌더링, 검은 화면·끊김 최소화 |
| **Pegman 아이콘** | Street View 토글 버튼을 인라인 SVG Pegman으로 통일 |

### 3.4 검색·경로 패널 UX

| 항목 | 내용 |
|------|------|
| **검색 결과 마커** | 장소 검색 시 지도에 녹색 원·'P' 라벨 마커 표시, 검색 초기화(X) 시 마커 제거 |
| **경로 수동 실행** | 출발/도착/경유지 입력만으로는 경로 미계산; **경로탐색**(돋보기) 또는 **Go** 클릭 시에만 경로 계산 |
| **Go 버튼 정렬** | 경로 패널 내 첫 번째 열을 `flex-1 min-w-0`으로 변경하여 Go 버튼을 우측 끝까지 정렬 |
| **경로탐색 버튼** | 거리/소요시간 옆 돋보기 버튼(경로탐색), 빨간 테두리(`border-red-500`) 적용 |
| **소요시간 표기** | "1h 25 min" → "1:25"(h:mm) 형식으로 단순화 |

---

## 4. 구현 완료 기능 요약

### 4.1 지도·경로

- Google Maps 초기화, Places/Geometry/Elevation 라이브러리
- 경로 계산: Google Directions 1차 → OSRM 폴백 (BICYCLING/WALKING/DRIVING)
- 출발/도착/경유지 입력, 지도 클릭으로 START·WAYPOINT·END 설정
- 출발↔도착 스왑, 도로 스냅 좌표 유지(originLocationRef/destLocationRef)
- 경로·A/B/경유지 마커, 커버리지 레이어(Street View 지원 구간 표시)

### 4.2 Street View

- 시뮬레이션 경로 기준 파노라마 전환, 점진적 로딩·방향 필터
- 이중 버퍼링, 전환 전 heading을 백그라운드에 적용 후 스왑
- 풀스크린/50% 레이아웃 토글, 미지원 구간 연속 실패 시 안내

### 4.3 시뮬레이션

- 재생/일시정지/정지, 10~100 km/h 속도 조절
- 경로 방향 반영 시뮬레이션 마커, 고도 차트 ReferenceLine 동기화
- 경과 시간·주행 거리(1초 간격), 완주 시 자동 정지·TTS 완주 메시지

### 4.4 고도·운동

- ElevationService 100 샘플, 경사 기반 소요 시간 보정
- Recharts 고도 프로필, 실시간 커서

### 4.5 AI 코칭

- 주행 시작: Gemini 1회 `getCourseBriefing`, 주행 종료: 1회 `getRideEncouragement`
- 주행 중: `getPredictiveCoaching`(로컬 경사 로직) + `phraseManifest` + `audioCache.playCoachingThenResistance(tipId, resId)`; API 미사용
- 경사 → 저항 1~8, 액션(SIT/STAND/TUCK/PEDAL) 매핑, 실패 시 폴백 멘트

### 4.6 UX·부가

- 장소 검색, 최근 검색 5건, 검색 결과 지도 마커·초기화
- 내 경로(즐겨찾기) 최대 5개, 저장/로드/삭제
- 배경 음악(드롭박스 MP3), 지도 타입(roadmap/hybrid)
- 접이식 검색/경로/고도/히스토리 패널

---

## 5. 문서·리소스

| 문서 | 설명 |
|------|------|
| `Report/traffic_analysis.md` | API·서버 요청 트래픽 분석 |
| `Report/streetview_progressive_loading_implementation.md` | 점진적 로딩·방향 필터 구현 |
| `Report/streetview_no_omission_traffic_review.md` | 생략 방지·트래픽 검토 |
| `Report/gemini_utilization_review.md` | Gemini 활용 정책 검토 |
| `Report/ment_slope_classification_verification.md` | 경사별 멘트 분류 검증 |
| `DEVELOPMENT_STATUS_REPORT.md` | 상세 기능 현황(기준일 이전) |

---

## 6. 환경·배포 요건

- **Node.js**: 로컬 빌드·실행
- **환경 변수**: `GOOGLE_MAPS_API_KEY`, `GOOGLE_GEMINI_API_KEY` (`.env` / `.env.local` 또는 Vercel 설정)
- **OSRM**: router.project-osrm.org (폴백용)

---

## 7. 요약

- **핵심 시나리오**(경로 설정 → 고도 확인 → Street View 시뮬레이션 → AI 코칭)는 **구현 완료** 상태입니다.
- Street View는 **점진적 로딩·방향 필터·캐시**로 생략을 줄이고, **주행 중 API 호출**은 온디맨드 구간 로딩에만 제한됩니다.
- **Gemini는 주행당 2회**(시작 브리핑, 종료 격려)만 사용하며, 주행 중 코칭은 **캐시 TTS**로만 제공됩니다.
- 검색·경로 패널 UX(마커, 경로탐색/Go 정렬·테두리, 수동 경로 실행)가 반영된 상태입니다.

---

**문서 끝.**
