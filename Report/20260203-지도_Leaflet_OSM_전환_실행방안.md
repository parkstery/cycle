# 지도 타일 → Leaflet + OSM 전환 실행 방안

**결론:** **할 수 있다.** 다만 “타일만 바꾼다”가 아니라 **지도 엔진 전체를 Leaflet+OSM으로 바꾸는 작업**이라 규모가 크고, **Street View(거리뷰)** 는 OSM에 대체 서비스가 없어 여기서 난이도가 가장 높다. 단계를 나누고, Street View는 “유지·축소·제거” 중 하나를 정책으로 정한 뒤 진행하는 편이 현실적이다.

---

## 1. 왜 “쉽지 않아 보이는가”

- **타일만 바꾸는 게 아님**  
  현재는 `google.maps.Map` 위에 경로·마커·Street View·Places가 모두 붙어 있다. Google 지도 객체를 없애고 Leaflet으로 바꾸면, 그 위에 붙어 있던 **모든 기능**을 Leaflet/OSM/기타 서비스로 다시 구현하거나 제거해야 한다.
- **Street View**  
  구글 거리뷰와 동일한 수준의 오픈 대체재는 없다. Mapillary 등으로 “비슷한” 경험을 만들 수는 있으나 API·UI·데이터 구조가 달라 **별도 설계·개발**이 필요하다.
- **Geometry·좌표계**  
  거리·방위·오프셋 등이 `google.maps.geometry.spherical`에 강하게 묶여 있어, Leaflet으로 옮기려면 **공통 유틸(또는 Turf.js)** 로 추상화해야 한다.
- **Places(장소)**  
  지도 클릭 시 `placeId`로 상세 조회, 검색창 `findPlaceFromQuery`는 현재 전부 Google이다. Leaflet 전환 시 검색은 Nominatim으로 이미 대체 가능하고, **placeId 클릭**은 제거하거나 Overpass/Nominatim 등으로 대체해야 한다.

그래서 “지도 타일만 OSM으로”가 아니라 **“지도 스택 전체를 Leaflet+OSM 중심으로 재구성”** 이라고 보는 것이 맞다.

---

## 2. 현재 Google Maps 의존 범위 정리

| 구분 | 용도 | 대체 가능성 | 비고 |
|------|------|-------------|------|
| **지도 컨테이너** | `google.maps.Map` (div, 중심, 줌, 스타일) | ✅ Leaflet + OSM 타일 | 전환 핵심 |
| **타일** | 기본 로드 타일 | ✅ OSM (예: Carto, OSM default) | 비용 제거 |
| **경로선** | `DirectionsRenderer` / `Polyline` | ✅ Leaflet Polyline | path 배열만 있으면 됨 |
| **마커** | A/B/경유/시뮬/검색 마커 | ✅ Leaflet CircleMarker 또는 DivIcon | |
| **좌표·범위** | `LatLng`, `LatLngBounds` | ✅ Leaflet `L.latLng`, `L.latLngBounds` | 형식만 통일 |
| **Geometry** | `computeDistanceBetween`, `computeHeading`, `computeOffset`, `encodePath`/`decodePath` | ✅ Turf.js 또는 자체 유틸 | 전역 치환 필요 |
| **경로 탐색** | `DirectionsService` (1차) | ✅ OSRM만 사용 또는 OSRM 1차 | 이미 폴백 있음 |
| **지오코딩** | Geocoder | ✅ Nominatim (이미 적용) | |
| **고도** | ElevationService | ✅ Open-Elevation (이미 적용) | |
| **장소 검색** | `findPlaceFromQuery` | ✅ Nominatim search (이미 있음) | |
| **지도 클릭(placeId)** | `getDetails(placeId)` | ⚠️ 제거 또는 Overpass/Nominatim으로 대체 | placeId는 Google 전용 |
| **지도 클릭(좌표)** | 역지오코딩 | ✅ Nominatim reverse (이미 적용) | |
| **Street View** | StreetViewService, StreetViewPanorama, CoverageLayer | ❌ OSM에 동일 없음 | 유지=Google 일부 유지, 또는 Mapillary/제거 |
| **이벤트** | `addListener`, `trigger('resize')` | ✅ Leaflet `on`, `invalidateSize` | |
| **fitBounds** | 경로가 보이도록 뷰 조정 | ✅ `map.fitBounds(L.latLngBounds(...))` | |

정리하면, **Street View**와 **placeId 기반 장소 상세** 두 가지가 “완전 오픈소스화”를 막는 지점이다.

---

## 3. 실행 가능한 두 가지 방향

### 방향 A: Leaflet+OSM 전환 + Street View 제거(또는 비활성)

