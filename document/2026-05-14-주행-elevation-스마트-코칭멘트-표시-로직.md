# 주행 중 elevation 기반 스마트 코칭 멘트 표시 로직 보고서

**작성일:** 2026-05-14  
**범위:** 경로 고도(`route.elevation`)로 저항 밴드(R1~R8)와 코칭 문구를 결정하고, 주행 중 화면 상단에 멘트를 표시하며 TTS로 읽어 주는 흐름 전반  
**핵심 파일:** `App.tsx`, `services/aiCoach.ts`, `services/roadElevation.ts`(`estimateRoadSlope`), `services/phraseManifest.ts`, `types.ts`

---

## 1. 한 줄 요약

코칭 멘트는 **외부 LLM 없이** `ElevationPoint[]` 슬라이스로 **도로 종단선형에 가깝게 보정한 경사도(%)**를 추정한 뒤, 그 값으로 **저항 밴드 1~8**을 정하고, 밴드별로 미리 정의된 **32개 영문 팁** 중 하나를라 `팁문구 (R{N})` 형태로 만든다. 주행 중에는 **`cachedCoaching`** 세그먼트로 앞 구간을 미리 나누어 두고, 마커 위치(`currentIdx`)가 세그먼트 안에 있으면 그 코칭을 화면에 싱크하고, **저항이 바뀌거나 30초 주기**가 되면 TTS(`speak`)로 다시 낸다.

---

## 2. 데이터 모델

### 2.1 `ElevationPoint` (`types.ts`)

- `elevation`: 미터
- `location`, `resolution`: 경로/샘플 메타(코칭 로직 본체는 `elevation` 배열의 수치에 의존)

### 2.2 `CoachingData` (`types.ts`)

| 필드 | 의미 |
|------|------|
| `tip` | 화면 표시·TTS에 쓰는 문자열. 형식: `"{영문 코칭} (R1~R8)"` |
| `resistance` | `"Resistance {N}"` (내부·비교용) |
| `intensity` | `LOW` / `MODERATE` / `HIGH` / `MAX` — `resistanceToIntensityAction`에서 밴드로부터 파생 |
| `action` | `SIT` / `STAND` / `TUCK` / `PEDAL` — 동일 |
| `validUntilIndex?` | 타입상 옵션. 실제 유효 구간은 아래 `CachedCoachingItem`이 담당 |

### 2.3 `CachedCoachingItem` / `route.cachedCoaching`

```ts
{ coaching: CoachingData; validUntilPathIndex: number }
```

- **`validUntilPathIndex`:** “이 코칭이 **경로 꼭짓점 인덱스 `currentIdx` 기준으로 여기까지** 유효하다”는 상한(포함) 의미로 사용된다.
- 런타임 매칭: `cached.find(c => c.validUntilPathIndex >= currentIdx)` — **배열 앞에서부터** 조건을 만족하는 **첫** 항목이 현재 세그먼트 코칭이 된다. 따라서 `cachedCoaching` 배열은 **시간/거리 순으로 append**되는 전제가 맞다.

---

## 3. 경사도 추정 → 저항 밴드 → 멘트 생성 (`services/aiCoach.ts`)

### 3.1 `getAdvancedCoaching(currentElev, upcomingPoints, speed, previousResistance?)`

실제로 **`currentElev`와 `previousResistance`는 현재 구현에서 코칭 결과에 쓰이지 않는다**(`void` 처리 또는 미사용). 입력의 핵심은 **`upcomingPoints`**(앞쪽 고도 슬라이스)뿐이다.

#### (1) `estimateRoadSlope(upcomingPoints)` (`services/roadElevation.ts`)

- 입력 `ElevationPoint[]`로 **도로 샘플**을 쌓고, **long 채널**(적응 윈도우, 저역통과, 거리당 기울기 클램프, 교량 패턴 감쇠 등), **short 채널**(±60 m 근처 **짧은 구간** 기울기), **trendSlope / trendRiseM**(전체 슬라이스 추세)을 함께 계산한다.
- 반환 예: `slope`(long 파이프라인 결과), `slopeShort`, `trendSlope`, `trendRiseM`, `distanceM`, `elevationSpanM` 등.

#### (2) 단일 대표 경사도 `slope` 선정

`aiCoach.ts`에서는 주석에 “long/short 부호가 같으면 절대값 큰 쪽, 다르면 long 우선” 식의 설명이 있으나, **실제 코드**는 아래와 같다.

- `candidates = [longSlope, shortSlope, trendSlope]`
- `slope =` 위 셋 중 **절대값이 가장 큰** 값(동률이면 앞쪽이 유리한 `reduce` 패턴)

