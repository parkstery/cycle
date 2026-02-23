# Geocoder → Nominatim 전환 실행 방안

**대상:** 시니어 개발자  
**목표:** Google Geocoder 호출을 Nominatim(OSM)으로 대체하여 비용 절감  
**결론:** **가능하다.** 호출처가 2곳으로 한정되어 있고, API 형태가 단순해 1~2일 내 적용 가능한 수준이다.

---

## 1. 현재 Geocoder 사용처 (2곳)

| # | 용도 | 위치 | 입력 | 출력 | 비고 |
|---|------|------|------|------|------|
| 1 | **역지오코딩** (좌표 → 주소) | `App.tsx` 692행 | 지도 클릭 `e.latLng` | `results[0].formatted_address` → 클릭 위치 팝업의 이름/주소 | placeId 없을 때만 |
| 2 | **정지오코딩** (주소 → 좌표) | `App.tsx` 1262~1275 `getCoord()` | 출발/도착 주소 문자열 | `results[0].geometry.location` (LatLng) | OSRM 폴백 시에만 사용 |

두 경우 모두 **요청 빈도가 낮음** (클릭 1회당 1회, OSRM 시 최대 2회) → Nominatim 1 req/s 제한에 잘 맞음.

---

## 2. Nominatim API 요약

- **역지오코딩:**  
  `GET https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json`  
  응답: `{ display_name, lat, lon, ... }` → `display_name`을 Google의 `formatted_address` 대신 사용.

- **정지오코딩:**  
  `GET https://nominatim.openstreetmap.org/search?q={encodeURIComponent(address)}&format=json`  
  응답: 배열 `[{ lat, lon, display_name }, ...]` → 첫 항목의 `lat`, `lon`으로 `LatLng` 생성.

- **사용 정책 (준수 필수):**
  - **1 request per second** (공개 서버 기준).
  - **User-Agent** 필수: 앱 이름·식별 정보 포함 (대량 요청 시 이메일 권장).
  - 결과 **캐싱** 권장 (동일 좌표/주소 재요청 감소).

---

## 3. 설계 원칙

1. **추상화 레이어**  
   `services/nominatim.ts`(또는 `geocodeService.ts`)에서 Nominatim 호출만 담당.  
   반환 형태를 **기존 Google 응답과 호환**되게 맞춰서 `App.tsx` 변경을 최소화.

2. **쓰로틀**  
   연속 요청 시 1초에 1회 이하로 제한 (마지막 요청 시각 저장 후 `setTimeout` 또는 `Promise`로 지연).

3. **선택: Google 폴백**  
   Nominatim 실패(네트워크/404/503) 시 기존 `geocoder.current.geocode()` 호출로 폴백하면 가용성 유지.  
   전면 전환 시에는 폴백 제거.

4. **User-Agent**  
   `fetch` 옵션에  
   `headers: { 'User-Agent': 'FitnessProCycleSimulator/1.0 (https://github.com/your-org/cycle)' }`  
   형태로 설정 (실서비스 시 연락처/URL로 교체).

---

## 4. 구체적 실행 단계

### 4.1 서비스 모듈 추가 (`services/nominatim.ts`)

- **역지오코딩**  
  `reverse(lat: number, lon: number): Promise<{ formatted_address: string }>`  
  - Nominatim `/reverse` 호출.  
  - 응답 `display_name` → `formatted_address`로 매핑해 반환.  
  - 실패 시 에러 throw (또는 null 반환 후 호출부에서 폴백).

- **정지오코딩**  
  `search(address: string): Promise<{ lat: number; lng: number }>`  
  - Nominatim `/search?q=...` 호출.  
  - 첫 결과의 `lat`, `lon` → `{ lat, lng }` 반환 (Google `geometry.location` 대체용).

- **쓰로틀**  
  - 모듈 내 `lastRequestTime` + `MIN_INTERVAL_MS = 1100` 으로, 다음 요청 전에 `delay(ms)` 적용.

- **캐시 (선택)**  
  - `reverse`: 키 `lat,lon` (소수점 4자리 등으로 반올림).  
  - `search`: 키 `address` (trim, 소문자 등 정규화).  
  - 메모리 `Map`으로 저장, 동일 키면 API 호출 생략.

- **User-Agent**  
  - 모든 `fetch`에 동일 User-Agent 헤더 설정.

(아래 **부록 A**에 `nominatim.ts` 초안 코드 제시.)

### 4.2 App.tsx 수정 1 — 지도 클릭 (역지오코딩)

- **위치:** `googleMap.current.addListener("click", ...)` 내부, `else` 블록 (placeId 없을 때, 현재 692~705행).
- **변경:**  
  - `geocoder.current.geocode({ location: e.latLng }, ...)` 대신  
  - `nominatim.reverse(e.latLng.lat(), e.latLng.lng())` 호출 (async).  
  - 성공 시 `setClickedLocation({ lat, lng, name: res.formatted_address, address: res.formatted_address, ... })`  
  - 실패 시: (선택 A) Google 폴백 호출 유지 / (선택 B) "주소를 찾을 수 없습니다" 등 고정 문구로 설정.

