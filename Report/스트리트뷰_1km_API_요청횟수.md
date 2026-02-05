# 1km 구간 스트리트뷰 프리페치 시 API 요청 횟수

## 사용 API 명칭

**Google Maps JavaScript API — Street View Service — `getPanorama`**

- 코드: `google.maps.StreetViewService` 인스턴스의 **`getPanorama(request, callback)`** 메서드
- 역할: 특정 위치(latLng)와 반경(radius) 안에서 파노라마 **메타데이터**(pano ID, location, 등)를 조회. 이미지 타일을 반환하는 Street View Static API와는 별개.
- 한 번의 `getPanorama` 호출 = **1회의 API 요청**으로 간주 (실제 네트워크 요청 1회).

---

## 1km 구간에서의 샘플 수

현재 로직:

- `intervalM = 7`
- 구간: `fromDistanceM = 0` ~ `maxDistanceM = 1000`
- 샘플 거리: `d = 0, 7, 14, 21, …, 994` (d ≤ 1000)

개수:

- `d`의 개수 = `floor(1000 / 7) + 1 = 142 + 1 = **143개**` 샘플 지점

즉, **1km 구간에 대해 143번의 “샘플 처리”**가 이루어지고, 각 샘플 처리에서 **1~8회**의 `getPanorama` 요청이 발생할 수 있음.

---

## 샘플 1개당 요청 횟수 (호출 구조)

한 샘플 지점에서의 흐름:

1. **findStreetViewInDirection(pathPoint, pathNext, radius)**  
   내부에서 **getPanoramaWithFallback(service, { location, radius })** 1회 호출  
   - **getPanoramaWithFallback** 동작:
     - 먼저 `service.getPanorama(..., source: GOOGLE)` → **1회**
     - status !== 'OK' 또는 pano 없으면 `service.getPanorama(..., source: DEFAULT)` → **1회 추가**  
   - 따라서 getPanoramaWithFallback 1회당: **1~2회** 요청

2. 반경 30m으로 1번 호출 → 성공 시 **1~2회**에서 끝  
3. 실패 시 반경 20m으로 한 번 더 → **1~2회** 추가  
4. 또 실패 시 반경 15m으로 한 번 더 → **1~2회** 추가  
5. 여전히 실패 시 **findStreetView(pathPoint, 50)** → getPanoramaWithFallback 1회 → **1~2회** 추가  

정리하면, **샘플 1개당**:

- **최소**: 1회 (첫 getPanorama, GOOGLE, 성공 + 방향 조건 만족)
- **최대**: (1~2) + (1~2) + (1~2) + (1~2) = **4~8회**  
  (실제 최악은 GOOGLE 실패 후 DEFAULT 성공이 반복되는 경우이므로 **2×4 = 8회**)

---

## 1km 구간 총 요청 횟수

| 상황 | 샘플당 요청 | 샘플 수 | 총 요청 횟수 |
|------|-------------|---------|----------------|
| **최선** (모든 샘플에서 첫 GOOGLE 1회 성공) | 1회 | 143 | **143회** |
| **일반적** (대부분 1회, 일부 2회) | 1~2회 | 143 | **약 143~286회** |
| **최악** (모든 샘플에서 3반경+폴백, 매번 GOOGLE 실패 후 DEFAULT 성공) | 8회 | 143 | **1,144회** |

요약:

- **최소: 143회**
- **실제로는 대부분 143~300회 근처** (구간에 파노라마가 잘 있으면 1~2회/샘플)
- **이론적 최대: 1,144회**

---

## 참고: 200m 구간(현재 초기 로드)일 때

- 샘플 수: `floor(200/7) + 1 = 29개`
- 최소 29회, 최대 29×8 = **232회**

길이에 비례해 위와 같은 방식으로 증가함.
