# OSM_DE · OSRM 경로 탐색 우선순위 및 Fallback 정리

작성일: 2026-05-05  
대상: `services/osrmRoute.ts`, `App.tsx`, `services/nominatim.ts`

## 1) 결론 요약

- 앱의 경로 계산 엔진은 현재 **OSRM only** 구조다. (`App.tsx` 주석: "OSRM only (no Google Directions). Geocoding: Nominatim only.")
- OSRM 내부 우선순위는 다음과 같다.
  1. **Primary**: `routing.openstreetmap.de` (OSM_DE)
  2. **Fallback**: `router.project-osrm.org`
- 스냅 반경 우선순위는 다음과 같다.
  1. **Strict**: `100m`
  2. **Relaxed fallback**: `300m` (단, `NoSegment`일 때만 재시도)

즉, 실제 실행 순서는  
**OSM_DE(100m) -> project-osrm(100m) -> OSM_DE/프로젝트OSRM(300m, NoSegment 한정)** 이다.

---

## 2) 우선순위 상세

### 2.1 라우팅 소스 우선순위

`services/osrmRoute.ts` 기준:

- Primary base: `https://routing.openstreetmap.de` (`OSM_DE_BASE`)
- Fallback base: `https://router.project-osrm.org` (`FALLBACK_BASE`)
- 요청 시 Primary를 먼저 호출하고, 실패/비정상 시 fallback 호스트를 호출한다.
- 성공 응답에는 `_meta.routingSource`를 붙여 실제 사용 소스를 기록한다.

### 2.2 스냅 반경 우선순위

- 1차: `OSRM_SNAP_RADIUS_STRICT_M = 100`
- 2차: `OSRM_SNAP_RADIUS_RELAXED_M = 300`
- 2차는 **항상**이 아니라, 1차 결과 코드가 `NoSegment`일 때만 수행한다.
- 성공 시 `_meta.osrmSnapRadiusM`, `_meta.osrmSnapRelaxed`로 추적한다.

### 2.3 프로필 매핑 우선순위

- `cycling/bike` -> `routed-bike`
- `foot/walk` -> `routed-foot`
- 그 외 -> `routed-car`

사용자 선택 모드가 프로필로 변환되어 위 순서로 엔드포인트가 결정된다.

---

## 3) 우선순위 선정 이유

### 3.1 OSM_DE를 1순위로 둔 이유

- 프로젝트 코드/주석 기준으로 OSM_DE가 기본 운영 대상이며, profile별 엔드포인트(`routed-bike/foot/car`)가 명확하다.
- fallback을 분리해 두면 primary의 일시 장애(네트워크, 5xx, rate 영향) 시 라우팅 가용성을 유지할 수 있다.

### 3.2 project-osrm를 2순위 fallback으로 둔 이유

- public 인프라의 특성상 특정 호스트 장애/지연이 발생할 수 있어, 단일 호스트 의존을 피하기 위함.
- `fetchRouteHttpWithRetry`(재시도) + fallback host를 결합해 실사용 성공률을 높인다.

### 3.3 반경 100m -> 300m로 완화하는 이유

- 첫 시도는 과도한 스냅을 피하기 위해 strict(100m)로 유지.
- `NoSegment`일 때만 300m로 넓혀 "도로와 점 간 미세 불일치" 케이스를 구제.
- 결과적으로 "정확성 우선 -> 연결성 보완" 순서로 설계됨.

---

## 4) Fallback 처리 규칙

## 4.1 라우팅 호스트 fallback

단일 반경 시도 내부에서:

1. primary(OSM_DE) 호출
2. primary 성공이면 종료
3. 실패/비정상이면 fallback(project-osrm) 호출
4. fallback도 실패하면 에러/코드 반환

## 4.2 스냅 반경 fallback

전체 라우팅에서:

1. strict(100m) 시도
2. 결과가 `NoSegment`면 relaxed(300m) 1회 재시도
3. relaxed 성공 시 채택, 실패 시 `NoSegment` 유지

## 4.3 재시도(transport 레벨)

- 502/503/504/429 또는 fetch 예외 시 최대 2회 재시도
- 시도 간 짧은 대기(`450ms`)를 둬 일시 장애를 흡수

---

## 5) Nominatim과의 관계 (보조 계층)

- 현재 경로 계산 흐름은 "OSRM only"이며, 주소/좌표 변환은 `services/nominatim.ts`가 담당한다.
- 네이티브(Capacitor)에서는 프록시가 없으므로 Nominatim direct 호출.
- `addressToCoord()`는 Plus Code 해석을 먼저 시도하고 실패 시 Nominatim search로 fallback한다.

즉, 주소 계층에서도 "정확한 해석 우선 -> 일반 검색 fallback" 원칙을 동일하게 사용한다.

---

## 6) 운영/디버깅 체크포인트

- 라우팅 결과의 `_meta.routingSource` 확인 (`osm-de` / `project-osrm`)
- `_meta.osrmSnapRadiusM`, `_meta.osrmSnapRelaxed`로 반경 완화 여부 확인
- `NoSegment` 발생 빈도와 relaxed 성공률 모니터링
- 네트워크 이슈 시 primary/fallback 각각의 실패율 분리 관측

---

## 7) 이번 채팅 기준 정리 포인트

- 본 우선순위는 "호스트 fallback + 반경 fallback + 재시도"의 3중 구조다.
- 우선순위 선정 이유는 단일하게 "성공률"이 아니라,  
  **정확도(엄격 스냅/주 호스트)와 연속성(완화/보조 호스트)의 균형**에 있다.
- 장애 상황에서도 "완전 실패"보다 "대체 경로 반환" 가능성을 높이는 설계로 유지되고 있다.

