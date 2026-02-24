# 거리뷰 점진적 로딩 + 주행 방향 필터 구현 방안

## 1. 개발 방향 (확정)

- **생략 없음 + 기능 저하 없음** 전제 하의 트래픽 저감: **점진적 로딩 + 캐시 + 요청 제한**.
- 주행 중 트래픽 0은 포기하고, **빠른 시작**과 **경로 상 거리뷰 생략 없음**을 우선.
- **주행 방향 각도 범위 내** 거리뷰만 채택 (radius만 쓰면 전·후·좌·우 모두 나오는 문제 해결).

---

## 2. 주행 방향 각도 범위 내 거리뷰 선택 — 현재 상태 및 보강

### 2.1 현재 코드 확인 결과

- **findStreetView(service, location, radius)**  
  - `getPanorama({ location, radius, source, preference: NEAREST })` 만 사용.
  - **주행 방향(heading) 또는 각도 범위는 사용하지 않음.**  
  - 반환된 pano를 “주행 방향과의 각도”로 **필터링하는 로직 없음**.
- **heading 사용처**  
  - `computeHeading(loc, path[nextIdx])` 등으로 **표시용 POV(시선 방향)** 만 계산.  
  - “어떤 pano를 채택할지”를 **방향으로 걸러내는 로직은 없음**.

→ **과거에 효과적이었던 “주행 방향 각도 범위 내 거리뷰 선택” 로직은 현재 코드에 없음.**  
→ 아래와 같이 **보강 필요**.

### 2.2 보강 방안: getPanorama 반환 후 방향 필터

- Google getPanorama 요청에는 **heading/direction 파라미터가 없음.**  
  따라서 **호출 후 반환된 pano에 대해** “주행 방향과의 각도”로 필터링.

**절차:**

1. **주행 방향**  
   - `driveHeading = computeHeading(pathPoint, pathNext)` (경로 상 현재 → 다음 점).
2. **getPanorama(location, radius)** 호출 (location = 경로 상 점).
3. **반환 pano의 위치**  
   - `panoLocation = data.location.latLng`.
4. **경로 점 → pano 위치 방향**  
   - `bearingToPano = computeHeading(pathPoint, panoLocation)`.
5. **각도 차이**  
   - `angleDiff = |normalizeAngle(bearingToPano - driveHeading)|`  
   - (예: -180~180으로 정규화 후 절대값).
6. **채택 조건**  
   - `angleDiff <= 90` (또는 120) → **전방 반구**만 허용.  
   - 초과 시 해당 pano **버리고**,  
     - radius를 줄여 재시도하거나,  
     - 다음 경로 점으로 시도.

**적용 위치**

- `findStreetView`를 **주행 방향 인자를 받는 형태**로 확장하거나,  
- **findStreetViewInDirection(service, pathPoint, pathNext, radius)** 같은 별도 함수로 구현 후,  
  pre-fetch·주행 중 온디맨드 **모든 getPanorama 호출**에서 이 함수를 사용.

---

## 3. 점진적 로딩 + 캐시 + 요청 제한 — 구현 방법

### 3.1 전체 흐름

| 단계 | 내용 |
|------|------|
| **경로 확정 직후** | **최소한의 pre-fetch만** 수행 (예: 앞 100~150m, 10~15m 간격). |
| **시작** | pre-fetch가 **끝나기 전이라도** 일정 개수(예: 3~5개)만 채워지면 **즉시 주행 시작** 가능. (또는 1~2초 타임아웃 후 시작.) |
| **주행 중** | 현재 위치·주행 방향 기준 **앞쪽 구간**이 캐시(panoData)에 없으면, **해당 구간에 대해 getPanorama** 호출(방향 필터 적용) → 결과를 **panoData에 추가** → 표시. |
| **캐시** | panoData를 pathIndex(또는 거리) 구간별로 보관. 같은 구간은 **한 번만** 호출. |
| **요청 제한** | 동시 getPanorama **1건** (세마포어). 연속 호출 시 **80~100ms** 간격 (throttle). |

### 3.2 초기 pre-fetch (최소화)

- **목표**: 초기 로딩 시간 1~2초 이내.
- **방법**  
  - **첫 N m만** 샘플링 (예: 150m).  
  - 간격 10~15m (예: 15m → 10개 호출, 80ms 간격 ≈ 0.8초 + 네트워크).  
  - 또는 **고정 개수** (예: 7개)만 채우면 **즉시 주행 시작** 버튼/자동 시작.
- **방향 필터**: 위 2.2와 동일하게 **findStreetViewInDirection** 사용.

### 3.3 주행 중 온디맨드 로딩

