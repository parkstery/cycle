# Elevation → Open-Elevation 전환 실행 방안

**목표:** Google Elevation API 대신 Open-Elevation(오픈소스) 사용으로 비용 제거  
**결론:** **가능하다.** 호출처가 1곳이며, 경로 좌표를 샘플링해 POST 한 번으로 고도 배열을 받아 기존 형태로 맞추면 된다.

---

## 1. 현재 Google Elevation 사용처 (1곳)

| 위치 | 용도 | 입력 | 출력 |
|------|------|------|------|
| `App.tsx` 1185, 1332행 | 경로 확정 후 고도 조회 | `path`(LatLng[]), `samples: 100` | `elevationRes.results` → `ElevationPoint[]` |

- **입력:** `path` = Directions/OSRM으로 얻은 경로(또는 densify 전 경로) 배열, **samples: 100**으로 경로를 따라 100개 지점 샘플.
- **출력:** `elevationRes.results` — 각 항목은 `{ location: LatLng, elevation: number }` (및 `resolution`).  
  이후 사용처:
  - 고도 프로필·경사도 기반 생리 시간 계산 (`points[i].location`, `points[i].elevation`)
  - `setRoute(..., elevation: elevationRes.results)` → `route.elevation`
  - 시뮬레이션/코칭에서 `route.elevation` 슬라이스 사용

즉, **Google을 쓰지 않고** “경로 + 샘플 수”만으로 **동일한 형태의 `ElevationPoint[]`**를 만들면 된다.

---

## 2. Open-Elevation API 요약

- **엔드포인트:** `POST https://api.open-elevation.com/api/v1/lookup`
- **요청 body:**
  ```json
  { "locations": [ {"latitude": 37.5, "longitude": 127.0}, ... ] }
  ```
- **응답:**
  ```json
  { "results": [ {"latitude": 37.5, "longitude": 127.0, "elevation": 42}, ... ] }
  ```
- **제한:**  
  - 공개 서비스: 약 **1,000 요청/월** (문서·이슈 기준).  
  - POST는 GET과 달리 바이트 제한이 널널함. 한 요청에 **수십~100개** 좌표는 무리 없이 사용 가능.

동일 경로 재계산 시 중복 호출을 줄이려면 **경로 기반 캐시**(해시 키 + 메모리 Map)를 두는 것을 권장.

---

## 3. 설계 요약

1. **경로 샘플링**  
   `path`가 100개를 넘으면, 경로를 따라 **100개 지점**을 균등하게 샘플링한다.  
   - 예: 인덱스 `i`에 대해 `path[Math.floor((i / (samples - 1)) * (path.length - 1))]` (끝 포함).  
   - `path.length <= 100`이면 그대로 사용하거나, 부족분은 끝점으로 채우기.

2. **Open-Elevation 호출**  
   - 샘플된 좌표만 추출: `{ latitude: lat(), longitude: lng() }` (Google LatLng면 `.lat()` / `.lng()` 호출).  
   - `POST /api/v1/lookup`에 `locations` 배열 전송.  
   - 응답 `results`를 그대로 순서대로 사용.

3. **기존 형식으로 매핑**  
   앱이 기대하는 형태는 `ElevationPoint`: `{ elevation: number, location: LatLng, resolution?: number }`.  
   Open-Elevation는 `location`을 주지 않으므로, **응답의 latitude/longitude로 `google.maps.LatLng`를 생성**해 넣는다.  
   - `elevation` ← `result.elevation`  
   - `location` ← `new google.maps.LatLng(result.latitude, result.longitude)`  
   - `resolution` ← 0 또는 생략

4. **호출 위치**  
   - `calculateRoute` 내부에서, `path` 확정 직후·`if (path.length > 0)` 블록 안에서  
   - 기존: `const elevationRes = await es.getElevationAlongPath({ path, samples: 100 });`  
   - 변경: `const elevationRes = await openElevation.getElevationAlongPath(path, 100);`  
   - 반환 타입을 `{ results: ElevationPoint[] }`로 맞추면 `elevationRes.results` 사용처는 수정 불필요.

5. **에러·폴백**  
   - Open-Elevation 실패(네트워크/5xx) 시:  
     - **옵션 A:** 기존처럼 `google.maps.ElevationService().getElevationAlongPath` 호출(폴백).  
     - **옵션 B:** 사용자에게 “고도 정보를 불러올 수 없습니다” 등 메시지 후, 고도 0 또는 이전 경로 유지.  
   - 초기에는 **옵션 A**로 안정성 확보 후, 정책상 Google 제거 시 옵션 B로 전환 가능.

6. **캐시(선택)**  
   - `path`를 문자열화(예: 좌표 소수점 5자리)해 해시 또는 키로 두고, 동일 경로 재요청 시 메모리에서 `ElevationPoint[]` 반환.  
   - 월 1,000 요청 제한을 고려할 때 유리.

---

## 4. 구체적 구현 단계

### 4.1 서비스 모듈 추가: `services/openElevation.ts`

- **역할**
  - `path`(LatLng 배열)와 `samples`(숫자)를 받아, 경로를 따라 `samples`개 좌표를 샘플링.
  - 해당 좌표로 Open-Elevation `POST /lookup` 호출.
  - 응답을 **앱이 쓰는 형태**로 변환해 반환.