### 4.3 App.tsx 수정 2 — OSRM 폴백용 getCoord (정지오코딩)

- **위치:** `getCoord(val, addr)` (1262~1275행).
- **변경:**  
  - 이미 좌표가 있으면 기존처럼 `google.maps.LatLng` 반환.  
  - 주소만 있을 때:  
    - 먼저 `nominatim.search(addr)` 호출.  
    - 성공 시 `new google.maps.LatLng(res.lat, res.lng)` 반환.  
    - 실패 시 기존처럼 `geocoder.current.geocode({ address: addr }, ...)` 폴백 (또는 전면 전환 시 reject).

### 4.4 (선택) Google Geocoder 의존 제거

- Nominatim만 사용할 경우:  
  - `geocoder` ref 및 `geocoder.current = new google.maps.Geocoder()` 초기화 제거 가능.  
  - Places/다른 Google API는 그대로 두어도 됨 (지도 클릭·OSRM용만 Geocoder 대체).

---

## 5. 리스크·주의사항

| 항목 | 대응 |
|------|------|
| Nominatim 1 req/s | 쓰로틀 + 캐시로 동일 좌표/주소 재요청 최소화. OSRM 시 출발·도착 2회 연속이면 2초 간격으로 호출하도록 처리. |
| 결과 품질 차이 | Google보다 주소 해상도·언어가 다를 수 있음. 한국 주소는 대체로 양호하나, 해외/산간은 테스트 필요. |
| 공개 서버 장애 | 폴백으로 Google 유지하거나, 에러 시 사용자에게 "주소를 가져올 수 없습니다" 안내. |
| 라이선스·표기 | OSM 데이터 사용 시 적절한 attribution(지도/UI 푸터 등) 유지. |

---

## 6. 테스트 체크리스트

- [ ] 지도 클릭(placeId 없음) → 주소가 Nominatim 결과로 표시되는가?
- [ ] 지도 클릭 후 출발/도착 설정 → 경로 계산(Google 성공) 시 동작 유지되는가?
- [ ] Google Directions 실패 → OSRM 폴백 시, 주소로 출발·도착 변환 후 경로가 나오는가?
- [ ] 1초 이내 연속 클릭/검색 시 429 또는 차단 없이 쓰로틀만 걸리는가?
- [ ] User-Agent가 요청 헤더에 포함되는가? (개발자 도구 Network 탭 확인)
- [ ] (선택) Nominatim 서버 503 등 실패 시 Google 폴백 또는 에러 메시지가 나오는가?

---

## 7. 예상 공수

| 단계 | 예상 시간 |
|------|-----------|
| nominatim.ts 서비스 구현 (쓰로틀·캐시·에러 처리) | 2~3시간 |
| App.tsx 지도 클릭 연동 | 0.5시간 |
| App.tsx getCoord 연동 + 폴백 정책 | 0.5~1시간 |
| 테스트·엣지 케이스·한국 주소 확인 | 1~2시간 |
| **합계** | **약 0.5~1일** |

---

## 부록 A. `services/nominatim.ts` 초안

아래는 바로 사용 가능한 최소 구현 예시이다. (실제 프로젝트에는 `services/nominatim.ts`로 저장 후 App.tsx에서 import하여 사용.)

```ts
// services/nominatim.ts
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'FitnessProCycleSimulator/1.0 (https://github.com/your-org/cycle)';
const MIN_INTERVAL_MS = 1100;

let lastRequestTime = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

const reverseCache = new Map<string, { formatted_address: string }>();
const searchCache = new Map<string, { lat: number; lng: number }>();

function reverseCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export async function reverse(lat: number, lon: number): Promise<{ formatted_address: string }> {
  const key = reverseCacheKey(lat, lon);
  const cached = reverseCache.get(key);
  if (cached) return cached;

  await throttle();
  const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim reverse ${res.status}`);
  const data = await res.json();
  const result = { formatted_address: data.display_name ?? `${lat}, ${lon}` };
  reverseCache.set(key, result);
  return result;
}

export async function search(address: string): Promise<{ lat: number; lng: number }> {
  const key = address.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached) return cached;

  await throttle();
  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim search ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('Nominatim no results');
  const result = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
  searchCache.set(key, result);
  return result;
}
```

- 쓰로틀·캐시·User-Agent 포함.  
- `App.tsx`에서는 `reverse` 반환값을 `formatted_address`로, `search` 반환값을 `google.maps.LatLng(lat, lng)`로만 연결하면 된다.

---

**정리:** 시니어 개발자라면 위 방안대로 서비스 모듈 추가 + 호출처 2곳 수정으로 1일 이내에 Geocoder → Nominatim 전환을 완료할 수 있다.
