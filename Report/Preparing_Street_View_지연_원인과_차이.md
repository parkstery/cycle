# "Preparing Street View..." 전·중 지연 — 원인과 차이

## 요약

- **첫 번째 지연**: Go 버튼 클릭 후 **"Preparing Street View..." 문구가 나오기 전**까지의 시간.
- **두 번째 지연**: **"Preparing Street View... (k/n)"** 가 표시된 **동안** 걸리는 시간.

두 구간 모두 네트워크·API 호출이 주된 원인이지만, **어떤 API를 쓰는지**와 **UI로 무엇이 보이는지**가 다릅니다.

---

## 1. 첫 번째 지연 (메시지 나오기 전)

### 언제 발생하는가

- 사용자가 **Go**를 누르면 `calculateRoute(mode, true)` 가 실행되고,  
  **`setAppPhase('PREPARING')` / `setPreparingProgress({ k: 0, n: 1 })` 가 호출되기 전**까지가 이 구간입니다.
- 즉, **경로 탐색·표고 조회·경로 가공**이 끝나고, **거리뷰 prefetch 비동기 함수가 막 시작될 때**까지입니다.

### 원인 (순서대로)

| 단계 | 처리 내용 | 지연 요인 |
|------|-----------|-----------|
| 1 | `setLoading(true)` | UI는 Go 버튼에 로딩(스피너)만 보임. 별도 문구 없음. |
| 2 | **주소 → 좌표 변환 (Nominatim)** | 출발·도착이 좌표가 아니면 **Nominatim API 1~2회** (출발, 도착 각각). 네트워크 지연. |
| 3 | **OSRM 경로 탐색** | `/api/osrm-route` 1회. 네트워크 + 서버 처리. |
| 4 | **표고 조회 (Open-Elevation)** | `openElevation.getElevationAlongPath(path, 100)` 1회. 네트워크. |
| 5 | **로컬 계산** | 경로 기반 주행 시간 계산, 경로 밀도 보정(densifiedPath), 마커·폴리라인·`setRoute` 등. CPU만 사용, 상대적으로 짧음. |
| 6 | **경로 전환 대응** | 시뮬레이션·거리뷰 ref 리셋, 시작점 `setPanoramaView` 호출(비동기, 여기서는 기다리지 않음). |

- **`setLoading(false)`** 는 위 흐름이 끝난 뒤 `finally`에서 한 번 호출됩니다.
- 그 직후 **비동기 IIFE**가 시작되면서 **`setAppPhase('PREPARING')`**, **`setPreparingProgress({ k: 0, n: 1 })`** 가 실행되고,  
  이때부터 화면에 **"Preparing Street View... (0/1)"** 이 보입니다.

### 정리

- **원인**: Nominatim(0~2회) + OSRM 1회 + Open-Elevation 1회 + 로컬 계산.
- **특징**:  
  - “Preparing Street View” 문구는 **아직 없음**.  
  - 사용자는 **Go 버튼 로딩(스피너)** 만 보다가, 곧바로 “Preparing Street View...” 로 이어짐.

---

## 2. 두 번째 지연 ("Preparing Street View..." 가 보이는 동안)

### 언제 발생하는가

- **`setAppPhase('PREPARING')`** 과 **`setPreparingProgress({ k: 0, n: 1 })`** 가 호출된 직후부터,  
  **`preFetchStreetViewData(...)` 가 끝나서**  
  **`setPreparingProgress(null)` / `setAppPhase('IDLE')`** 가 호출되기 전까지입니다.

### 원인 (preFetchStreetViewData 내부)

- **목적**: 경로 상 **처음 300m**를 **10m 간격**으로 샘플링해, 각 위치에서 **Street View 파노라마 ID·위치·방향**을 미리 수집합니다.
- **대략 샘플 수**: 300 ÷ 10 = **30개** 구간.

각 샘플(인덱스 k)마다:

| 처리 | 내용 | 지연 요인 |
|------|------|-----------|
| 1차 검색 (Pass1) | `findStreetViewInDirection` — 주행 방향 기준 반경 50m·각도 ±40° 내에서 **Google Street View(getPanorama)** 호출. | Google API 1회 이상. |
| 2차 검색 (Pass2, 필요 시) | Pass1에서 후보가 없으면 `findStreetView` — 반경 120m에서 한 번 더 **getPanorama** 호출. | Google API 추가 1회. |
| 실내 필터 등 | 후보 중 실내/상가 키워드 제외, 거리·각도 점수로 선택. | 로컬 연산만, 짧음. |
| 다음 샘플 전 대기 | `await new Promise(r => setTimeout(r, 80))` — **80ms** 대기. | 샘플 간 80ms × (n−1). |

- **진행률**: `onProgress(k + 1, n)` 으로 **"Preparing Street View... (k/n)"** 숫자가 갱신됩니다.

### 정리

- **원인**:  
  - **Google Street View getPanorama** 를 샘플당 1~2회 호출 (최대 약 30×2회).  
  - 샘플 간 **80ms** 지연.
- **특징**:  
  - 이 구간에서만 **"Preparing Street View... (k/n)"** 메시지가 보임.  
  - 지연은 **거리뷰 전용 prefetch** 때문이며, **경로/표고 API와는 무관**합니다.

---

## 3. 두 지연의 차이

| 구분 | 첫 번째 지연 (메시지 전) | 두 번째 지연 (메시지 중) |
|------|---------------------------|---------------------------|
| **화면** | Go 버튼 로딩(스피너)만 보임. “Preparing Street View” 없음. | “Preparing Street View... (k/n)” 표시. |
| **주요 원인** | Nominatim(0~2) + **OSRM** + **Open-Elevation** + 로컬 계산. | **Google Street View getPanorama** 반복(약 30 샘플 × 1~2회) + 샘플 간 80ms. |
| **역할** | **경로 확정** (어디로 갈지, 표고, 밀도 보정). | **거리뷰 캐시 확보** (주행 중 바로 쓸 파노라마 목록). |
| **API** | Nominatim, OSRM(프록시), Open-Elevation. | Google Maps Street View. |

- **첫 번째**: “경로를 정하고, 지도에 그리기까지”의 지연.  
- **두 번째**: “그 경로 위에서 거리뷰를 미리 불러오는” 지연.

---

## 4. 참고 (코드 위치)

- **첫 번째 지연**: `App.tsx` 내 `calculateRoute` — `setLoading(true)` 직후 ~ `(async () => { setAppPhase('PREPARING'); ... })()` 진입 전 (Nominatim, OSRM, Elevation, densifiedPath, setRoute, 리셋 블록, setPanoramaView 호출까지).
- **두 번째 지연**: 같은 비동기 IIFE 안의 **`await preFetchStreetViewData(densifiedPath, ..., { maxDistanceM: 300, intervalM: 10 })`** 구간.
- **"Preparing Street View..." 표시**: `appPhase === 'PREPARING' && preparingProgress` 일 때, `preparingProgress.k / preparingProgress.n` 으로 표시.