- **입력**: 현재 pathIndex(또는 거리), path, 기존 panoData.
- **로직**  
  1. 현재 위치에 해당하는 pano가 **panoData에 있으면** → `setPanoramaViewByPanoId` 만 호출 (API 0).  
  2. **없으면**  
     - 주행 방향으로 **다음 샘플 점** 계산 (예: 현재 + 15m 또는 다음 pathIndex).  
     - **findStreetViewInDirection(pathPoint, pathNext, radius)** 호출.  
     - 성공 시 **PanoDataItem** 만들어 panoData에 **append** (또는 route state 업데이트).  
     - 실패 시 radius 줄이거나, 다음 점으로 재시도 (기존 3단계 복구 전략 유지).
- **캐시**  
  - panoData는 **pathIndex 기준**으로 보관.  
  - 동일 pathIndex(또는 동일 거리 버킷)에 대해 **한 번만** getPanorama 호출.

### 3.4 요청 제한 (세마포어 + throttle)

- **세마포어**: 기존 `isSvSearching` 유지. 한 번에 **하나의 getPanorama**만 진행.
- **throttle**:  
  - 주행 중 연속 요청 시 **마지막 호출 후 80~100ms** 경과한 뒤에만 다음 getPanorama 호출.  
  - 또는 “다음 샘플 점까지 거리”가 일정 이상일 때만 요청 (불필요한 연속 호출 감소).

### 3.5 주행 방향 일관성 (건물 내부 등 방지)

- **위치**: getPanorama 요청 위치는 **항상 path 상 좌표** (경로 스냅 유지).
- **radius**: 작게 유지 (예: 20~30m).  
- **방향 필터**: 2.2 적용으로 **전방 반구** pano만 채택 → 후방/측면 pano 제거.

---

## 4. 구현 순서 제안

| 순서 | 항목 | 내용 |
|------|------|------|
| 1 | **주행 방향 필터** | `findStreetViewInDirection(service, pathPoint, pathNext, radius)` 구현. getPanorama 반환 후 bearingToPano vs driveHeading 각도로 필터, ±90° 이내만 채택. |
| 2 | **pre-fetch 최소화** | 초기 pre-fetch를 “앞 100~150m, 10~15m 간격”으로 제한. 기존 `preFetchStreetViewData`에서 **거리 상한·간격** 파라미터화. 모든 호출을 findStreetViewInDirection으로 교체. |
| 3 | **즉시 시작** | pre-fetch가 “N개 채움” 또는 “M초” 중 먼저 도달하면 주행 시작. (기존: 전체 경로 pre-fetch 후 시작.) |
| 4 | **주행 중 온디맨드** | panoData에 없을 때만 getPanorama(findStreetViewInDirection) 호출 → 결과를 panoData에 append. route state 또는 ref로 panoData 갱신. |
| 5 | **캐시·throttle** | 동일 pathIndex(또는 거리 버킷) 재요청 방지. 세마포어 + 80~100ms 간격 유지. |

---

## 5. 데이터 구조 (유지·확장)

- **PanoDataItem**: `{ pathIndex, panoId, location, heading }` 유지.
- **RouteInfo.panoData**:  
  - 초기에는 **일부만** 채워진 배열.  
  - 주행 중 **온디맨드로 append** (기존 항목과 pathIndex 순 유지).  
- **getPanoDataForIndex**: 기존처럼 “currentIndex 이하 최대 pathIndex” pano 반환.  
  - 캐시에 없으면 온디맨드 로딩 트리거 후, 다음 프레임에서 반환.

이 방안대로 구현하면 **생략 없음**, **빠른 시작**, **주행 방향 일관성**, **캐시·요청 제한에 의한 트래픽 완화**를 동시에 만족할 수 있다.

---

## 6. 구현 완료 사항 (코드 반영)

- **주행 방향 필터**: `findStreetViewInDirection(service, pathPoint, pathNext, pathIndex, path, radius, maxAngleDeg)` 추가. getPanorama 반환 후 `bearingToPano` vs `driveHeading` 각도 차이 ±90° 이내만 채택.
- **초기 pre-fetch**: `preFetchStreetViewData(..., { maxDistanceM: 150, intervalM: 15 })` 로 **앞 150m만** 15m 간격 수집 → 빠른 시작.
- **주행 중 온디맨드**: `currentIdx >= lastPano.pathIndex - 50` 일 때 다음 150m 구간을 `preFetchStreetViewData(..., { fromDistanceM, maxDistanceM, intervalM: 15 })` 로 요청 후 `panoData`에 append.
- **캐시·요청 제한**: `isSegmentFetchingRef` 로 세그먼트 중복 요청 방지. 호출 간 80ms 유지.
- **fallback(캐시 없을 때)**: 기존 `findStreetView` 대신 `findStreetViewInDirection` 우선 사용, 실패 시에만 `findStreetView(100)` 사용.