즉 **한 채널에만 묶이지 않고**, 세 값 중 “가장 가파른 쪽”에 가까운 하나를 대표로 삼는다.

#### (3) 저신뢰·퇴화 슬라이스

- `distanceM < 15`이면 `lowConfidence = true`로 보고 **`slope = 0`**(평지 취급).  
  주석: 슬라이스가 사실상 한 점에 가깝으면 기울기 계산이 무의미하다는 의도.

#### (4) 경사도(%) → `targetRes` 1~8

대략적인 구간(코드 그대로):

| 조건 (`slope` %) | `targetRes` |
|------------------|---------------|
| ≥ 10 | 8 |
| ≥ 7 | 7 |
| ≥ 5 | 6 |
| ≥ 3 | 5 |
| ≥ 1 | 4 |
| ≥ -1 | 3 |
| ≥ -3 | 2 |
| &lt; -3 | 1 |

#### (5) “지속 오르막/내리막” 보정 (`sustainedTrendReliable`)

- 조건: `!lowConfidence` 이고 `distanceM >= 120` 이고 `elevationSpanM >= 3`
- **오르막:** `trendRiseM >= 3`일 때 `trendSlope` 구간에 따라 `targetRes`를 **올릴 수만 있음**(`Math.max`).
- **내리막:** `trendRiseM <= -3`일 때 `trendSlope`에 따라 `targetRes`를 **내릴 수만 있음**(`Math.min`).

로컬 `slope`가 스무딩 때문에 0 근처로 깎여 R3에 고착되는 것을 완화한다.

#### (6) 멘트·표시 문자열

- `resistanceText = "Resistance {targetRes}"`, `resId = "res_{targetRes}"`
- `getTipIndicesByResistance(targetRes)`(`phraseManifest.ts`)로 해당 밴드에 속하는 **tip 인덱스 4개** 중 랜덤 선택.
- `getCoachingPhrases()[tipIndex].text`를 본문으로 사용.
- **화면/TTS용:** `tipForDisplay = "{tipText} (R{targetRes})"`  
  (과거 Steady 라벨은 제거되었고, 퇴화 시에도 slope=0 → R3 쪽으로 귀결된다는 주석이 있음.)

#### (7) `intensity` / `action`

`resistanceToIntensityAction(targetRes)`:

- `targetRes >= 6` → `HIGH`, `STAND`
- `targetRes <= 2` → `LOW`, `TUCK`
- 그 외 → `MODERATE`, `PEDAL`

### 3.2 `getPredictiveCoaching(upcomingPoints, pathLen, elevLen, currentIdx, speed, previousResistance?)`

- 내부에서 `getAdvancedCoaching(0, upcomingPoints, speed, previousResistance)` 호출.
- **`validUntilPathIndex`** 계산:
  - `segmentSize = 40` (주석: 약 40 path points ≈ 400 m 단위로 R 갱신 주기 단축)
  - `validUntilPathIndex = min(currentIdx + 40, currentIdx + max(20, upcomingPoints.length * 4))`

`pathLen` / `elevLen` 인자는 시그니처상 받지만 **함수 본문에서 사용하지 않는다**(향후 확장·레거시 여지).

### 3.3 `pickFreshTipForResistance` / `parseResistanceBand`

- **주기 재추첨:** 같은 R 밴드 안에서 **직전 tip 인덱스와 다른** 문구를 고르기 위해 사용(`App.tsx`에서 `lastSpokenTipIndexRef`와 함께 사용).
- `parseResistanceBand`: `"Resistance N"`에서 N 추출. `"Steady"`는 **R3 풀과 공유**한다고 보고 3으로 매핑(구 캐시 호환).

### 3.4 문구 소스 `services/phraseManifest.ts`

- **32개** 고정 영문 문장 `FALLBACK_TIPS`: Res 8용 4개 → … → Res 1용 4개.
- `TIP_TO_RESISTANCE_BAND`: tip_0~3 → 8, … tip_28~31 → 1.
- 코칭은 **Gemini 등 원격 생성이 아니라** 이 로컬 풀만 사용한다(`getPredictiveCoaching` 주석: “로컬 로직만”).

---

## 4. 주행 루프에서의 위치·인덱스 (`App.tsx`)

### 4.1 트리거 effect (요약)

`simulation.alongRouteM` 등이 변할 때마다 실행되는 큰 `useEffect` 안에서:

1. `routeRef.current`로 최신 `route`를 읽는다(stale closure 방지).
2. 누적 거리 `along`으로 `getLatLngAtDistanceAlongPath` → 지도 마커·카메라.
3. **`currentIdx = indexAtOrBeforeCumulativeDistance(cum, along)`** — **path 꼭짓점 인덱스**가 코칭 세그먼트 기준점이다.
4. 주행 비활성이면 코칭 블록은 조기 return(일시정지 시 마커만).

### 4.2 고도 “준비됨” 판정

```ts
const elevationReadyForCoach =
  elevation.length > 0 && elevation.some(p => p.elevation !== 0);
```

- 전 구간이 0m뿐이면 코칭 prefetch·safety net을 돌리지 않는다(평지 더미/미로딩 구분).

### 4.3 현재 세그먼트 코칭 선택

```ts
const currentCached = cached?.find(c => c.validUntilPathIndex >= currentIdx);
```

- 있으면 **캐시 기반 메인 경로**(아래 4.4).
- 없으면 **safety net**(4.5).

### 4.4 캐시 히트 시: 화면 갱신 + TTS + prefetch

**A. 저항(`resistance` 문자열)이 바뀐 경우**

- `setCoachData(currentCached.coaching)`
- `speak(currentCached.coaching.tip)`
- `lastCoachSpeakAtMsRef`, `lastSpokenResistanceRef`, `lastSpokenValidUntilPathIndex`, `lastSpokenTipIndexRef(null)` 갱신

**B. 저항은 같고, 주기 시간이 지난 경우**

- 상수 **`COACH_PERIODIC_SPEAK_MS = 30_000`** (30초).
- `parseResistanceBand(currentRes)`로 밴드 숫자 추출 → `pickFreshTipForResistance(band, false, lastSpokenTipIndexRef)`로 **다른 tip** 선택.
- `setCoachData({ ...currentCached.coaching, tip: fresh.displayText })`
- `speak(fresh.displayText)` — **R은 유지하고 문구만 바꿔** 지루함 완화.

**C. 저항도 같고 주기도 안 지난 경우**

- `setCoachData(currentCached.coaching)`만 — **TTS 없음**(이미 같은 멘트).

**D. Prefetch(캐시 확장)**

- `lastValid = cached[cached.length - 1].validUntilPathIndex`
- `canExtend = lastValid < pathLen - 1`
- 조건: `currentIdx >= lastValid - 100` 이고 `!isPrefetchingCoachRef` 이고 `elevationReadyForCoach`
- **기준 path 인덱스:** `startPathIdx = min(pathLen - 1, max(currentIdx, lastValid))` — 새 세그먼트의 `validUntil`이 반드시 커지도록 미래 쪽을 잡는다.
- **고도 슬라이스:**  
  `rawStartElevIdx = floor((startPathIdx / pathLen) * elevLen)`  
  `rawSegmentSize = min(20, elevLen - rawStartElevIdx)`  
  **최소 2포인트:** 부족하면 끝 쪽으로 백오프해 `sliceStartIdx`·`segmentSize` 조정(1점 슬라이스로 저신뢰만 나오는 것 방지).
- `getPredictiveCoaching(upcomingSlice, ...)` 완료 시 `validUntilPathIndex > lastValid`일 때만 `cachedCoaching`에 **append**(무한 append 방지).

### 4.5 캐시 미스 시: Safety net

조건:

- `currentCached` 없음
- `currentIdx > 0`
- `currentIdx - lastCoachedIndex.current >= 21`
- `elevationReadyForCoach`

동작: 비동기 IIFE에서

- `currentElev` = 비례 매핑으로 현재 고도 샘플 하나
- `upcoming` = `currentIdx`부터 앞으로 대략 20 샘플 분량(끝에서 2포인트 미만이면 끝 2개로 보정)
- `getAdvancedCoaching(currentElev, upcoming, effectiveSpeedKmHRef.current, coachData?.resistance)`
- `setCoachData` + `speak`
- `finally`에서 `lastCoachedIndex.current = currentIdx`

즉 **캐시가 비었거나 prefetch가 못 따라올 때** 누적 거리 tick마다 너무 자주 도는 것을 **21 인덱스 간격**으로 제한한다.

---

## 5. 주행 시작 시 첫 코칭 (`startSimulationCore`)

