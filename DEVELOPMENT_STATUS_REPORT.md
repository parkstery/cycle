# 사이클 시뮬레이터 앱 개발 현황 보고서

**작성일:** 2025-01-31  
**작성자:** WEB GIS 시니어 개발자 관점  
**대상:** PM

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **프로젝트명** | Fitness Pro Mobile GIS / Cycle Simulator |
| **패키지명** | fitness-pro-mobile-gis |
| **버전** | 1.0.0 |
| **앱 유형** | 웹 기반 사이클 시뮬레이터 (PWA 가능) |

---

## 2. 기술 스택 및 아키텍처

### 2.1 프론트엔드

| 구분 | 기술 | 비고 |
|------|------|------|
| **프레임워크** | React 18.2 + TypeScript | 함수형 컴포넌트, Hooks 사용 |
| **빌드** | Vite 5 | ESM, HMR |
| **스타일** | Tailwind CSS 3.3 | CDN + PostCSS (package 기준) |
| **차트** | Recharts 2.10 | 고도 프로필 시각화 |
| **아이콘** | Lucide React | UI 아이콘 |
| **지도/GIS** | Google Maps JavaScript API | Places, Geometry, Elevation, Street View |

### 2.2 외부 서비스

- **Google Maps API**: 경로 탐색(Directions), 지오코딩, 고도(Elevation), Street View, Places 검색
- **OSRM**: Google 경로 실패 시 폴백 라우팅 (cycling / foot)
- **Google Gemini API** (`@google/genai`): AI 코칭 (gemini-3-flash-preview)

### 2.3 배포

- **Vercel**: SPA rewrites 설정 완료 (`vercel.json`)
- **PWA**: manifest.json, Service Worker(sw.js) 등록, theme-color 설정

---

## 3. 구현 완료 기능 (현황)

### 3.1 지도 및 경로 (WEB GIS)

| 기능 | 상태 | 설명 |
|------|------|------|
| Google Maps 초기화 | ✅ | 동적 스크립트 로딩, Places/Geometry/Elevation 라이브러리 |
| 경로 계산 | ✅ | 출발/도착/경유지 입력, Google Directions 1차 → OSRM 폴백 |
| 이동 수단 | ✅ | BICYCLING, WALKING, DRIVING (enum 존재, UI는 자전거 중심) |
| 경로 시각화 | ✅ | DirectionsRenderer + 커스텀 Polyline(2m 밀도), A/B/경유지 마커 |
| 지오코딩 | ✅ | 주소 → 좌표, 클릭 위치 → 주소 (Geocoder) |
| 클릭으로 출발/도착/경유지 설정 | ✅ | 지도 클릭 → 팝업 → START / WAYPOINT / END |
| 출발↔도착 스왑 | ✅ | 좌표 ref 동기 스왑 |
| **도로 스냅 좌표 유지** | ✅ | originLocationRef / destLocationRef로 정확 좌표 고정 (주소 입력 시 스냅 오류 방지) |

### 3.2 Street View

| 기능 | 상태 | 설명 |
|------|------|------|
| Street View 연동 | ✅ | 시뮬레이션 진행 시 경로 위치 기준 파노라마 전환 |
| 더블 버퍼링 | ✅ | 파노라마 2개(ref) 전환으로 끊김/검은 화면 최소화 |
| 전환 전략 | ✅ | 동일 파노 → 회전만, 연결 링크 있음 → 네이티브 전환, 없음 → 버퍼 스왑 |
| 파노라마 탐색 전략 | ✅ | 50m → look-ahead 5스텝 → 100m 순차 검색, 세마포어로 중복 검색 방지 |
| 풀스크린/50% 레이아웃 | ✅ | 토글 가능 |
| 커버리지 레이어 | ✅ | Street View 커버리지 표시 on/off |
| 미지원 구간 경고 | ✅ | 연속 실패 5회 이상 시 안내 메시지 |

### 3.3 시뮬레이션

| 기능 | 상태 | 설명 |
|------|------|------|
| 재생/일시정지/정지 | ✅ | 재생 시 인덱스 진행, 속도(km/h) 기반 지연 계산 |
| 속도 설정 | ✅ | 10~100 km/h, 슬라이더 + 숫자 입력 |
| 시뮬레이션 마커 | ✅ | 경로 방향(헤딩) 반영 아이콘 |
| 경로 완주 시 | ✅ | 자동 정지 + TTS 완주 메시지 |
| 경과 시간/주행 거리 | ✅ | 1초 간격 타이머, 속도 기반 거리 누적 |
| 고도 차트 동기화 | ✅ | ReferenceLine으로 현재 위치 표시 |

### 3.4 고도 및 운동 로직

| 기능 | 상태 | 설명 |
|------|------|------|
| 고도 데이터 | ✅ | ElevationService.getElevationAlongPath, 100 샘플 |
| 경사 기반 소요 시간 | ✅ | 구간별 경사(grade)에 따른 속도 보정(팩터) 적용 후 duration 계산 |
| 고도 프로필 차트 | ✅ | Recharts AreaChart, 실시간 커서(ReferenceLine) |

### 3.5 AI 코칭 (Gemini)