- **함수 시그니처(제안)**  
  - `getElevationAlongPath(path: { lat(): number; lng() }[], samples: number): Promise<{ results: Array<{ location: any; elevation: number; resolution?: number }> }>`  
  - `path`는 Google LatLng와 호환되는 객체(`.lat()`, `.lng()` 존재)로 가정.  
  - 반환 `results[].location`은 **호출부에서** `google.maps.LatLng`로 채우는 방식도 가능(서비스는 `lat/lng`만 반환하고, App에서 `new google.maps.LatLng(lat, lng)` 적용).

- **서비스가 반환하는 형태(간단안)**  
  - `Promise<{ results: Array<{ latitude: number; longitude: number; elevation: number }> }>`  
  - App.tsx에서 `elevationRes.results.map(r => ({ elevation: r.elevation, location: new google.maps.LatLng(r.latitude, r.longitude), resolution: 0 }))` 로 한 번 감싼 뒤  
  - `elevationRes = { results: mapped }` 로 두면, 기존 `elevationRes.results` 사용처는 그대로 둘 수 있음.

- **경로 샘플링(의사코드)**  
  - `samples = 100`, `path.length = N`  
  - `N <= 1`: 해당 1점을 100번 반복해 100개 요청(또는 1개만 요청 후 100개로 복제).  
  - `N > 1`:  
    - `for (i = 0; i < samples; i++)`  
    - `idx = (i / (samples - 1)) * (N - 1)` → `idx = Math.min(Math.floor(idx), N - 1)`  
    - `locations[i] = { latitude: path[idx].lat(), longitude: path[idx].lng() }`

- **캐시**  
  - 키: `path`를 직렬화한 문자열(예: `path.map(p => p.lat().toFixed(5)+','+p.lng().toFixed(5)).join('|')`).  
  - 값: `{ results: ... }`  
  - 동일 키면 API 호출 생략.

- **에러**  
  - `fetch` 실패 또는 `!res.ok` 시 예외 throw → 호출부에서 catch 후 Google 폴백 또는 메시지 처리.

### 4.2 App.tsx 수정

- **삭제/유지**
  - `const es = new google.maps.ElevationService();`  
    → Open-Elevation만 쓸 경우 삭제, 폴백 유지 시 그대로 둠.

- **호출 변경**
  - 기존:  
    `const elevationRes = await es.getElevationAlongPath({ path, samples: 100 });`
  - 변경:  
    - `const openElevRes = await openElevation.getElevationAlongPath(path, 100);`  
    - `elevationRes = { results: openElevRes.results.map(r => ({ elevation: r.elevation, location: new google.maps.LatLng(r.latitude, r.longitude), resolution: 0 })) };`  
  - 또는 서비스에서 이미 `location`을 채우지 않는다면, 서비스 반환을 `{ results: Array<{ latitude, longitude, elevation }> }`로 하고 위 map을 App에서 한 번만 수행.

- **폴백(옵션)**  
  - `openElevation.getElevationAlongPath`를 try 안에서 호출하고, catch 시 `elevationRes = await es.getElevationAlongPath({ path, samples: 100 });` 실행.

### 4.3 타입

- `types.ts`의 `ElevationPoint`는 그대로 둬도 됨: `elevation`, `location`, `resolution`(선택).  
- 서비스가 반환하는 건 “위도/경도/고도”만 있고, `location`은 App에서 `google.maps.LatLng`로 채우면 됨.

### 4.4 기타

- **라이선스·표기:** Open-Elevation/데이터 소스 정책에 따라 앱 정보 또는 푸터에 attribution 추가 검토.
- **한도:** 1,000 요청/월이면 “경로 계산 1회 = 1 요청” 기준으로 월 1,000회 경로 계산까지 가능. 캐시로 동일 경로 재계산 시 0 추가 요청.

---

## 5. 테스트 체크리스트

- [ ] 경로 계산(Google Directions 성공) 후 고도 프로필이 Open-Elevation 결과로 표시되는가?
- [ ] 경로 계산(OSRM 폴백) 후에도 고도 프로필이 정상인가?
- [ ] 시뮬레이션·코칭에서 `route.elevation` 사용 시 끊김/에러가 없는가?
- [ ] Open-Elevation 5xx/네트워크 오류 시 폴백(Google) 또는 에러 메시지가 동작하는가?
- [ ] 동일 경로로 재계산 시 캐시로 인해 Open-Elevation 재호출이 없는가?(캐시 구현 시)

---

## 6. 예상 공수

| 단계 | 예상 시간 |
|------|-----------|
| `openElevation.ts` 구현(샘플링, POST, 캐시, 에러) | 1.5~2시간 |
| App.tsx 연동 및 결과 매핑(ElevationPoint 형태) | 0.5시간 |
| 폴백 정책 적용 및 테스트 | 0.5~1시간 |
| **합계** | **약 0.5일** |

---

**정리:** Google Elevation을 쓰지 않고 Open-Elevation만으로도 동일 기능을 구현할 수 있으며, 경로 샘플링 + POST 한 번 + 결과를 기존 `ElevationPoint[]` 형태로 맞추는 방식으로 구체적 구현이 가능하다.
