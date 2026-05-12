# 오픈소스 라이선스 (Open Source Licenses)

**Ride the World – Indoor Cycling**  
최종 업데이트: 2026년 5월

---

## 1. 개요

본 앱(**Ride the World – Indoor Cycling**)은 여러 오픈소스 소프트웨어 구성 요소와 지도·데이터 서비스를 사용하여 제작되었습니다. 아래에는 **지도·지오코딩·경로·표고·거리 이미지**와 **소프트웨어 패키지** 및 적용되는 라이선스·이용 조건을 안내합니다.

---

## 2. 지도·데이터 서비스 (Map & Data Services)

앱의 지도 표시, 지오코딩, 경로 검색, 표고 데이터, 거리 이미지는 아래 서비스를 이용합니다. 각 제공처의 이용 조건·저작권·고지(지도 내 표기 포함)를 준수합니다.

| 서비스 | 용도 | 라이선스 / 이용 조건 |
|--------|------|---------------------|
| **Mapbox** | 인터랙티브 지도(Mapbox GL), 스타일/타일; 토큰 설정 시 Mapbox 지오코딩 | [Mapbox 이용약관](https://www.mapbox.com/legal/tos). 고지에는 © Mapbox 및 제3자 데이터(예: OpenStreetMap) 등이 앱 표시에 따라 포함될 수 있습니다. |
| **OpenStreetMap (OSM)** | 지도·경로 등의 기초 지리 데이터(Mapbox·OSRM 등 경유) | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). ODbL 및 OSM 고지 지침(OSM 데이터가 사용되는 범위). |
| **Nominatim** | Mapbox를 쓸 수 없을 때의 지오코딩(검색·역지오코딩) 폴백 | OSM 기반. [Nominatim 사용 정책](https://operations.osmfoundation.org/policies/nominatim/) 참고. |
| **OSRM** (Open Source Routing Machine) | 자동차/자전거/도보 경로 계산(공개 엔드포인트, 예: routing.openstreetmap.de 및 폴백) | OSM 기반. 해당 공개 인스턴스의 이용 약관 적용. |
| **Open-Elevation** | 경로 상 표고 조회 | 해당 API 제공자의 이용 조건·고지 따름. |
| **OpenTopoData** | 앱/서버 프록시를 통한 표고(사용 시) | OpenTopoData 및 하위 데이터셋 라이선스(제공처 사이트 참고). |
| **Valhalla / Stadia Maps** (선택) | Valhalla 엔드포인트(예: Stadia) 설정 시 대체 표고(경로 높이) | 구성한 운영자 약관(예: [Stadia Maps](https://stadiamaps.com/terms/)) 및 Valhalla/OSM 데이터 고지. |
| **Mapillary** | 커버리지가 있을 때 뷰어의 거리 수준 시퀀스·360° 이미지 | Mapillary / Meta 약관, API 규정, 이미지 고지 준수. |

- 지도·경로·표고 데이터의 **정확성·가용성**은 각 제공처의 책임이며, 앱 운영자는 이를 보장하지 않습니다.
- 전체 라이선스 문구 및 최신 정책은 각 서비스 공식 사이트를 참고하세요.

---

## 3. 사용 중인 오픈소스 소프트웨어 (패키지)

### 3.1 실행/런타임 의존성 (dependencies)

| 패키지 | 설명 | 라이선스 |
|---------|------|----------|
| react | 사용자 인터페이스 라이브러리 | MIT |
| react-dom | React용 DOM 렌더러 | MIT |
| mapbox-gl | 인터랙티브 지도 렌더링(WebGL) | 패키지 내 `LICENSE.txt` 참고(Mapbox GL JS) |
| mapillary-js | 거리 이미지 뷰어 | MIT |
| lucide-react | 아이콘 컴포넌트 라이브러리 | ISC |
| recharts | 차트 및 데이터 시각화 라이브러리 | MIT |
| @capacitor/*, firebase, 커뮤니티 플러그인 | 네이티브 연동, 설정에 따른 분석/광고 등 | 각 패키지 [npm](https://www.npmjs.com) 페이지 참고 |

### 3.2 개발 의존성 (devDependencies)

| 패키지 | 설명 | 라이선스 |
|---------|------|----------|
| typescript | TypeScript 언어 및 컴파일러 | Apache-2.0 |
| vite | 프론트엔드 빌드 도구 | MIT |
| @vitejs/plugin-react | Vite React 플러그인 | MIT |
| react (types), react-dom (types) | React 타입 정의 | MIT (해당 타입 패키지 정책 따름) |
| @types/node | Node.js 타입 정의 | MIT |
| tailwindcss | 유틸리티 기반 CSS 프레임워크 | MIT |
| postcss | CSS 변환 도구 | MIT |
| autoprefixer | CSS 벤더 접두사 자동 추가 | MIT |

---

## 4. 주요 라이선스 요약

- **MIT**  
  사용·복제·수정·배포·상업적 이용이 가능하며, 라이선스 문구와 저작권 표시를 유지하면 됩니다. React 생태계 대부분이 이 라이선스를 사용합니다.

- **Apache-2.0**  
  사용·복제·수정·배포·특허 사용 허여가 가능합니다. 변경 시 변경 사항을 명시하고 Apache-2.0 라이선스 문구와 고지를 포함해야 합니다. TypeScript 등이 이 라이선스를 사용합니다.

- **ISC**  
  이와 유사하게 관대한 조건이며, 저작권 표시와 라이선스 문구 유지가 필요합니다. lucide-react 등이 이 라이선스를 사용합니다.

---

## 5. 고지 및 준수

- 본 앱은 위 오픈소스 라이선스 조건을 준수합니다.
- 각 라이선스에서 요구하는 저작권 표시 및 라이선스 문구는 해당 패키지 배포물 또는 소스에 포함된 내용을 따릅니다.
- 정확한 라이선스 전문 및 최신 정보는 각 패키지의 공식 저장소(예: GitHub) 또는 [npm](https://www.npmjs.com) 패키지 페이지에서 확인하세요.

---

## 6. 문의

오픈소스 라이선스 관련 문의는 **LiveOnSoft** 또는 앱 내 안내된 채널로 연락해 주세요.
