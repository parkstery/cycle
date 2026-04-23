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

  // DEM 신뢰도가 낮은 구간(교량, 짧은 구간, 허수 피크)에서만 Steady(R3)로 중립 처리한다.
  // 이전 임계(distance<80m, |rise|<1m)는 너무 보수적이라 경로 대부분이 Steady 로 고착되는
  // 문제가 있어 아래와 같이 완화한다.
  // - 구간 길이 < 30m (사실상 점)
  // - 순고도차 |rise| < 0.3m (DEM 수직 정확도보다 훨씬 작은 변화)
  // - 구간 내 고도 스팬이 순상승의 3배 이상 + 평균 기울기 < 1% (명백한 노이즈 지그재그)
  const lowConfidence =
    distance < 30 ||
    Math.abs(rise) < 0.3 ||
    (elevationSpanM > Math.max(3, Math.abs(rise) * 3) && Math.abs(slope) < 1);
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
