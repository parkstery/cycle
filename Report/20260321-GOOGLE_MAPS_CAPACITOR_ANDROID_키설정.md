# Capacitor Android에서 Google Maps “This page didn’t load Google Maps correctly” 대응

앱이 **스플래시는 지나가고** 지도 영역에 Google의 회색 오류 박스가 뜨는 경우, 번들에 키가 들어간 뒤에도 **Google Cloud 쪽에서 요청을 막는 단계**입니다.

## 1. 앱 출처(Capacitor)

- Android WebView에서 로드되는 페이지 출처는 보통 **`https://localhost`** (또는 유사)입니다.
- Vercel 배포용으로만 **HTTP 리퍼러**를 허용해 두었다면, **앱에서는 리퍼러가 일치하지 않아** 지도가 거부됩니다.

## 2. API 키 제한 (가장 흔한 원인)

Google Cloud Console → **API 및 서비스** → **사용자 인증 정보** → 해당 API 키:

1. **애플리케이션 제한사항**
   - **웹사이트**를 쓰는 경우, **HTTP 리퍼러**에 다음을 추가하는 것을 권장합니다.
     - `https://localhost/*`
     - (필요 시) `http://localhost/*`
   - 또는 **개발 중에만** 잠시 **없음**으로 두어 동작 확인 후, 다시 제한을 걸 수 있습니다.

2. **API 제한**
   - 최소한 다음이 **허용 목록**에 있어야 합니다.
     - **Maps JavaScript API**
     - **Street View Static API** / Street View 관련 사용 시 문서에 따라 추가

3. **결제**
   - 프로젝트에 **결제 계정**이 연결되어 있어야 합니다.

## 3. 웹(Vercel)과 앱을 같은 키로 쓸 때

- 한 키에 **리퍼러**로 `https://your-app.vercel.app/*` 와 `https://localhost/*` 를 **함께** 넣는 방식이 일반적입니다.
- 보안을 강화하려면 **웹용 키**와 **Capacitor/Android(WebView)용 키**를 분리하는 것도 방법입니다.

## 4. 코드에서 확인

- `App.tsx`에 `gm_authFailure` 로그가 찍히면, 위 Console 설정을 우선 점검하면 됩니다.

## 5. 빌드 순서 (키를 .env.local에 넣은 뒤)

1. `npm run build`
2. `npx cap sync android`
3. Android Studio에서 재설치 후 실행
