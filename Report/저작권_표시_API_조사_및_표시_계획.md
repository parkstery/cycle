# 저작권 표시 대상 API 조사 및 표시 계획

## 1. 프로젝트에서 사용 중인 외부 API·데이터 소스

| 구분 | 서비스명 | 용도 | 사용 위치 |
|------|----------|------|-----------|
| 1 | **Google Maps Platform** (Maps JavaScript API) | 베이스맵, Street View(거리뷰), 마커·폴리라인·이벤트 | App.tsx (맵·거리뷰·경로 표시) |
| 2 | **Nominatim** (OpenStreetMap) | 주소→좌표(지오코딩), 좌표→주소(역지오코딩) | services/nominatim.ts, api/nominatim-search.js, nominatim-reverse.js |
| 3 | **OSRM** (Open Source Routing Machine) | 경로 탐색(자동차/자전거/도보) | api/osrm-route.js, App.tsx (경로 요청) |
| 4 | **Open-Elevation** | 경로 상 표고(고도) 조회 | services/openElevation.ts |

---

## 2. API별 저작권·표기 요구사항 조사 결과

### 2.1 Google Maps Platform (Maps JavaScript API, Street View)

- **근거**: [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms), [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- **요구사항**  
  - 모든 Google Maps Platform 서비스는 **Documentation에 따른 표기(attribution)** 가 필요함.  
  - 지도를 **표시하는 경우**: API가 기본으로 제공하는 **저작권/로고 영역**을 수정·제거하면 안 되며, 사용자가 볼 수 있게 유지해야 함.  
  - Directions/Geocoding 등 **지도 없이** 콘텐츠만 사용하는 경우에는 **Google에 대한 표기를 반드시** 해야 함.
- **현재 앱**  
  - Google **지도와 Street View를 모두 표시**하고 있음.  
  - `disableDefaultUI: true` 를 쓰지 않으므로, 맵 하단의 **Google 로고·저작권 영역**은 API 기본 UI로 노출될 수 있음.  
  - 다만 **zoomControl, fullscreenControl, mapTypeControl** 등 일부를 `false` 로 두었으므로, **저작권/로고가 항상 보이도록** Documentation을 확인하고 가리지 않도록 할 것.
- **권장 표기 문구(보조)**  
  - 설정/정보 화면 등에: `"Maps & Street View © Google"` 또는 Google이 제공하는 공식 표기 문구 사용.

### 2.2 Nominatim (OpenStreetMap)

- **근거**: [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/), [OSM Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) (ODbL)
- **요구사항**  
  - OSM 데이터는 **ODbL(Open Database License)** 에 따라 **저작권 표기 의무**가 있음.  
  - 표기는 **이용자에게 보이도록**, **작품(맵/앱) 인근 또는 일반적으로 표기를 찾을 수 있는 위치**에 두어야 함.  
  - **"© OpenStreetMap contributors"** 또는 **"OpenStreetMap"** 을 포함하고, 가능하면 [https://www.openstreetmap.org/copyright](https://www.openstreetmap.org/copyright) 로 연결.
- **추가**  
  - Nominatim 사용 정책: 1 req/s, 유효한 User-Agent/Referer 필요(이미 프로젝트에서 적용 중).

### 2.3 OSRM (Open Source Routing Machine)

- **근거**: OSRM은 BSD 라이선스이나, **경로 데이터**는 OSM 도로망을 사용 → **ODbL 표기 의무**  
  - [OSM Licence/Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)
- **요구사항**  
  - 경로 결과를 **지도 위에 표시**하므로, OSM 데이터를 이용한 “작품”에 해당.  
  - **OpenStreetMap** 에 대한 표기를 하면 OSRM 경로 데이터 사용도 함께 충족 가능.  
  - 표기 위치: 맵/경로를 보는 화면 인근 또는 앱 내 Credits/정보 화면.

### 2.4 Open-Elevation

- **근거**: [open-elevation.com](https://www.open-elevation.com/), [GitHub (Jorl17/open-elevation)](https://github.com/Jorl17/open-elevation) — 소프트웨어 GPLv2
- **조사 결과**  
  - 공개된 **이용약관·저작권 표기 정책** 문서는 검색 결과에 명시적으로 나오지 않음.  
  - 오픈소스 프로젝트이므로 **신규 도입·수정 시 GPLv2** 고려 필요.  
  - **데이터** 출처(고도 데이터 제공처)가 문서에 없으면, **서비스명·URL** 정도를 Credits에 넣는 것이 무난함.
- **권장**  
  - 표고 기능 사용에 대한 **선의의 표기**: 예) `"Elevation data: Open-Elevation (open-elevation.com)"` 를 Credits/정보 화면에 포함.  
  - 추후 공식 정책이 나오면 그에 맞춰 수정.

---

## 3. 현재 앱의 저작권 표시 상태

- **확인 결과**:  
  - **index.html**, **App.tsx** 및 기타 UI에서 **저작권/Attribution 전용 문구나 블록**은 없음.  
  - Google 맵은 기본 UI에 로고·저작권이 포함될 수 있으나, **OSM/Nominatim, OSRM, Open-Elevation** 에 대한 **명시적 표기**는 없음.

---

## 4. 저작권 표시 계획

### 4.1 표시 원칙

- **Google**: API 기본 저작권 영역을 가리지 않고, 필요 시 앱 내 “지도/거리뷰 출처” 문구 보조 표기.  
- **OpenStreetMap / Nominatim / OSRM**: ODbL 요구에 따라 **반드시** “OpenStreetMap” (및 가능하면 © contributors, 링크) 표기.  
- **Open-Elevation**: 정책이 명확하지 않으나 **Credits** 에 서비스명·URL 표기 권장.

### 4.2 표시 위치·방식 제안

| 우선순위 | 위치 | 방식 | 대상 |
|----------|------|------|------|
| 1 | **맵/거리뷰 영역 하단** | 작은 글씨로 항상 노출(또는 맵 컨테이너 하단 고정) | OpenStreetMap © contributors (링크), Google(보조) |
| 2 | **설정 또는 정보(Credits) 화면** | “지도·경로·표고 출처” 섹션에 상세 표기 | Google Maps & Street View, Nominatim, OSRM, Open-Elevation (각 1줄 + URL) |
| 3 | **앱 푸터 또는 About** | PWA/웹 앱이면 푸터/About에 “Map data © OpenStreetMap, © Google” 등 요약 | 전체 요약 |

### 4.3 권장 표기 문구 (복사용)

- **맵/화면 하단용 (한 줄)**  
  `Map © OpenStreetMap contributors · Maps & Street View © Google`
- **정보/Credits 화면용 (상세)**  
  - **Maps & Street View**: Google Maps Platform ([Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms))  
  - **Geocoding & Reverse Geocoding**: Nominatim (OpenStreetMap) — [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)  
  - **Routing**: OSRM (Open Source Routing Machine), data © OpenStreetMap contributors  
  - **Elevation**: Open-Elevation ([open-elevation.com](https://www.open-elevation.com/))

### 4.4 구현 시 유의사항

- **Google**  
  - 맵/Street View 컨테이너에서 **저작권·로고가 들어 있는 기본 UI 영역을 CSS/overflow로 잘리거나 숨기지 않을 것**.  
  - `disableDefaultUI: true` 사용 시에는 Documentation에서 요구하는 **수동 표기** 방법을 반드시 적용할 것.
- **OpenStreetMap**  
  - “OpenStreetMap” 텍스트는 **링크**로 두고 `https://www.openstreetmap.org/copyright` 연결 권장.  
  - 맵과 같은 화면에서 **읽기 쉽게** 유지(작은 글씨라도 대비·크기 확보).

### 4.5 작업 체크리스트 (표시 계획 실행 시)

- [ ] 맵/거리뷰 영역 하단에 **OpenStreetMap** (및 선택적으로 Google) 한 줄 표기 컴포넌트 추가
- [ ] **정보/Credits** 화면 또는 설정 내 “지도·경로·표고 출처” 섹션 추가 후, 위 4.3 상세 문구 반영
- [ ] Google 기본 저작권 영역이 가려지지 않았는지 **화면별 점검**
- [ ] (선택) 푸터 또는 About에 요약 문구 추가
- [ ] (선택) Open-Elevation 공식 이용약관·표기 정책이 나오면 문구 업데이트

---

## 5. 요약

| API | 표기 필요 여부 | 권장 표기 위치 |
|-----|----------------|----------------|
| Google Maps & Street View | 예 (기본 UI 유지 + 보조 문구 가능) | 맵 기본 UI 유지, 정보 화면 |
| Nominatim (OSM) | **예 (필수)** | 맵 하단 + 정보 화면 |
| OSRM | **예 (OSM 데이터)** | 맵 하단(OSM과 통합) + 정보 화면 |
| Open-Elevation | 권장(선의) | 정보/Credits 화면 |

저작권 표시 계획의 **핵심**은 (1) **OpenStreetMap** 에 대한 표기를 **맵/경로를 보는 화면 인근**에 반드시 두는 것, (2) **Google** 기본 표기를 가리지 않는 것, (3) **상세 출처**는 정보/Credits 화면에 두는 것이다.
