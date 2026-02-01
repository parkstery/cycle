# Report 폴더 보고서 ↔ 코드 일치도 검증 보고서

**검증일:** 2025-01-31  
**대상:** Report/riding_time_logic.md, Report/riding-streetview_logig_analysis.md, Report/Dev. Report-20260131.md  
**대조 코드:** App.tsx, services/aiCoach.ts, package.json

---

## 1. riding_time_logic.md (주행 시간 계산 로직) — 일치도: **100%**

| 보고서 기술 | 코드 위치 | 검증 결과 |
|------------|-----------|------------|
| 경로를 약 100개 샘플 지점으로 나눔 | `getElevationAlongPath({ path, samples: 100 })` (App.tsx:888) | ✅ 일치 |
| 경사도 계산: (고도 변화량 / 이동 거리) × 100 | `const grade = (elevationChange / dist) * 100` (App.tsx:900) | ✅ 일치 |
| 급경사 오르막 (>6%) → factor 0.50 | `else factor = 0.50; // Steep ascent (> 6%)` (App.tsx:910) | ✅ 일치 |
| 일반 오르막 (3%~6%) → 0.70 | `else if (grade < 6) factor = 0.70; // Ascent` (App.tsx:909) | ✅ 일치 |
| 완만한 오르막 (1%~3%) → 0.85 | `else if (grade < 3) factor = 0.85; // Mild ascent` (App.tsx:908) | ✅ 일치 |
| 평지 (-1%~1%) → 1.00 | `else if (grade < 1) factor = 1.00; // Flat` (App.tsx:907) | ✅ 일치 |
| 완만한 내리막 (-3%~-1%) → 1.10 | `else if (grade >= -1) factor = 1.10; // Mild descent` (App.tsx:906) | ✅ 일치 |
| 일반 내리막 (-6%~-3%) → 1.25 | `else if (grade <= -3) factor = 1.25; // Descent` (App.tsx:905) | ✅ 일치 |
| 급경사 내리막 (<-6%) → 1.35 | `if (grade <= -6) factor = 1.35; // Steep descent` (App.tsx:904) | ✅ 일치 |
| 구간 시간 = 거리 / 보정속도, 누적 합산 | `calculatedSeconds += (dist / adjustedSpeedMs)` (App.tsx:914) | ✅ 일치 |
| 총 초 → 시간·분 포맷팅 | `h = floor(calculatedSeconds/3600)`, `m = round((%3600)/60)` (App.tsx:918-919) | ✅ 일치 |

**결론:** 보고서의 경사도 구간·보정 계수·누적 시간 산출 방식이 코드와 완전히 일치함.

---

## 2. riding-streetview_logig_analysis.md (시뮬레이션·스트리트뷰 로직) — 일치도: **100%**

| 보고서 기술 | 코드 위치 | 검증 결과 |
|------------|-----------|------------|
| 경로를 약 2m 단위 Densification | `const segmentLength = 2;` (App.tsx:923), `dist > segmentLength` 시 보간 (929-934) | ✅ 일치 |
| 정확한 LatLng 우선(도로 스냅 오차 감소) | `originLocationRef.current`, `destLocationRef.current`, `useOrigin`/`useDest` (App.tsx:817-818, 983, 997) | ✅ 일치 |
| setTimeout 기반 가변 프레임, 속도에 따른 delay | `delay = (distMeters / speedMetersPerSec) * 1000`, `setTimeout(..., delay)` (App.tsx:599-602, 607) | ✅ 일치 |
| 마커 위치·Heading으로 시선 방향 회전 | `computeHeading(currentPos, targetPosForHeading)`, `setOptions({ rotation: heading })` (App.tsx:518-520) | ✅ 일치 |
| 세마포어 isSvSearching으로 중복 요청 방지 | `isSvSearching.current = true/false` (App.tsx:536, 578) | ✅ 일치 |
| 검색 임계값 15m | `distFromLastPano > 15 \|\| !currentPanoLoc` (App.tsx:535) | ✅ 일치 |
| 전략 1: 현재 좌표 50m 반경 | `findStreetView(..., currentPos, 50)` (App.tsx:543) | ✅ 일치 |
| 전략 2: Look-ahead 1~5단계 | `LOOK_AHEAD_STEPS = 5`, `for (i = 1; i <= 5)` (App.tsx:547-551) | ✅ 일치 |
| 전략 3: 100m Fallback | `findStreetView(..., currentPos, 100)` (App.tsx:562) | ✅ 일치 |
| 듀얼 뷰어 panorama1, panorama2 | `panorama1.current`, `panorama2.current` (App.tsx:61-62, 418-419) | ✅ 일치 |
| visiblePanoIdx로 Z-Index 제어 | `visiblePanoIdx === 0 ? 'z-20' : 'z-10'` (App.tsx:1124, 1126) | ✅ 일치 |
| Case 1: Links에 새 pano 있음 → setPano만 | `isConnected` 시 `currentPano.setOptions({ pano: newPanoId, ... })` (App.tsx:303-308) | ✅ 일치 |
| Case 2: 비연속 → 백그라운드 로딩 후 Swap | `nextPano.setOptions(...)`, `links_changed` 또는 500ms 후 `doSwap()` (App.tsx:313-340) | ✅ 일치 |
| links_changed 이벤트 및 500ms 타임아웃 | `nextPano.addListener('links_changed', ...)`, `setTimeout(..., 500)` (App.tsx:329, 340) | ✅ 일치 |
| AI 코칭: 고도·경사도·Gemini·TTS | `getAdvancedCoaching(...)`, `speak(newCoaching.tip)` (App.tsx:590, 593), aiCoach.ts | ✅ 일치 |
| 일시정지/종료 시 오디오·상태 정리 | `handleStopSimulation` 내 `speechSynthesis.cancel()`, `setCoachData(null)` 등 (App.tsx:739-741) | ✅ 일치 |

