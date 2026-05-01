# 20260502 — Elevation(표고) 이슈 원인·해결 과정 보고서

## 1. 문서 목적

실내 사이클 앱에서 **경로 탐색 후 표고 프로필이 들어오지 않거나 평지(0m)로만 표시**되고, Android WebView 환경에서 **Open-Elevation 직접 호출이 실패**하는 문제에 대해, **원인 규명·해결에 적용한 코드·운영 조건**을 한곳에 정리한다.

본 문서는 기존 **`Report/20260426-Elevation_Profile_도로종단선형_추정과정_및_중요사항_보고서.md`** 의 **§8(평지화 이슈)** 과 연결되며, 그중 **“외부 공급자·프록시”** 축을 2026년 5월 전후 구간에서 구체화한 보강 자료로 본다.

---

## 2. 관측된 증상

| 증상 | 비고 |
|------|------|
| 웹(Vercel 등)에서는 표고 차트·코칭이 정상에 가깝게 동작 | 동일 출처 `/api/elevation` 사용 가능 |
| **Capacitor Android(WebView)** 에서 “표고 정보를 불러오지 못해 평지로 진행합니다.” 유사 안내 및 **고도 0** 처리 | OSRM 경로 자체는 성공하는 경우가 많음 |
| Chrome DevTools(Network)에서 **`api.open-elevation.com/api/v1/lookup`** 만 보이고, 응답 탭에 **“프리플라이트 요청에 사용 가능한 콘텐츠 없음”** 등 메시지 | 본문 JSON을 읽지 못함 |

---

## 3. 원인 분석

### 3.1 1차 원인: CORS(Preflight) 실패 — 직접 Open-Elevation 호출

- WebView **페이지 출처**가 예: **`https://localhost`** 인 경우, 앱 코드가 **`https://api.open-elevation.com`** 으로 `Content-Type: application/json` 인 **POST** 를내면 브라우저는 **교차 출처 CORS 규칙**을 적용한다.
- 공개 Open-Elevation 서비스는 **`localhost` 출처에 대한 안정적인 CORS 허용**을 보장하지 않으며, DevTools에서 **OPTIONS(preflight) 응답이 비어 있거나 정책 불충분**해 **POST가 실행되기 전에 차단**되는 패턴이 관측되었다.
- 따라서 **“네트워크가 완전히 끊겼다”기보다 WebView 정책상 응답을 읽을 수 없다”** 로 귀결되는 것이 타당하다. (자문단과 동일 결론)

### 3.2 2차(근본) 원인: 프록시 `/api/elevation` 가 네이티브에서 먼저 성공하지 못함

앱 표고 흐름은 대략 다음과 같다 (`services/openElevation.ts`).

1. **프록시 후보**에 대해 `POST …/api/elevation` (본 서버가 외부 OpenTopoData·Open-Elevation을 대신 호출, **CORS `*`** 로 응답 가능)
2. 프록시가 **전부 실패**하면, **Capacitor 네이티브**에서는 **외부 API 직접 `fetch`** 로 폴백
3. 직접 호출은 **§3.1** 에서 설명한 **CORS 실패**로 이어질 수 있음

네이티브에서 프록시가 먼저 실패하는 대표 이유는 다음과 같다.

| 이유 | 설명 |
|------|------|
| **`https://localhost/api/elevation` 없음** | APK 번들만으로는 Node/Vercel API 라우트가 존재하지 않음 → 404 또는 연결 실패 |
| **원격 프록시 URL이 빌드에 없음** | `VITE_ELEVATION_PROXY_ORIGIN` 미설정 시, 배포된 **`https://(배포도메인)/api/elevation`** 후보가 비어 순조로 직접 호출로 떨어질 수 있음 |

### 3.3 기존 보고서 §8과의 관계

`20260426` 보고서 **§8** 은 이미 **“평지 폴백은 외부 공급자 가용성·지연 등에 의해 설계상 발동할 수 있다”** 고 정리하였다.  
이번 이슈는 그중 **“공급자는 살아 있어도 WebView가 응답을 읽지 못하는(CORS)”** 케이스로, **§8의 평지 폴백 트리거와 증상은 같으나 기술 원인은 CORS·프록시 순서**에 무게가 있다.

### 3.4 별도 축: Open-Elevation 서비스 자체의 무응답·지연

- 동일 기간 **Open-Elevation 공개 API의 다운·지연** 이슈가 있었고, 서버 프록시(`api/elevation.js`)에서는 **OpenTopoData 우선·짧은 타임아웃** 등으로 완화하였다.  
- 이 축은 **CORS와 별개**로, 프록시가 살아 있어도 **업스트림 장애 시 502·폴백**으로 연결될 수 있다.

