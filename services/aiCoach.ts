import { CoachingData, ElevationPoint, RouteInfo } from "../types";
import {
  getTipIndicesByResistance,
  getCoachingPhrases,
} from "./phraseManifest";
import { computeDistanceBetween } from "./geoUtils";

/** 저항 밴드(1~8) → intensity, action. 경사도 세분화에 맞춤 */
function resistanceToIntensityAction(targetRes: number): {
  intensity: "LOW" | "MODERATE" | "HIGH" | "MAX";
  action: "SIT" | "STAND" | "TUCK" | "PEDAL";
} {
  if (targetRes >= 6) return { intensity: "HIGH", action: "STAND" };
  if (targetRes <= 2) return { intensity: "LOW", action: "TUCK" };
  return { intensity: "MODERATE", action: "PEDAL" };
}

/** 배열에서 랜덤 한 요소 반환 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const getAdvancedCoaching = async (
  _currentElevation: number,
  upcomingPoints: ElevationPoint[],
  _currentSpeed: number,
  previousResistance?: string
): Promise<CoachingData & { tipId?: string; resId?: string }> => {
  // 1. Calculate accurate slope + DEM 신뢰도 평가
  let slope = 0;
  let distance = 0;
  let rise = 0;
  let elevationSpanM = 0;
  if (upcomingPoints.length > 1) {
    const start = upcomingPoints[0];
    const end = upcomingPoints[upcomingPoints.length - 1];
    distance = computeDistanceBetween(start.location, end.location);
    rise = end.elevation - start.elevation;
    if (distance > 0) slope = (rise / distance) * 100;
    // 구간 내 고도 최대-최소(노이즈 판별용)
    let minEl = Infinity;
    let maxEl = -Infinity;
    for (const p of upcomingPoints) {
      if (p.elevation < minEl) minEl = p.elevation;
      if (p.elevation > maxEl) maxEl = p.elevation;
    }
    if (Number.isFinite(minEl) && Number.isFinite(maxEl)) elevationSpanM = maxEl - minEl;
  }

  // Steady(R3)로 중립 처리하는 경우는 "슬라이스가 사실상 점" 인 degenerate 케이스로만 제한한다.
  // 기존 zig-zag 조건(span > rise*5 && |slope|<0.5) 은 "내부에 기복이 있지만 시점·종점 고도가
  // 비슷한 롤링 힐"(예: Lake Louise 트레일) 을 오판하여 Steady 로 빠지게 만들었다.
  // 이런 구간은 평균 slope 가 작더라도 R3 로 해석하는 것이 의미상 맞으므로 조건을 제거한다.
  const lowConfidence = distance < 15;
  if (lowConfidence) slope = 0;

  // 2. Resistance based on slope
  let targetRes = 3;
  if (slope >= 10) targetRes = 8;
  else if (slope >= 7) targetRes = 7;
  else if (slope >= 5) targetRes = 6;
  else if (slope >= 3) targetRes = 5;
  else if (slope >= 1) targetRes = 4;
  else if (slope >= -1) targetRes = 3;
  else if (slope >= -3) targetRes = 2;
  else targetRes = 1;

  const resistanceText = lowConfidence ? 'Steady' : `Resistance ${targetRes}`;
  const resId = lowConfidence ? 'res_steady' : `res_${targetRes}`;

  // 3. 경사도(저항 밴드)별 코칭 멘트 후보 4개 중 랜덤 선택 (Gemini 없음)
  const candidateIndices = getTipIndicesByResistance(targetRes);
  const tipIndex =
    candidateIndices.length > 0
      ? pickRandom(candidateIndices)
      : Math.floor(Math.random() * 32);
  const phrases = getCoachingPhrases();
  const tipId = `tip_${tipIndex}`;
  const tipText = phrases[tipIndex]?.text ?? phrases[0].text;

  const { intensity, action } = resistanceToIntensityAction(targetRes);

  // UI 표시용: 세그먼트마다 현재 저항 밴드(또는 Steady)를 항상 노출하여
  // 긴 동일-저항 구간에서도 사용자가 현재 R 값을 인지할 수 있게 한다.
  // previousResistance 는 참고용으로 남겨 두되(향후 TTS 부가문구에 재활용 가능), 표시 규칙에서는 제외.
  void previousResistance;
  const tipForDisplay = lowConfidence
    ? `${tipText} (Steady)`
    : `${tipText} (R${targetRes})`;

  return {
    tip: tipForDisplay,
    resistance: resistanceText,
    intensity,
    action,
    tipId,
    resId,
  };
};

/** 예측 코칭: 경사 기반 로컬 로직만 사용(Gemini 없음). validUntilPathIndex 반환. */
export const getPredictiveCoaching = async (
  upcomingPoints: ElevationPoint[],
  _pathLen: number,
  _elevLen: number,
  currentIdx: number,
  _currentSpeed: number,
  previousResistance?: string
): Promise<{
  coaching: CoachingData & { tipId?: string; resId?: string };
  validUntilPathIndex: number;
}> => {
  // 세그먼트 크기를 40 path points (약 400m) 로 줄여 R 갱신 주기를 단축.
  // 기존 80 은 약 800m ≈ 2~3분 동안 같은 R 이 표시되어 현재 고도 국면과 체감 불일치가 컸다.
  const segmentSize = 40;
  const validUntilPathIndex = Math.min(
    currentIdx + segmentSize,
    currentIdx + Math.max(20, upcomingPoints.length * 4)
  );
  const result = await getAdvancedCoaching(
    0,
    upcomingPoints,
    _currentSpeed,
    previousResistance
  );
  return { coaching: result, validUntilPathIndex };
};

