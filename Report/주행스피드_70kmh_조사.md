# 주행 스피드 10~70 km/h 변경 — 70 km/h 초과 관련 코드 조사

## 조사 결과: 70 km/h 초과에서만 쓰이던 코드

### 1. Street View 파노 전환 — 80 km/h 초과 분기 (App.tsx)

| 위치 | 내용 | 역할 |
|------|------|------|
| **약 851~855행** | `speedKmH > 80` 일 때 `svDisplayIdxForPano = Math.floor(svDisplayIdx / JUMP_POINTS_20M) * JUMP_POINTS_20M` | **80 km/h 초과**일 때만 거리뷰 표시 인덱스를 20m(≈10 path points) 단위로 끊어, 같은 파노를 더 오래 보여 주어 고속에서 파노 전환이 너무 잦아지는 것(“멈춤”)을 줄이기 위한 처리. |

- **결론**: 스피드 상한을 **70 km/h**로 두면 **speedKmH > 80**은 항상 false이므로 이 분기는 **더 이상 타지 않음**.
- **조치**: 해당 분기 제거, `svDisplayIdxForPano = svDisplayIdx` 로 통일.

---

### 2. 그 외 속도 관련 로직 (70 초과 전제 아님)

| 항목 | 위치 | 설명 |
|------|------|------|
| **거리뷰 표시 속도 상한 60 km/h** | `MAX_SV_SPEED_M_PER_SEC = (60*1000)/3600` | 거리뷰 **표시**만 시뮬레이션 속도와 분리해 최대 60 km/h로 진행. 70 km/h로 주행해도 표시는 60 km/h 기준으로 진행. **10~70 범위에서도 그대로 유효.** |
| **시뮬레이션 delay** | `delay = (distMeters / speedMetersPerSec) * 1000`, `speedMetersPerSec = (speedKmH*1000)/3600` | 주행 타이머는 `speedKmH` 그대로 사용. 범위 10~70이면 70까지 반영됨. **변경 불필요.** |
| **타이머·coveredDistance** | `metersPerSecond = (speedKmH*1000)/3600` | 동일. **변경 불필요.** |
| **코칭** | `getPredictiveCoaching(..., speedKmH, ...)`, `getAdvancedCoaching(..., speedKmH, ...)` | 속도 인자만 전달. **변경 불필요.** |
| **simulation.speed: 100** | `setSimulation(..., speed: 100)` | 내부 상태용 숫자로, 실제 속도 계산은 `speedKmH` 사용. **범위 변경과 무관.** |

---

## 요약

- **70 km/h 초과를 전제로 한 코드**는 **한 곳**뿐임:  
  **Street View 표시 인덱스**에서 `speedKmH > 80` 일 때 20m 단위로 끊는 분기.
- 스피드 범위를 **10~70 km/h**로 제한하면 위 분기는 **도달 불가**이므로 제거해도 되고, 제거 시 `svDisplayIdxForPano`는 항상 `svDisplayIdx`와 같게 두면 됨.
- 나머지 속도 관련 로직(60 km/h 표시 상한, delay, 코칭 등)은 10~70 범위에서도 그대로 사용 가능.