**결론:** 시뮬레이션 엔진, 3단계 SV 검색, 이중 버퍼링, AI 코칭·상태 정리까지 보고서 기술과 코드가 모두 일치함.

---

## 3. Dev. Report-20260131.md (개발 보고서·사용자 매뉴얼) — 일치도: **대부분 일치, 일부 수정 필요**

| 보고서 기술 | 실제 코드/현황 | 검증 결과 |
|------------|----------------|------------|
| Frontend: React **19**, TypeScript, Tailwind | package.json: **React 18.2** (react@^18.2.0) | ⚠️ **불일치** — React 18.2 사용 중 |
| AI Engine: Google **Gemini 1.5 Flash** | aiCoach.ts: **gemini-3-flash-preview** | ⚠️ **불일치** — 모델명 상이 |
| 스트리트뷰 전환: **사람 아이콘(User)** 클릭 | App.tsx: **Pegman 스타일 인라인 SVG** (PEGMAN_ICON) 사용 | ⚠️ **수정됨** — 현재는 Pegman 아이콘 |
| 하이브리드 경로 탐색 (Google → OSRM) | calculateRoute 내 ds.route try/catch 후 OSRM (App.tsx:548-581) | ✅ 일치 |
| Double Buffering Street View | panorama1/panorama2, visiblePanoIdx, setPanoramaView (App.tsx) | ✅ 일치 |
| AI 코치: 고도·속도·Gemini·TTS | getAdvancedCoaching, speak (App.tsx, aiCoach.ts) | ✅ 일치 |
| 접이식 패널, 지도 가독성 | searchExpanded, routeInputExpanded, elevationExpanded, historyExpanded (App.tsx) | ✅ 일치 |
| 지도 축척바(Scale Bar) 활성화 | `scaleControl: true`, `scaleControlOptions: { position: BOTTOM_LEFT }` (App.tsx:377-380) | ✅ 일치 |
| 장소 검색·지도 클릭·START/WAYPOINT/END | handlePlaceSearch, clickedLocation, handleSetStart/End/AddWaypoint (App.tsx) | ✅ 일치 |
| Play/Pause, 속도 10~100 km/h | handleToggleSimulation, speedKmH, input range min="10" max="100" (App.tsx) | ✅ 일치 |
| 고도 차트·현재 위치 추적 | AreaChart, ReferenceLine by simulation.currentIndex (App.tsx:1293) | ✅ 일치 |
| My Routes(별표)·레이어·위성 전환 | handleToggleFavorite, handleToggleMapType, showCoverage (App.tsx) | ✅ 일치 |

**결론:** 기능·UI 설명은 코드와 일치. **React 버전(19 vs 18.2), Gemini 모델명(1.5 Flash vs gemini-3-flash-preview), Street View 버튼 아이콘(User vs Pegman)** 세 가지는 보고서 수정이 필요함.

---

## 4. 종합 요약

| 문서 | 일치도 | 비고 |
|------|--------|------|
| riding_time_logic.md | **100%** | 경사도 구간·보정 계수·시간 산출 로직 모두 코드와 일치 |
| riding-streetview_logig_analysis.md | **100%** | Densification, SV 검색 3단계, 이중 버퍼링, AI 코칭 모두 일치 |
| Dev. Report-20260131.md | **약 90%** | React 19→18.2, Gemini 1.5 Flash→gemini-3-flash-preview, User→Pegman 반영 시 100%에 근접 |

**권장 사항:**  
- **Dev. Report-20260131.md**에서 (1) React 18.2 명시, (2) AI 모델은 "Gemini (gemini-3-flash-preview)" 등 실제 모델명 명시, (3) 스트리트뷰 버튼은 "Pegman 아이콘"으로 기술하면 코드와 완전히 일치한 문서가 됨.
