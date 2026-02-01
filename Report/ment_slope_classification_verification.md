# 멘트 경사도 분류 검증 보고서

**검증일:** 2025-01-31  
**대상:** 저항(Res) 설정 멘트 및 자세·멘탈 관련 코칭 멘트의 경사도별 적합성

---

## 1. 저항(Res) 설정 멘트 — 경사→저항 매핑

### 1.1 기준 (사용자 제공)

| 경사 조건 | Res | 설명 |
|-----------|-----|------|
| slope ≥ 10% | 8 | Extreme Uphill (MAX LOAD) |
| 7% ≤ slope < 10% | 7 | Steep Uphill |
| 5% ≤ slope < 7% | 6 | Moderate Uphill |
| 3% ≤ slope < 5% | 5 | Uphill Start |
| 1% ≤ slope < 3% | 4 | False Flat |
| -1% ≤ slope < 1% | 3 | Flat, Cruising |
| -3% ≤ slope < -1% | 2 | Slight Downhill |
| slope < -3% | 1 | Steep Downhill (MIN LOAD) |

### 1.2 코드 검증 (services/aiCoach.ts)

```ts
if (slope >= 10) targetRes = 8;
else if (slope >= 7) targetRes = 7;
else if (slope >= 5) targetRes = 6;
else if (slope >= 3) targetRes = 5;
else if (slope >= 1) targetRes = 4;
else if (slope >= -1) targetRes = 3;
else if (slope >= -3) targetRes = 2;
else targetRes = 1;
```

| 기준 조건 | 코드 조건 | Res | 일치 |
|-----------|-----------|-----|------|
| slope ≥ 10% | slope >= 10 | 8 | ✅ |
| 7% ≤ slope < 10% | slope >= 7 && slope < 10 | 7 | ✅ |
| 5% ≤ slope < 7% | slope >= 5 && slope < 7 | 6 | ✅ |
| 3% ≤ slope < 5% | slope >= 3 && slope < 5 | 5 | ✅ |
| 1% ≤ slope < 3% | slope >= 1 && slope < 3 | 4 | ✅ |
| -1% ≤ slope < 1% | slope >= -1 && slope < 1 | 3 | ✅ |
| -3% ≤ slope < -1% | slope >= -3 && slope < -1 | 2 | ✅ |
| slope < -3% | slope < -3 | 1 | ✅ |

**결론:** 저항 설정 멘트(res_1~res_8)의 경사→Res 매핑은 기준표와 **완전 일치**함.

---

## 2. 코칭 멘트(tip_0~tip_31) — 경사별 분류 및 적합성

### 2.1 분류 구조 (phraseManifest.ts)

- **경사도 8단계 × 멘트 4개 = 32개** (tip_0~tip_31).
- **순서:** 고경사(Res 8) → 저경사(Res 1).  
  - tip_0~3 → Res 8, tip_4~7 → Res 7, … tip_28~31 → Res 1.
- **TIP_TO_RESISTANCE_BAND:** tip 인덱스 i → 저항 밴드 1~8 (위와 동일).
- **getTipIndicesByResistance(targetRes):** 해당 Res에 대응하는 tip 인덱스 4개만 반환 → **경사에 맞는 멘트만 후보**로 사용됨.

### 2.2 구간별 멘트 내용 및 자세·멘탈 적합성

각 구간별로 4개 멘트를 **자세 / 멘탈 / 기술(호흡·리듬 등)** 로 구분하고, 해당 경사에 적합한지 검증함.