/**
 * 주기 재추첨용 헬퍼 — 같은 R 밴드에서 (직전과 다른) 랜덤 tip 을 뽑아
 * "(Rn)" 또는 "(Steady)" 라벨까지 붙인 display 문자열을 반환한다.
 * 같은 R 구간이 길게 이어질 때 지루함 방지용 주기 발화에 사용.
 */
export function pickFreshTipForResistance(
  targetRes: number,
  isSteady: boolean,
  avoidTipIndex?: number | null
): { tipText: string; tipIndex: number; displayText: string } {
  const all = getTipIndicesByResistance(targetRes);
  const filtered = typeof avoidTipIndex === 'number'
    ? all.filter((i) => i !== avoidTipIndex)
    : all;
  const pool = filtered.length > 0 ? filtered : all;
  const tipIndex = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : 0;
  const phrases = getCoachingPhrases();
  const tipText = phrases[tipIndex]?.text ?? phrases[0].text;
  const displayText = isSteady ? `${tipText} (Steady)` : `${tipText} (R${targetRes})`;
  return { tipText, tipIndex, displayText };
}

/** "Resistance N" / "Steady" → 숫자 밴드(1~8). Steady 는 R3 풀을 공유하므로 3 으로 본다. */
export function parseResistanceBand(resistanceText: string | undefined): number {
  if (!resistanceText) return 3;
  if (resistanceText === 'Steady') return 3;
  const m = resistanceText.match(/Resistance\s*(\d+)/i);
  const n = m ? parseInt(m[1], 10) : 3;
  return Number.isFinite(n) ? Math.max(1, Math.min(8, n)) : 3;
}

/** 주행 시작 시 코스 전반 안내. 브라우저 TTS만 사용(고정 문구) */
export const getCourseBriefing = async (route: RouteInfo): Promise<string> => {
  return `The ride distance is ${route.distance}. Have a great ride!`;
};

/** 주행 종료 시 격려 멘트. 브라우저 TTS만 사용(고정 문구) */
export const getRideEncouragement = async (
  route: RouteInfo,
  stats?: { distance: string; duration: string }
): Promise<string> => {
  const dist = stats?.distance ?? route.distance;
  return `You covered ${dist}. Great job!`;
};