- **범위:** 지도·경로·마커·검색·경로탐색(OSRM)·고도·지오코딩 전부 Leaflet/OSM/Open-Elevation/Nominatim으로.
- **Street View:** 기능 제거 또는 “준비 중” 플레이스홀더. 추후 Mapillary 연동을 별도 과제로 둠.
- **장소:** placeId 클릭 시 상세는 제거하고, “클릭 좌표 + Nominatim reverse”만 지원.
- **장점:** Google Maps API 의존을 **완전히** 제거 가능. 비용·라이선스 단순.
- **단점:** 거리뷰 기능 상실(또는 대기).

### 방향 B: Leaflet+OSM 전환 + Street View만 Google 유지

- **범위:** 방향 A와 동일하게 지도·경로·마커 등은 Leaflet+OSM.
- **Street View:** iframe 또는 최소한의 Google Maps JS(Street View만 로드)로 유지. 지도 타일/경로/Places 등은 더 이상 Google 안 씀.
- **장점:** 사용자 경험상 “거리뷰”는 유지.
- **단점:** Google API 키와 Street View 과금은 남음. 구조상 “지도는 Leaflet, 거리뷰만 Google” 분리가 필요.

**권장:** 먼저 **방향 A**로 계획을 세우고, “거리뷰는 1단계에서 제거/비활성”으로 두고, 2단계에서 “필요 시 방향 B(Google SV만 유지)” 또는 “Mapillary 검토”를 넣는 식이 현실적이다.

---

## 4. 구체적 실행 방안 (방향 A 기준)

### 4.1 공통: Geometry 추상화

- **목적:** `google.maps.geometry.spherical` / `encoding` 호출을 한 곳으로 모아, 나중에 Leaflet용 구현으로 교체 가능하게.
- **파일:** `services/geoUtils.ts` (신규) 또는 기존 유틸에 함수 추가.
- **제공 함수(예):**
  - `computeDistanceBetween(a, b): number` (미터)
  - `computeHeading(from, to): number` (도)
  - `computeOffset(from, distanceM, heading): { lat, lng }`
  - `decodePolyline(encoded: string): Array<[lat, lng]>` (OSRM polyline은 이미 사용 중이면 그대로 활용)
- **구현:**  
  - 1단계: 내부에서만 `google.maps.geometry` 호출하도록 래핑 (인자는 `{ lat, lng }` 또는 `[lat, lng]`).  
  - 2단계: Leaflet 전환 시 이 파일만 Haversine/Turf 기반으로 교체.
- **치환:** App.tsx·aiCoach.ts 등에서 `google.maps.geometry.*` 호출을 전부 `geoUtils.*`로 변경.

### 4.2 1단계: Leaflet 맵 + OSM 타일 + 경로/마커

- **의존성:** `leaflet`, `@types/leaflet` 추가. (React 래퍼는 선택: `react-leaflet` 또는 ref로 DOM 직접 전달.)
- **지도 div:**  
  - 기존 `mapRef`에 `L.map(mapRef.current, { center: [37.5512, 126.9882], zoom: 14 })` 초기화.  
  - 타일: `L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '...' }).addTo(map)`.
- **경로선:**  
  - Directions/OSRM으로 얻은 `path`를 `[lat, lng][]` 형태로 통일.  
  - `L.polyline(path, { color: '#3b82f6', weight: 5 }).addTo(map)` (DirectionsRenderer 제거).
- **마커:**  
  - `createCustomMarker` → Leaflet `L.circleMarker` 또는 `L.marker` + `L.divIcon` (라벨/색).  
  - `setMap(null)` → `.remove()` 또는 `.removeFrom(map)`.
- **이벤트:**  
  - 지도 클릭: `map.on('click', (e) => { e.latlng.lat, e.latlng.lng })` → 기존처럼 Nominatim reverse 호출.  
  - **placeId:** Leaflet에는 placeId가 없으므로, 클릭 시 “좌표 기반 역지오코딩만” 지원하거나, 클릭한 위치 근처 POI를 Overpass로 조회하는 방식으로 확장.
- **fitBounds:**  
  - path로 `L.latLngBounds` 만들고 `map.fitBounds(bounds)`.
- **resize:**  
  - 풀스크린 등 레이아웃 변경 후 `map.invalidateSize()`.
- **스크립트:**  
  - `index.html` 또는 진입점에서 Google Maps JS 로드 제거.  
  - `googleMap.current`, `directionsRenderer.current` 등 ref를 Leaflet 인스턴스와 polyline/marker 레이어로 교체.

이 단계까지 하면 “지도 타일 + 경로 + 마커”는 Leaflet+OSM만으로 동작한다.

### 4.3 2단계: 경로 탐색·고도·검색 정리