| Res | 경사 구간 | tip 인덱스 | 멘트 | 유형 | 경사 적합성 |
|-----|-----------|------------|------|------|-------------|
| **8** | slope ≥ 10% (Extreme Uphill) | 0~3 | Stay tall. Let the hill come. | 자세+멘탈 | ✅ 극한 오르막에 맞는 자세·심리 |
| | | | Core tight. Stop bouncing. | 자세 | ✅ 상체 고정, 탄력 제어 |
| | | | Stand and drive. Push through. | 자세+행동 | ✅ 서서 밀어내기 |
| | | | Max effort. Hold the line. | 멘탈 | ✅ 최대 부하 구간 심리 |
| **7** | 7% ≤ slope < 10% (Steep Uphill) | 4~7 | Hips stable. Let legs work. | 자세 | ✅ 힙 고정, 다리만 사용 |
| | | | Deep breath. Long exhale. | 기술(호흡) | ✅ 가파른 오르막 호흡 |
| | | | Even pressure through the stroke. | 기술 | ✅ 페달 압력 균일 |
| | | | Calm mind. Strong legs. | 멘탈 | ✅ 가파른 구간 심리·자신감 |
| **6** | 5% ≤ slope < 7% (Moderate Uphill) | 8~11 | Breathe low. Stay calm. | 기술+멘탈 | ✅ 오르막 호흡·침착 |
| | | | Control breath before speed. | 기술 | ✅ 호흡 우선 |
| | | | Steady lungs, steady legs. | 기술 | ✅ 리듬 유지 |
| | | | Save watts. Ride efficient. | 멘탈+전략 | ✅ 중경사 효율 |
| **5** | 3% ≤ slope < 5% (Uphill Start) | 12~15 | Relax your grip. No white knuckles. | 자세 | ✅ 오르막 시작 그립 완화 |
| | | | Ease power. Find rhythm. | 기술 | ✅ 리듬 찾기 |
| | | | Settle in. This section lasts. | 멘탈 | ✅ 구간 인지·적응 |
| | | | No rush. Ride smart. | 멘탈 | ✅ 페이싱 |
| **4** | 1% ≤ slope < 3% (False Flat) | 16~19 | Elbows soft. Upper body quiet. | 자세 | ✅ 평지에 가까운 상체 이완 |
| | | | Smooth circles, not stomps. | 기술 | ✅ 페달링 품질 |
| | | | Light feet. Faster spin. | 기술 | ✅ 케이던스 |
| | | | Hold cadence. Ignore speed. | 기술+멘탈 | ✅ 리듬 유지 |
| **3** | -1% ≤ slope < 1% (Flat, Cruising) | 20~23 | Eyes up. Line stays clean. | 자세+시선 | ✅ 평지 시선·자세 |
| | | | Float the pedals here. | 기술 | ✅ 크루징 감각 |
| | | | Let rhythm carry you. | 멘탈+기술 | ✅ 리듬에 맡기기 |
| | | | Steady pace. Stay smooth. | 멘탈 | ✅ 안정 페이스 |
| **2** | -3% ≤ slope < -1% (Slight Downhill) | 24~27 | Recover here. Spin light. | 멘탈+기술 | ✅ 약한 내리막 회복 |
| | | | Ease off. Breathe. | 기술+호흡 | ✅ 부하 감소·호흡 |
| | | | Legs rest. Stay loose. | 자세+멘탈 | ✅ 다리 이완 |
| | | | Let gravity help. | 멘탈 | ✅ 중력 활용 인지 |
| **1** | slope < -3% (Steep Downhill) | 28~31 | Let gravity work for you. | 멘탈 | ✅ 급내리막 심리 |
| | | | Focus now. Free speed ahead. | 멘탈 | ✅ 집중·속도 수용 |
| | | | Tuck and coast. | 자세+행동 | ✅ 에어로·코스팅 |
| | | | Easy spin. Enjoy. | 기술+멘탈 | ✅ 최소 부하·여유 |

---

## 3. 종합 검증 결과

### 3.1 저항(Res) 설정 멘트

- **경사 → Res 매핑:** aiCoach.ts 로직이 제공하신 표(8단계)와 **완전 일치**.
- **재생:** res_1~res_8 은 경사에 따라 결정된 `targetRes`로만 사용되므로, **경사에 따른 저항 멘트가 정해져 있는 구조**와 일치함.

### 3.2 자세·멘탈 관련 코칭 멘트(tip_0~tip_31)

- **분류 체계:**  
  - 8단계 경사(Res 8→1)와 1:1 대응하는 **tip 밴드**가 있으며,  
  - 각 밴드당 **4개 멘트**가 자세 / 멘탈 / 기술(호흡·리듬·페달링)로 잘 섞여 있음.
- **경사 적합성:**  
  - **Res 8(극한 오르막):** 자세(Stay tall, Core tight, Stand and drive), 멘탈(Max effort, Hold the line) → 극한 구간에 적합.  
  - **Res 7~5(오르막):** 호흡·리듬·그립·페이싱·효율 멘트 → 오르막 구간에 적합.  
  - **Res 4~3(평지·가짜 평지):** 상체 이완, 케이던스, 시선, 리듬·페이스 → 평지·크루징에 적합.  
  - **Res 2~1(내리막):** 회복, 이완, 중력 활용, Tuck, Enjoy → 내리막·회복에 적합.
- **선택 로직:**  
  - aiCoach에서 `getTipIndicesByResistance(targetRes)`로 **해당 경사(Res)에 대응하는 4개 tip만** 후보로 두고 랜덤 선택하므로, **자세·멘탈 멘트도 경사에 맞는 밴드 안에서만** 나옴.

### 3.3 결론

- **저항 설정 멘트:** 경사→Res 기준표와 코드가 일치하며, 경사에 따른 저항 멘트가 정해져 있음.  
- **자세·멘탈 관련 멘트:** 경사도 8단계(Res 8~1)에 맞춰 tip_0~tip_31이 분류되어 있고, 각 구간별로 자세·멘탈·기술 멘트가 해당 경사에 적합하게 배치되어 있음.  
- **추가 수정 불필요:** 현재 구조만으로도 “경사에 따른 저항 멘트”와 “경사에 적합한 자세·멘탈 멘트”가 일관되게 분류·사용되고 있음.
