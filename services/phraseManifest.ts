/**
 * 코칭 음성 재생용 문구 단일 소스.
 * - 경사도 8단계별 멘트 4개씩 (tip_0~tip_31). 고경사→저경사 순서.
 * - 코칭(tip_X) + 저항(res_Y) 분리 재생 지원.
 */

/** 경사도 8단계 × 4멘트 = 32개. 고경사(Res 8) → 저경사(Res 1) 순서. */
export const FALLBACK_TIPS = [
  // Res 8: slope ≥ 10% (Extreme Uphill)
  "Stay tall. Let the hill come.",
  "Core tight. Stop bouncing.",
  "Stand and drive. Push through.",
  "Max effort. Hold the line.",
  // Res 7: 7% ≤ slope < 10% (Steep Uphill)
  "Hips stable. Let legs work.",
  "Deep breath. Long exhale.",
  "Even pressure through the stroke.",
  "Calm mind. Strong legs.",
  // Res 6: 5% ≤ slope < 7% (Moderate Uphill)
  "Breathe low. Stay calm.",
  "Control breath before speed.",
  "Steady lungs, steady legs.",
  "Save watts. Ride efficient.",
  // Res 5: 3% ≤ slope < 5% (Uphill Start)
  "Relax your grip. No white knuckles.",
  "Ease power. Find rhythm.",
  "Settle in. This section lasts.",
  "No rush. Ride smart.",
  // Res 4: 1% ≤ slope < 3% (False Flat)
  "Elbows soft. Upper body quiet.",
  "Smooth circles, not stomps.",
  "Light feet. Faster spin.",
  "Hold cadence. Ignore speed.",
  // Res 3: -1% ≤ slope < 1% (Flat, Cruising)
  "Eyes up. Line stays clean.",
  "Float the pedals here.",
  "Let rhythm carry you.",
  "Steady pace. Stay smooth.",
  // Res 2: -3% ≤ slope < -1% (Slight Downhill)
  "Recover here. Spin light.",
  "Ease off. Breathe.",
  "Legs rest. Stay loose.",
  "Let gravity help.",
  // Res 1: slope < -3% (Steep Downhill)
  "Let gravity work for you.",
  "Focus now. Free speed ahead.",
  "Tuck and coast.",
  "Easy spin. Enjoy.",
];

/** tip 인덱스 → 저항 밴드(1~8). tip_0~3→8, tip_4~7→7, … tip_28~31→1 */
export const TIP_TO_RESISTANCE_BAND: number[] = (() => {
  const out: number[] = [];
  for (let res = 8; res >= 1; res--) for (let i = 0; i < 4; i++) out.push(res);
  return out;
})();

const RESISTANCE_RANGE = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** 레거시: 3단계 지형 (getTipIndicesByResistance 사용 권장) */
export type Terrain = "UPHILL" | "FLAT" | "DOWNHILL";

export type PhraseEntry = { id: string; text: string };

/** 코칭 전용 문구 (tip_0 ~ tip_31). 분리 재생 시 32개 파일 필요 */
export function getCoachingPhrases(): PhraseEntry[] {
  return FALLBACK_TIPS.map((text, i) => ({ id: `tip_${i}`, text }));
}

/** 저항 전용 문구 (res_1 ~ res_8). 분리 재생 시 8개 파일만 필요 */
export const RESISTANCE_PHRASES: PhraseEntry[] = RESISTANCE_RANGE.map((r) => ({
  id: `res_${r}`,
  text: `Set to ${r}.`,
}));

export function getResistancePhrases(): PhraseEntry[] {
  return RESISTANCE_PHRASES;
}

/** 특정 저항 밴드(1~8)에 맞는 tip 인덱스 목록 (4개씩). 경사도 세분화용 */
export function getTipIndicesByResistance(resistanceBand: number): number[] {
  return TIP_TO_RESISTANCE_BAND.map((r, i) => (r === resistanceBand ? i : -1)).filter((i) => i >= 0);
}

/** 레거시: 특정 지형에 맞는 tip 인덱스. Res 5~8→UPHILL, 3~4→FLAT, 1~2→DOWNHILL */
export function getTipIndicesByTerrain(terrain: Terrain): number[] {
  const bands = terrain === "UPHILL" ? [5, 6, 7, 8] : terrain === "DOWNHILL" ? [1, 2] : [3, 4];
  return bands.flatMap((r) => getTipIndicesByResistance(r));
}

/** 재생 가능한 모든 문구 (base + " (Set to N)" 조합). 테스트 Phase 1·TTS 생성 목록용 */
export function getAllPhrases(): PhraseEntry[] {
  const out: PhraseEntry[] = [];
  for (let i = 0; i < FALLBACK_TIPS.length; i++) {
    const base = FALLBACK_TIPS[i];
    out.push({ id: `tip_${i}`, text: base });
    for (const r of RESISTANCE_RANGE) {
      out.push({ id: `tip_${i}_set_${r}`, text: `${base} (Set to ${r})` });
    }
  }
  return out;
}

/** 정규화: trim, 공백 하나로, 괄호/숫자 통일 */
function normalize(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*Set\s+to\s+(\d+)\s*\)\s*/gi, " (Set to $1)");
}

let _phraseMap: Map<string, string> | null = null;

function getPhraseMap(): Map<string, string> {
  if (_phraseMap) return _phraseMap;
  _phraseMap = new Map();
  for (const { id, text } of getAllPhrases()) {
    _phraseMap.set(normalize(text), id);
  }
  return _phraseMap;
}

/**
 * 재생 문구 텍스트 → 미리 생성된 파일 키(id).
 * 테스트 Phase 2: 동일 입력은 항상 동일 키 반환.
 */
export function textToPhraseKey(text: string): string | null {
  if (!text || typeof text !== "string") return null;
  const key = getPhraseMap().get(normalize(text));
  return key ?? null;
}
