# 소개 (About)

**Ride the World – Indoor Cycling**  
최종 업데이트: 2026년 5월

---

## 1. 앱 소개

**Ride the World – Indoor Cycling**은 실제 지도 위에서 자전거 경로를 계획하고, 고도(표고)를 확인하며, 선택한 경로를 실내에서 시뮬레이션할 수 있는 앱입니다. 전 세계 어디든 경로를 설정해 실내 자전거로 그 구간을 타는 듯한 경험을 제공합니다.

---

## 2. 주요 기능

- **실제 지도 기반 경로 계획**  
  출발지·도착지·경유지를 입력하거나 지도에서 지정해 자전거·도보·자동차 경로를 검색합니다.

- **고도(표고) 분석**  
  경로 구간의 표고 차트를 보고 오르막·내리막 구간을 미리 확인할 수 있습니다.

- **주행 시뮬레이션**  
  선택한 경로를 따라 속도를 조절하며 실내에서 주행을 시뮬레이션합니다.

- **거리 이미지(Mapillary)**  
  커버리지가 있는 구간에서 경로를 따라 거리 수준 이미지를 재생할 수 있습니다.

- **AI 코칭·배경 음악**  
  (해당 기능이 포함된 경우) 주행 중 코칭 및 배경 음악 등 부가 기능을 이용할 수 있습니다.

---

## 3. 이런 분들에게

- 새로운 자전거 코스를 계획하고 싶은 사이클리스트  
- 낯선 지역의 자전거 경로를 미리 살펴보고 싶은 이용자  
- 오르막·내리막을 확인한 뒤 라이딩을 계획하고 싶은 이용자  
- 실내에서 전 세계 경로를 시뮬레이션하며 운동하고 싶은 이용자  

---

## 4. 기술 스택

- **프론트엔드**  
  React 18, TypeScript, Vite, Tailwind CSS

- **지도·데이터**  
  지도 표시는 Mapbox GL JS; 경로·표고·지오코딩·거리 이미지는 외부 API(Mapbox, OSRM, OpenStreetMap/Nominatim, Open-Elevation, OpenTopoData, Mapillary, 설정 시 Valhalla/Stadia 등)로 제공됩니다.

---

## 5. 데이터 출처 및 크레딧

| 구분 | 설명 |
|------|------|
| **지도** | Mapbox(스타일/타일 및 Mapbox GL). Mapbox 이용약관 적용; 지도 고지에 © Mapbox, © OpenStreetMap 등이 표시될 수 있습니다. |
| **경로 검색(라우팅)** | OSRM. 공개 서비스(예: routing.openstreetmap.de 및 폴백) 사용. Data © OpenStreetMap contributors. |
| **주소·장소 검색(지오코딩)** | 토큰 설정 시 Mapbox Geocoding; 그 외 Nominatim(OpenStreetMap). OSM 기반 결과: © OpenStreetMap contributors. |
| **표고(고도) 데이터** | Open-Elevation API; 앱 표고 프록시 사용 시 OpenTopoData; 설정 시 Valhalla 기반 표고 API(예: Stadia Maps 등 HTTPS 엔드포인트). |
| **거리 이미지** | 사용 시 Mapillary; Mapillary / Meta 약관 및 이미지 고지를 따릅니다. |
| **아이콘** | Lucide Icons (Lucide React) |

각 서비스의 이용 조건·저작권·면책 사항은 해당 제공처의 정책을 따릅니다.

---

## 6. 면책

본 앱은 **경로 탐색·시뮬레이션·피트니스 엔터테인먼트** 목적으로만 제공됩니다. 지도·경로·표고 정보는 근사치이며 실제 도로·통제·공사 등과 다를 수 있으므로, **실제 야외 주행·내비게이션·안전 판단에는 사용하지 마세요.** 이용은 **자기 책임** 하에 하시며, 운동 시작 전 필요 시 의사 또는 건강·운동 전문가와 상담하시기 바랍니다. 자세한 내용은 **면책조항(DISCLAIMER_KO.md)** 및 **이용약관(TERMS_OF_SERVICE_KO.md)** 을 참고하세요.

---

## 7. 제작·저작권

**Ride the World – Indoor Cycling** © 2026 **LiveOnSoft**
