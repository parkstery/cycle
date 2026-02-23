# Gemini API 보이스 코칭 → Cache TTS 전환 실행계획서

**작성일:** 2025-01-31  
**목적:** Gemini API 이용 코칭 서비스를 Cache TTS 방식으로 전환하여 비용 증가 우려 해소  
**제약:** 기능·UI/UX 변경·삭제 없음 (현 단계에서 코드 미작성, 계획만 수립)

---

## 1. 개요

### 1.1 현재 구조

| 구분 | 위치 | 역할 |
|------|------|------|
| 코칭 생성 | services/aiCoach.ts | Gemini API로 tip·resistance·intensity·action 생성 (getAdvancedCoaching, getPredictiveCoaching) |
| 음성 출력 | App.tsx | `speak(text)` → `window.speechSynthesis` (브라우저 TTS) |
| UI 표시 | App.tsx | coachData.tip 텍스트 표시 |

### 1.2 목표 구조

| 구분 | 위치 | 역할 |
|------|------|------|
| 문구 매핑 | services/phraseManifest.ts | 문구 텍스트 ↔ 파일 ID(tip_X, res_Y) 매핑. textToPhraseKey() 등 제공 |
| 오디오 재생 | services/audioCache.ts | MP3 로드·캐시·재생. playPhrase(), playCoachingThenResistance() 등. phraseManifest만 사용 |
| 정적 자산 | services/coaching/*.mp3 | 실제 재생 MP3. tip_0~tip_21(22개) + res_1~res_8(8개) = 30개 |

### 1.3 MP3 폴더 위치 (서비스 가능성)

- **배치 경로:** `services/coaching/` (프로젝트 루트 기준).
- **서비스 방식 확인 사항:**
  - Vite 기준: `services/` 는 소스 디렉터리이므로, MP3는 (1) `import` 경로로 번들에 포함되거나, (2) `public/` 하위에 두고 URL로 접근하는 방식 중 하나로 서빙해야 함.
  - **권장:** `public/services/coaching/*.mp3` 로 두고 런타임에 `/services/coaching/tip_0.mp3` 등으로 로드하거나, Vite에서 `services/coaching` 을 정적 자산으로 복사하도록 설정하여 서비스 가능한지 확인.
  - 대안: `services/coaching/*.mp3` 를 그대로 두고, 빌드 설정에서 해당 디렉터리를 `public` 에 복사하거나, `import.meta.url` 기반 상대 경로로 로드 가능한지 검증.

---

## 2. 폴더·파일 구조

```
(프로젝트 루트)
├── services/
│   ├── aiCoach.ts          (기존, 전환 후 역할 조정)
│   ├── phraseManifest.ts   (신규) 문구 텍스트 ↔ 파일 ID 매핑
│   ├── audioCache.ts       (신규) MP3 로드·캐시·재생
│   └── coaching/           (신규) MP3 정적 자산
│       ├── tip_0.mp3
│       ├── tip_1.mp3
│       ├── ...
│       ├── tip_21.mp3
│       ├── res_1.mp3
│       ├── ...
│       └── res_8.mp3
```

- **MP3 서비스:** 위와 같이 `services/coaching/` 에 두고, Vite/빌드 설정으로 해당 경로가 실제로 서비스(또는 복사)되도록 한 뒤, `audioCache` 에서 사용할 URL/경로 규칙을 실행계획 3·4단계에서 확정.

---

## 3. phraseManifest.ts 설계

### 3.1 역할

- 문구 **텍스트** ↔ **파일 ID** (tip_X, res_Y) 매핑.
- 코칭 재생 경로에서는 **텍스트 → ID** 변환이 주 사용처.

### 3.2 제공 함수(안)

| 함수(안) | 입출력 | 설명 |
|----------|--------|------|
| textToPhraseKey(text: string) | → tip_X \| null | 코칭 문구 텍스트를 tip_0~tip_21 중 하나로 매핑. 매칭 실패 시 null 또는 기본값(tip_0 등) 반환 |
| resistanceToKey(resistance: string \| number) | → res_Y | "Resistance N" 또는 숫자 N → res_1~res_8 |
| phraseKeyToText(phraseKey: string) | → string | tip_X → 표시용 텍스트 (UI 호환용, 선택) |
| getTipKeyFromCoachingData(data: CoachingData) | → { tipKey, resKey } | CoachingData 한 번에 tip/res 파일 ID 쌍 반환 |

### 3.3 매핑 데이터 구조(안)

- **tip_0 ~ tip_21:** 각 ID에 대응하는 **표준 문구 텍스트** 목록을 상수로 보관.
- **textToPhraseKey:**  
  - 입력 텍스트와 표준 문구를 비교(완전 일치 또는 키워드/유사도 기반 매칭)하여 가장 가까운 tip_X 반환.  
  - Gemini/로직에서 반환하는 tip 문자열을 그대로 넣어도 매칭 가능하도록 설계.
- **res_1 ~ res_8:** resistance 숫자 1~8 → res_1 ~ res_8 1:1 매핑.

### 3.4 기존 FALLBACK_TIPS와의 정합성

- aiCoach.ts의 FALLBACK_TIPS 문구들을 phraseManifest의 표준 문구 목록에 포함시키고, 각각 tip_X와 1:1 매핑하여, 기존 코칭 문구가 그대로 cache TTS로 재생되도록 할 것.

---

## 4. audioCache.ts 설계

### 4.1 역할

- MP3 **로드·캐시·재생**.
- **phraseManifest만 참조** (tip_X, res_Y 문자열만 사용, 텍스트 직접 참조 없음).

### 4.2 MP3 경로 규칙

- **기준:** `services/coaching/` 에 MP3 배치.
- **런타임 URL(안):**  
  - Vite dev: `/services/coaching/tip_0.mp3` (또는 public 복사 시 동일)  
  - Vite build: `import.meta.env.BASE_URL + 'services/coaching/tip_0.mp3'` 또는 빌드 설정에 따른 실제 서빙 경로.  
- 실행계획 단계에서 **실제 서빙 가능 경로**를 한 번 확인한 뒤, audioCache는 그 경로 규칙만 사용하도록 설계.

### 4.3 제공 함수(안)

| 함수(안) | 역할 |
|----------|------|
| playPhrase(phraseKey: string) | tip_X 또는 res_Y 하나 재생. 로드 후 캐시, 재생. |
| playCoachingThenResistance(tipKey: string, resKey: string) | tip 재생 완료 후 res 재생 (또는 순서/동시 재생 정책에 따라 정의). |
| preloadPhrase(phraseKey: string) | 해당 ID MP3 선로드(캐시만). |
| preloadCoachingSet() | tip_0~tip_21, res_1~res_8 전부 선로드(선택). |
| stop() | 현재 재생 중인 코칭/문구 정지. |

### 4.4 캐시·재생 정책(안)

- **캐시:** phraseKey당 HTMLAudioElement(또는 AudioBuffer) 1개, 최초 재생 또는 preload 시 로드 후 보관.
- **재생 중 중복 호출:** 새 play 요청 시 기존 재생 정지 후 새 문구 재생할지, 큐로 순차 재생할지 정책 확정 (기존 speak() 취소 후 한 번만 말하는 동작에 맞추는 것을 권장).

---

## 5. 전환 시나리오 및 적용 범위

### 5.1 적용 대상

- **App.tsx에서 `speak(coaching.tip)` 호출부:**  
  → phraseManifest로 tip/res ID 취득 후, audioCache.playCoachingThenResistance(tipKey, resKey) 호출로 대체.
- **App.tsx에서 기타 `speak(...)` 호출부:**  
  - "Starting the ride. Total distance ...", "Ride finished. Distance covered ..." 등은 (1) 그대로 브라우저 TTS 유지, (2) 별도 문구 ID로 cache TTS 확장, (3) 제거 중 하나로 정책 확정 후 반영.  
  - **기능·UI 유지** 원칙에 따라, 최소한 (1) 또는 (2)로 동일 문구가 재생되도록 유지.

### 5.2 Gemini API 사용 정책 (선택)

- **옵션 A (최소 변경):**  
  - Gemini는 **그대로** 사용 (getAdvancedCoaching / getPredictiveCoaching 유지).  
  - 반환된 CoachingData.tip / resistance를 phraseManifest로 매핑 → cache TTS만 재생.  
  - 효과: 브라우저 TTS 비용·품질 이슈 제거, Gemini 비용은 유지.
- **옵션 B (비용 최대 절감):**  
  - 코칭 문구 생성은 **로컬 로직**만 사용 (경사·속도·이전 저항 → tip_X, res_Y 직접 결정).  
  - Gemini 호출 제거 또는 최소화.  
  - 효과: Gemini + TTS 비용 모두 감소.  
- **실행계획 단계 권장:**  
  - 1차 전환은 **옵션 A**로 진행 (문구 생성 로직 유지, 재생만 cache TTS).  
  - 옵션 B는 별도 단계에서 “로컬 코칭 로직 + phraseManifest 직접 매핑”으로 이전하는 계획으로 수립.

---

## 6. 단계별 실행계획

### 6.1 1단계: 정적 자산 및 경로 확정

1. **services/coaching/ 디렉터리 생성.**
2. **tip_0.mp3 ~ tip_21.mp3, res_1.mp3 ~ res_8.mp3** 30개 파일 준비 (기존 FALLBACK_TIPS·표준 문구와 동기화).
3. **Vite(또는 사용 빌드 도구)에서 `services/coaching/` 서빙 가능 여부 확인:**
   - `public/services/coaching/` 로 복사 후 `/services/coaching/tip_0.mp3` 로 접근하거나,
   - `services/coaching/` 를 정적 자산으로 복사/번들하도록 설정.
4. 브라우저에서 직접 URL 접근하여 MP3 재생 가능함을 확인.

### 6.2 2단계: phraseManifest.ts 구현

1. **표준 문구 목록 정의:** tip_0~tip_21에 대응하는 영어 문구 텍스트 상수 (기존 FALLBACK_TIPS 및 aiCoach 반환값과 맞출 것).
2. **textToPhraseKey(text)** 구현:  
   - 완전 일치 우선, 없으면 키워드/유사 매칭으로 tip_X 반환, 실패 시 tip_0 등 기본값 반환.
3. **resistanceToKey(resistance)** 구현: "Resistance N" 파싱 또는 숫자 N → res_N (1~8).
4. **getTipKeyFromCoachingData(data)** 구현: CoachingData → { tipKey, resKey } (내부에서 textToPhraseKey, resistanceToKey 사용).
5. (선택) phraseKeyToText: UI 표시용으로 tip_X → 텍스트 반환.

### 6.3 3단계: audioCache.ts 구현

1. **MP3 URL 생성 로직:** phraseManifest와 무관하게, tip_X / res_Y 문자열만 받아 서빙 경로 규칙에 따라 URL 생성 (예: `/services/coaching/${phraseKey}.mp3`).
2. **캐시 구조:** phraseKey → Audio 인스턴스(또는 blob URL) 보관.
3. **playPhrase(phraseKey)** 구현: 캐시 있으면 재생, 없으면 로드 후 캐시·재생.
4. **playCoachingThenResistance(tipKey, resKey)** 구현: tip 재생 완료 이벤트 후 res 재생 (또는 정책에 따라 순서/간격 정의).
5. **stop()** 구현: 현재 재생 중인 오디오 정지.
6. (선택) preloadPhrase / preloadCoachingSet: 시뮬 시작 전에 호출하여 끊김 방지.

### 6.4 4단계: App.tsx 연동 (기능·UI 유지)

1. **speak(coaching.tip) 호출부 식별:**  
   - getAdvancedCoaching / getPredictiveCoaching 결과로 `speak(coaching.tip)` 호출하는 모든 위치.
2. **대체 로직:**  
   - phraseManifest.getTipKeyFromCoachingData(coaching) → { tipKey, resKey }.  
   - audioCache.playCoachingThenResistance(tipKey, resKey) 호출.  
   - 기존 speak(...) 호출 제거 또는 조건부로 cache TTS 실패 시에만 speak 유지(폴백).
3. **UI:**  
   - coachData.tip 표시는 유지.  
   - 표시 텍스트는 (1) coaching.tip 그대로, (2) phraseManifest.phraseKeyToText(tipKey) 중 정책에 따라 하나로 통일.
4. **기타 speak(...) 호출:**  
   - "Starting the ride...", "Ride finished..." 등은 전환 범위에서 제외하거나, 별도 phrase ID가 있으면 cache TTS로 확장 (정책 확정 후 반영).

### 6.5 5단계: aiCoach.ts 정합성 (옵션 A 기준)

1. **getAdvancedCoaching / getPredictiveCoaching 반환값 유지:**  
   - tip 문자열이 phraseManifest의 표준 문구 또는 유사 문구와 매칭 가능하도록, FALLBACK_TIPS 및 Gemini 프롬프트 출력 형식을 phraseManifest 목록과 맞춤.
2. **필요 시:**  
   - 반환 tip을 phraseManifest에 있는 문구로 정규화하는 로직을 phraseManifest 또는 aiCoach 쪽에 한 곳만 두어, 매칭 실패를 최소화.

### 6.6 6단계: 테스트·검증

1. **단위(유사):** textToPhraseKey, resistanceToKey에 여러 입력으로 기대 ID가 나오는지 확인.
2. **재생:** playPhrase(tip_0), playCoachingThenResistance(tip_0, res_3) 등으로 실제 MP3 재생 및 순서 확인.
3. **통합:** 경로 계산 → 시뮬 시작 → 코칭 발생 시, 브라우저 TTS 없이 cache TTS만 재생되는지, UI 문구와 재생 내용이 일치하는지 확인.
4. **폴백:** phraseManifest 매칭 실패 시(또는 MP3 로드 실패 시) 기존 speak() 폴백 동작 여부 확인.

---

## 7. 리스크·보완

| 항목 | 내용 | 보완 |
|------|------|------|
| MP3 경로 | services/coaching/ 이 빌드·서빙에 포함되지 않을 수 있음 | public/services/coaching/ 또는 빌드 설정으로 복사/서빙 경로 확정 후 audioCache에 반영 |
| 매칭 실패 | Gemini/로직이 반환한 tip이 phraseManifest에 없을 수 있음 | textToPhraseKey에서 유사도·키워드 매칭 및 기본값(tip_0) 반환, 필요 시 aiCoach 반환 문구를 표준 문구로 정규화 |
| 재생 순서 | tip → res 순서, 간격, 중복 호출 시 동작 | playCoachingThenResistance 내부 정책(직렬 재생, 간격, 새 호출 시 기존 정지 등)을 명세에 명시 후 구현 |
| 기타 speak() | "Starting the ride...", "Ride finished..." | 전환 범위에서 제외 시 브라우저 TTS 유지; 포함 시 별도 phrase ID·MP3 추가 후 동일 방식 적용 |

---

## 8. 요약

- **신규 파일:** services/phraseManifest.ts, services/audioCache.ts, services/coaching/*.mp3(30개).
- **MP3 위치:** services/coaching/ 에 두고, Vite(또는 사용 빌드)에서 실제 서빙 가능한 경로로 확인 후 audioCache에서 해당 경로만 사용.
- **전환 범위:** 코칭 음성만 cache TTS로 전환(기능·UI 유지). 1차는 Gemini 유지(옵션 A), 재생만 cache TTS; 이후 옵션 B(로컬 코칭 + cache TTS) 검토 가능.
- **실행 순서:** 정적 자산·경로 확정(1) → phraseManifest(2) → audioCache(3) → App 연동(4) → aiCoach 정합성(5) → 테스트(6).

위 계획 승인 후, 단계별로 코드 작성 및 반영을 진행하면 됩니다.
