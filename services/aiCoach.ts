import { CoachingData, ElevationPoint, RouteInfo } from "../types";
import {
  getTipIndicesByResistance,
  getCoachingPhrases,
} from "./phraseManifest";
import { estimateRoadSlope } from "./roadElevation";

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
  // 1. 도로 종단선형 추정 기반 slope 계산 + DEM 신뢰도 평가
  //    - long 채널: 장구간 안정 (trim, rate-limit, bridge 감쇠)
  //    - short 채널: ±60 m 짧은 윈도우 (짧은 가파른 진입을 놓치지 않도록)
  //    결합 규칙: 두 채널 부호가 같으면 절대값 큰 쪽을 채택, 다르면 long 채널 우선.
  //    이렇게 하면 장구간 안정성을 깨지 않으면서도, 100~300 m 짧은 오르막에서
  //    long 채널이 평탄화로 깎였을 때 short 채널이 R 을 끌어올린다.
  let slope = 0;
  let distance = 0;
  let elevationSpanM = 0;
  let trendSlope = 0;
  let trendRiseM = 0;
  if (upcomingPoints.length > 1) {
    const est = estimateRoadSlope(upcomingPoints);
    const longSlope = est.slope;
    const shortSlope = est.slopeShort;
    trendSlope = est.trendSlope;
    trendRiseM = est.trendRiseM;
    const candidates = [longSlope, shortSlope, trendSlope];
    slope = candidates.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best), 0);
    distance = est.distanceM;
    elevationSpanM = est.elevationSpanM;
  }

  // 슬라이스가 사실상 점(<15m) 인 degenerate 케이스: slope 계산 불가로 0(평지) 으로 본다.
  // ※ 이전에는 이 경우 라벨을 "Steady" 로 표기했으나, 사용자 피드백(실내 자전거 UX) 에 맞춰
  //   라벨은 항상 "R1~R8" 로만 노출한다. lowConfidence 는 내부 telemetry/디버깅 용도로만 유지.
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

  // 지속 오르막/내리막 보정:
  // 로컬 slope 가 스무딩으로 0 근처에 깎여도, upcoming slice 전체가 꾸준히 오르거나 내려가면
  // R3(평지)로 고착되지 않게 최소/최대 밴드를 강제한다.
  const sustainedTrendReliable = distance >= 120 && elevationSpanM >= 3;
  if (!lowConfidence && sustainedTrendReliable) {
    const uphillRiseReliable = trendRiseM >= 3;
    if (uphillRiseReliable) {
      if (trendSlope >= 10) targetRes = Math.max(targetRes, 8);
      else if (trendSlope >= 7) targetRes = Math.max(targetRes, 7);
      else if (trendSlope >= 4) targetRes = Math.max(targetRes, 6);
      else if (trendSlope >= 2) targetRes = Math.max(targetRes, 5);
      else if (trendSlope >= 0.8) targetRes = Math.max(targetRes, 4);
    } else if (trendRiseM <= -3) {
      if (trendSlope <= -3) targetRes = Math.min(targetRes, 1);
      else if (trendSlope <= -1) targetRes = Math.min(targetRes, 2);
    }
  }

  // resistanceText / resId — 항상 R1~R8 로 노출 (Steady 라벨은 사용자 요청에 따라 폐기).
  // degenerate 슬라이스(lowConfidence) 도 slope=0 → R3 으로 분류되므로 의미상 동일하다.
  const resistanceText = `Resistance ${targetRes}`;
  const resId = `res_${targetRes}`;

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

  // UI 표시용: 매 세그먼트 현재 저항 밴드(R1~R8)를 항상 노출.
  // 사용자 요청에 따라 (Steady) 라벨은 제거하고 R3 등 숫자 라벨만 사용한다.
  void previousResistance;
  void lowConfidence; // (디버깅용으로만 보존; 표시 분기에는 사용하지 않음)
  const tipForDisplay = `${tipText} (R${targetRes})`;

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