- **경로:**  
  - Google Directions 제거하고 **OSRM만** 사용하거나, 기존처럼 1차 OSRM·실패 시 재시도 등 정책만 정리.  
  - 응답 polyline은 이미 받고 있으므로 4.2의 `L.polyline`에 그대로 넘기면 됨.
- **고도:**  
  - Open-Elevation 이미 사용 중.  
  - 경로 좌표는 Leaflet 형식 `[lat, lng]`로 통일해도 openElevation 서비스는 “lat/lng 있는 객체”만 있으면 되므로 호환 가능.
- **검색:**  
  - `findPlaceFromQuery` 제거 후, 검색창은 Nominatim search만 사용 (이미 구현된 검색 플로우가 있다면 그쪽만 Nominatim 결과로 연결).  
  - 검색 결과 마커는 Leaflet 마커로 표시.

### 4.4 3단계: Street View 처리 (정책 선택)

- **옵션 1 (완전 제거):**  
  - Street View UI·preFetch·시뮬 중 파노 전환 로직 전부 제거 또는 비활성.  
  - “거리뷰는 지원하지 않음” 또는 “추후 제공 예정” 문구로 대체.
- **옵션 2 (Google SV만 유지):**  
  - 지도는 Leaflet, 거리뷰만 별도 div + Google Street View Panorama(최소 스크립트) 또는 iframe.  
  - API 키는 Street View용으로만 제한해 두고, 나머지 Maps API는 제거.
- **옵션 3 (Mapillary 도입):**  
  - Mapillary API로 시퀀스/이미지 조회 후, 시뮬 경로와 매칭해 표시.  
  - UI·데이터 모델이 현재 파노라마와 다르므로 별도 설계·개발 필요 (일정·공수 크게 증가).

실무적으로는 **1단계·2단계까지 완료한 뒤**, “Street View 제거”로 출시하고, 필요 시 3단계에서 옵션 2 또는 3을 검토하는 흐름을 권장한다.

### 4.5 4단계: Places 정리·기타

- **placeId 클릭:**  
  - 제거하거나, 클릭한 좌표로 Nominatim reverse + (선택) Overpass로 근처 POI 이름 보강.
- **지도 타입 전환:**  
  - 현재 `getMapTypeId`/`setMapTypeId`(roadmap/hybrid)는 Leaflet에서 다른 타일 레이어로 전환 (예: OSM → Satellite는 다른 타일 URL 또는 Esri 등)으로 대체 가능.
- **preconnect:**  
  - `index.html`의 `maps.googleapis.com` preconnect 제거 (Street View 유지 시 해당 리소스만 유지).

---

## 5. 작업량·일정 감 (참고)

| 단계 | 내용 | 예상 공수 |
|------|------|-----------|
| Geometry 추상화 | geoUtils 도입 + 전역 치환 | 0.5~1일 |
| Leaflet 맵 + 타일 + 경로/마커 | 초기화·이벤트·ref 정리 | 1~2일 |
| OSRM 전용·고도·검색 정리 | Directions 제거·Nominatim 검색만 | 0.5일 |
| Street View 제거 또는 유지 | 제거 시 0.5일 / Google 유지 시 1일 / Mapillary는 별도 설계 | 0.5~2일+ |
| 통합 테스트·엣지 케이스 | 시뮬·저장·즐겨찾기·풀스크린 등 | 1~2일 |
| **합계** | | **약 4~8일** (Street View 제거 가정 시 4~5일) |

---

## 6. 요약

- **할 수 있는가:** **한다.** 지도 타일을 OSM으로 바꾸는 것은 “Leaflet 맵 + OSM 타일 + 기존 경로/마커/검색/경로탐색/고도 로직을 Leaflet·좌표 형식에 맞게 이식”하면 가능하다.
- **어려운 부분:**  
  - **Street View** (OSM에 대체 없음 → 제거·Google만 유지·Mapillary 중 선택),  
  - **Geometry·좌표 의존성** (추상화 레이어로 한 번 감싸야 함),  
  - **placeId 기반 장소** (제거 또는 다른 데이터 소스로 대체).
- **권장 순서:**  
  1) Geometry 추상화(geoUtils) 및 호출부 치환  
  2) Leaflet 맵 + OSM 타일 + 경로/마커/이벤트/fitBounds  
  3) OSRM 전용·검색(Nominatim)·고도 정리  
  4) Street View는 1단계에서 제거 또는 플레이스홀더로 두고, 필요 시 나중에 Google SV만 유지하거나 Mapillary 검토  

이 순서로 진행하면 “지도 타일 → Leaflet+OSM”을 포함한 **지도 스택 전환**을 단계적으로 완료할 수 있다.