| 기능 | 상태 | 설명 |
|------|------|------|
| 코칭 API | ✅ | `getAdvancedCoaching(currentElev, upcoming, speed, previousResistance)` |
| 경사 → 저항값 매핑 | ✅ | -3% ~ 10%+ 구간을 Resistance 1~8, 액션(SIT/STAND/TUCK/PEDAL)으로 매핑 |
| Gemini 프롬프트 | ✅ | 역할/상태/전략/JSON 스키마 고정, 짧은 코칭 문구 생성 |
| 폴백 | ✅ | API 실패 시 FALLBACK_TIPS 랜덤 + 동일 저항 문구 |
| TTS | ✅ | Speech Synthesis (영어, 선호 보이스), 코칭 시 재생 |
| 주기적 코칭 | ✅ | 시뮬레이션 인덱스 21스텝마다 호출 (중복 방지 ref) |

### 3.6 UX / 부가 기능

| 기능 | 상태 | 설명 |
|------|------|------|
| 장소 검색 | ✅ | Places findPlaceFromQuery, 최근 검색 5건 localStorage |
| 내 경로(즐겨찾기) | ✅ | 최대 5개 저장, 로드/삭제, 기본 샘플(제주/파리/스위스/폼페이) |
| 배경 음악 | ✅ | 플레이리스트(드롭박스 MP3), 시뮬 중 자동 재생, 페이드 인/아웃 |
| 지도 타입 | ✅ | roadmap ↔ hybrid 토글 |
| 반응형 UI | ✅ | 접이식 검색/경로 입력/고도/히스토리 패널, 풀스크린 대응 |

---

## 4. 코드 품질 및 유지보수성

### 4.1 강점

- **타입 정의**: `types.ts`에 RouteInfo, ElevationPoint, TravelMode, SimulationState, CoachingData, SavedRoute 등 명확히 정의됨.
- **서비스 분리**: AI 코칭 로직이 `services/aiCoach.ts`로 분리되어 테스트/교체 용이.
- **Ref 활용**: 지도/파노라마/마커 등 인스턴스가 ref로 보관되어 불필요 리렌더 최소화.

### 4.2 개선 필요 사항

| 항목 | 내용 |
|------|------|
| **단일 파일 비대화** | `App.tsx` 약 830줄. 지도/시뮬레이션/Street View/패널 등 컴포넌트·훅 분리 시 가독성·테스트 개선. |
| **전역 타입** | `declare var google: any` 사용. `@types/google.maps` 도입 시 타입 안정성 향상. |
| **환경 변수** | `GOOGLE_MAPS_API_KEY`, `GOOGLE_GEMINI_API_KEY` 필수. `.env.example` 및 README 기재 권장. |
| **index.css** | `index.html`에서 `/index.css` 참조하나 프로젝트 루트에 파일 없음. Tailwind 진입점 또는 빌드 설정 확인 필요. |
| **모델명** | `aiCoach.ts`에서 `gemini-3-flash-preview` 사용. 정식 모델명 변경 시 유지보수 포인트. |

---

## 5. Analysis.md 대비 구현 상태

| 계획 항목 | 상태 | 비고 |
|-----------|------|------|
| React + Tailwind | ✅ | 적용 완료 |
| Recharts 고도 차트 | ✅ | 적용 완료 |
| AI 코칭 (Gemini) | ✅ | 적용 완료 |
| Bottom Sheet / FAB | ⚠️ | 플로팅 패널·버튼으로 유사 구현, 전용 Bottom Sheet 컴포넌트는 미도입 |
| 실시간 Geolocation | ❌ | 미구현 (시뮬레이션만 지원) |
| 컴포넌트/훅 분리 | ⚠️ | Map/Directions가 App 내부에 있음, 부분적만 달성 |

---

## 6. 환경 의존성 및 배포 전제 조건

- **Node.js**: 로컬 빌드/실행용.
- **환경 변수** (로컬: `.env` 또는 `.env.local`):
  - `GOOGLE_MAPS_API_KEY`: Maps JavaScript API 키 (Places, Elevation, Street View 등 활성화 필요).
  - `GOOGLE_GEMINI_API_KEY`: Gemini API 키 (AI 코칭).
- Vercel 배포 시 프로젝트 설정에 위 키 등록 필요.
- **OSRM**: `router.project-osrm.org` 공개 서비스 사용 (폴백용). 제한/내부망 정책 확인 필요.

---

## 7. 요약 및 권장 사항

### 7.1 요약

- **핵심 시나리오(경로 설정 → 고도 확인 → Street View 시뮬레이션 → AI 코칭)** 는 **전반적으로 구현 완료** 상태입니다.
- WEB GIS 관점: 경로 탐색(Google + OSRM), 고도, Street View 연동, 좌표 정확도 보정(도로 스냅 대응)까지 반영되어 있습니다.
- AI 코칭은 경사 기반 저항/액션 매핑과 Gemini 연동이 되어 있으며, TTS와 UI 노출까지 이어져 있습니다.

### 7.2 권장 사항 (우선순위)

1. **필수**: `.env.example` 추가 및 README에 `GOOGLE_MAPS_API_KEY`, `GOOGLE_GEMINI_API_KEY` 설정 방법 명시.
2. **필수**: `index.css` 유무 확인 및 Tailwind 진입점 정리 (없으면 생성 또는 index.html 참조 제거).
3. **권장**: `App.tsx`를 Map/Simulation/StreetView/Panels 등으로 분리하고, 훅(useMap, useSimulation 등) 추출.
4. **권장**: `@types/google.maps` 추가로 `google` 타입 정리.
5. **선택**: Analysis.md의 Bottom Sheet/실제 Geolocation 추적 등 로드맵 항목 진행 여부 결정 및 일정 반영.

---

**문서 끝.**
