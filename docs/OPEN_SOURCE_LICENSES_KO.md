# 오픈소스 라이선스 (Open Source Licenses)

**Ride the World – Indoor Cycling**  
최종 업데이트: 2026년 3월

---

## 1. 개요

본 앱(**Ride the World – Indoor Cycling**)은 여러 오픈소스 소프트웨어와 지도·데이터 서비스를 사용하여 제작되었습니다. 아래에는 **지도·경로·표고 등 데이터 서비스**와 **소프트웨어 패키지**별로 적용된 라이선스·이용 조건을 안내합니다.

---

## 2. 지도·데이터 서비스 (Map & Data Services)

앱의 지도 표시, 경로 검색, 표고(고도) 조회, 거리뷰 등은 아래 서비스를 이용합니다. 각 서비스의 이용 조건·저작권·고지 사항을 준수합니다.

| 서비스 | 용도 | 라이선스·이용 조건 |
|--------|------|---------------------|
| **OpenStreetMap (OSM)** | 지도 타일·지리 데이터 | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). ODbL 등 OSM 정책 적용. |
| **Nominatim** | 주소·장소 검색(지오코딩) | OSM 데이터 기반. [Nominatim 사용 정책](https://operations.osmfoundation.org/policies/nominatim/) 참고. |
| **OSRM** (Open Source Routing Machine) | 자동차/자전거/도보 경로 계산 | OSM 데이터 기반. 해당 배포·서비스의 이용 약관 적용. |
| **Open-Elevation** | 경로 상 고도(표고) 데이터 | 해당 API 제공자의 이용 조건·고지 사항 따름. |
| **Google Maps / Street View** | 지도 표시·거리뷰 이미지 (사용 시) | © Google. [Google Maps Platform 이용약관](https://cloud.google.com/maps-platform/terms)·[Google 개인정보처리방침](https://policies.google.com/privacy) 적용. 지도에 표시된 고지 외 본 문서에서도 언급합니다. |

- 지도·경로·표고 데이터의 **정확성·가용성**은 각 제공처에 있으며, 앱 운영자는 보장하지 않습니다.
- 상세한 라이선스 문구와 최신 정책은 각 서비스의 공식 사이트에서 확인하시기 바랍니다.

---

## 3. 사용 중인 오픈소스 소프트웨어 (패키지)

### 3.1 실행/런타임 의존성 (dependencies)

| 패키지명 | 설명 | 라이선스 |
|---------|------|----------|
| react | 사용자 인터페이스 라이브러리 | MIT |
| react-dom | React용 DOM 렌더러 | MIT |
| lucide-react | 아이콘 컴포넌트 라이브러리 | ISC |
| recharts | 차트 및 데이터 시각화 라이브러리 | MIT |

### 3.2 개발 의존성 (devDependencies)

| 패키지명 | 설명 | 라이선스 |
|---------|------|----------|
| typescript | TypeScript 언어 및 컴파일러 | Apache-2.0 |
| vite | 프론트엔드 빌드 도구 | MIT |
| @vitejs/plugin-react | Vite용 React 플러그인 | MIT |
| react (타입), react-dom (타입) | React 타입 정의 | MIT (해당 타입 패키지 정책 따름) |
| @types/node | Node.js 타입 정의 | MIT |
| tailwindcss | 유틸리티 기반 CSS 프레임워크 | MIT |
| postcss | CSS 변환 도구 | MIT |
| autoprefixer | CSS 벤더 접두사 자동 추가 | MIT |

---

## 4. 주요 라이선스 요약

- **MIT**  
  사용·복제·수정·배포·상업적 이용이 자유롭고, 라이선스 문구와 저작권 표시를 유지하면 됩니다. 대부분의 React 생태계 패키지가 이 라이선스를 사용합니다.

- **Apache-2.0**  
  사용·복제·수정·배포·특허 사용 허여가 가능합니다. 변경 시 변경 사항을 명시하고, Apache-2.0 라이선스 문구와 고지 사항을 포함해야 합니다. TypeScript 등이 이 라이선스를 사용합니다.

- **ISC**  
  MIT와 유사하게 매우 관대한 조건이며, 저작권 표시와 라이선스 문구 유지가 요구됩니다. lucide-react 등이 이 라이선스를 사용합니다.

---

## 5. 고지 및 준수 사항

- 본 앱은 위 오픈소스 라이선스 조건을 준수합니다.
- 각 라이선스에서 요구하는 저작권 표시 및 라이선스 문구는 해당 패키지의 배포물 또는 소스에 포함된 내용을 따릅니다.
- 정확한 라이선스 전문과 최신 정보는 각 패키지의 공식 저장소(GitHub 등) 또는 [npm](https://www.npmjs.com) 패키지 페이지에서 확인하시기 바랍니다.

---

## 6. 문의

오픈소스 라이선스 관련 문의는 **LiveOnSoft** 또는 앱 내 안내된 채널을 통해 연락해 주시기 바랍니다.