---

## 4. 해결 과정(적용한 조치 요약)

아래는 저장소 `dev2` 브랜치에 반영된 조치를 **시간·논리 순**으로 요약한 것이다.

### 4.1 표고 API 공급 이중화·타임아웃 (`api/elevation.js`)

- **자동 모드**: **OpenTopoData(SRTM) 우선**, Open-Elevation 후순위(공개 OE 무응답 완화).
- 각 업스트림 `fetch` 에 **Abort 기반 타임아웃** 부여.

### 4.2 네이티브 WebView CORS 회피 — 동일 출처·원격 프록시 (`services/openElevation.ts`)

- **우선 `POST` 대상**:  
  - 동일 출처: `{window.location.origin}/api/elevation`  
  - 원격: **`{VITE_ELEVATION_PROXY_ORIGIN}/api/elevation`** (예: Vercel 배포 도메인)
- **Capacitor 네이티브**에서는 **`localhost` 의 `/api/elevation` 이 사실상 존재하지 않는 경우가 많으므로**, 후보 순서를 **`원격 프록시 → 동일 출처`** 로 바꾸어, **직접 `api.open-elevation.com` 호출 전에 Vercel 프록시가 성공하도록** 하였다.
- 프록시 `fetch` 에 **클라이언트 측 상한 시간(Abort)** 을 두어 무한 대기를 방지.

### 4.3 빌드 시 원격 프록시 주입 (`.env.production`)

- 예: `VITE_ELEVATION_PROXY_ORIGIN=https://cycle-lime.vercel.app`  
- **프로덕션 `vite build`** 시 클라이언트 번들에 반영되어, 네이티브 WebView가 **배포 서버의 `/api/elevation`** 을 호출할 수 있게 한다.
- 저장소 예시는 `Report`/외부 공개 시 **실제 운영 도메인에 맞게 수정**해야 한다.

### 4.4 자문단 의견과의 정합성

| 자문 요지 | 본 프로젝트 대응 |
|-----------|------------------|
| 원인은 **CORS preflight + 직접 OE** | 동의. 직접 호출 경로는 피하는 것이 맞음. |
| **1순위: 프록시** | 동의. 원격 `/api/elevation` 우선·환경변수로 “프록시 살리기”. |
| **2순위: Capacitor HTTP** | **미도입**. 프록시로 해결되는 한 불필요; 향후 오프라인·특수 환경에서 검토 가능. |

---

## 5. 검증 방법(권장)

1. **Android + USB 디버깅**, Chrome `chrome://inspect` → WebView → **Network**.
2. 경로 계산 후 **`(배포도메인)/api/elevation`** **POST** 가 **200** 인지 확인.
3. 응답 헤더 **`X-Elevation-Provider`**: `opentopodata` 또는 `open-elevation`.
4. **`api.open-elevation.com` 직접 POST** 가 **나오지 않거나**, 나와도 **프록시 성공 이후의 보조 호출이 아닌지** 확인.

---

## 6. 잔여 리스크·운영 메모

| 항목 | 내용 |
|------|------|
| **배포 URL 변경** | `VITE_ELEVATION_PROXY_ORIGIN` 재설정 후 **반드시 재빌드·재배포**. |
| **Vercel 함수 한도** | 표고 샘플 수·호출 빈도에 따른 **콜드 스타트·타임아웃** 은 별도 모니터링 대상. |
| **DEM vs 도로면** | `20260426` 보고서 본편(교량·`roadElevation`)과 혼동하지 말 것 — 본 문서는 **“숫자가 아예 안 들어오는” 공급·CORS 층** 이다. |

---

## 7. 관련 소스·설정 파일

| 경로 | 역할 |
|------|------|
| `services/openElevation.ts` | 프록시 후보 순서, `fetch`, 네이티브 직접 호출 폴백 |
| `api/elevation.js` | Vercel/Vite 서버에서 외부 표고 API 프록시·이중화 |
| `App.tsx` | 표고 실패 시 평지 폴백·토스트 |
| `.env.production` / `.env.example` | `VITE_ELEVATION_PROXY_ORIGIN` |
| `Report/20260426-Elevation_Profile_도로종단선형_추정과정_및_중요사항_보고서.md` | 도로 종단 유사화·§8 평지 이슈 맥락 |

---

**작성 기준:** 저장소 `dev2` 기준 변경 이력 및 대화 중 합의 내용 정리  
**문서 ID:** `20260502-Elevation_CORS_프록시_원인_및_해결_보고서`