1. `setCoachData(null)`, `cachedCoaching: []`로 **이전 주행 잔상 제거**.
2. ref 초기화: `lastCoachedIndex`, `lastSpokenValidUntilPathIndex`, prefetch 플래그, `lastCoachSpeakAtMsRef = Date.now()`(바로 30초 주기가 터지지 않게), `lastSpokenResistanceRef = null` 등.
3. `upcomingSlice = elevation.slice(0, min(20, elevLen))` — **처음 최대 20개** 고도 샘플로 첫 세그먼트 계산.
4. `getPredictiveCoaching(..., currentIdx=0, speedKmH)` → `setCoachData`, `cachedCoaching`에 **한 개** 넣음.
5. **중복 speak 방지:** `lastSpokenValidUntilPathIndex`, `lastSpokenResistanceRef`를 먼저 세팅한 뒤 `setCoachData`·`setRoute` (메인 effect가 같은 세그먼트로 또 말하는 문제 방지).
6. `speak(coaching.tip)`, `lastCoachSpeakAtMsRef = Date.now()`, `lastCoachedIndex = 0`.

---

## 6. 화면 표시 (멘트 텍스트)

조건 (`App.tsx` JSX):

- `simulation.isActive`
- `coachData` 존재
- **`coachingMentVisible`** (말풍선 버튼으로 on/off)

렌더:

- 상단 중앙 오버레이, `coachData.tip` 전체를 녹색 글로우 스타일로 표시.

**`coachingOn`(마이크)** 과의 관계:

- **`speak`**는 맨 앞에서 `if (!coachingOn) return;` — **TTS만 끔**.
- **`setCoachData`**는 `coachingOn`과 무관하게 실행되므로, **음소거해도 상단 텍스트는 갱신될 수 있다**(사용자가 멘트만 보고 싶을 때에 맞는 동작).

---

## 7. TTS `speak` 개요 (코칭과의 연결)

- Web: `SpeechSynthesisUtterance` (en-US 우선 음성 탐색).
- 네이티브: Capacitor `TextToSpeech` 폴백.
- 코칭 관련 모든 발화는 이 `speak` 경로로만 나간다(고정 briefing/격려 멘트 포함).

---

## 8. 상태·리셋이 일어나는 지점

다음 이벤트들에서 `lastCoachedIndex`, `lastSpoken*` , `isPrefetchingCoachRef` 등이 초기화되거나 조정된다(대표):

- `startSimulationCore` 시작 시
- 시뮬 정지/리셋/일부 라우트 전환 핸들러 (`handleStopSimulation`, favorite load 등 — `App.tsx` 내 grep 참고)

주행이 끝나면(`along >= total - 0.35` 등) `getRideEncouragement`로 **종료 격려**를 `speak`한다. 이는 elevation 코칭과 별개의 고정 문구다.

---

## 9. 설계상 트레이드오프·주의점

1. **`getPredictiveCoaching`의 `pathLen`/`elevLen` 미사용:** 유효 길이는 `upcomingPoints.length * 4` 등으로만 간접 반영된다.
2. **주석 vs 코드:** `getAdvancedCoaching` 상단 주석의 long/short 결합 규칙과 실제 `reduce(Math.abs)` 선택이 다를 수 있으니, 변경 시 **코드 기준**으로 문서를 맞출 것.
3. **`cachedCoaching.find`:** “첫 번째로 `validUntil >= currentIdx`인 항목”이므로, 배열 순서가 뒤틀리면 잘못된 세그먼트가 선택될 수 있다. 현재는 append-only 전제.
4. **고도 샘플 수 vs path 밀도:** 매핑은 `currentIdx / pathLen * elevLen` 비례. 샘플이 ~100개·path는 densified로 길 수 있어 **공간 해상도 불일치**가 있으나, 의도적으로 가벼운 슬라이스로 근사한다.
5. **언어:** 멘트 본문은 영어 고정 풀. UI/도움말은 다국어가 있어도 코칭 문자열은 `phraseManifest` 기준이다.

---

## 10. 코드 위치 빠른 참조

| 내용 | 위치 |
|------|------|
| `COACH_PERIODIC_SPEAK_MS` | `App.tsx` 상단 상수 근처 |
| 코칭 ref들 | `App.tsx` ~1000행대 |
| 마커·`currentIdx`·캐시·prefetch·safety net | `App.tsx` ~2797–3044행 |
| 상단 멘트 오버레이 | `App.tsx` ~5252–5255행 |
| 음성 on/off | `speak` 내부 `coachingOn` / 툴바 버튼 |
| `getAdvancedCoaching` / `getPredictiveCoaching` | `services/aiCoach.ts` |
| 경사 추정 파이프라인 | `services/roadElevation.ts` (`estimateRoadSlope`) |
| 32문장 풀·밴드별 인덱스 | `services/phraseManifest.ts` |
| `CachedCoachingItem`, `RouteInfo` | `types.ts` |

---

*본 문서는 해당 시점의 소스 기준이며, 리팩터링 시 동기화를 권장한다.*
