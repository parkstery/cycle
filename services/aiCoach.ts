import { CoachingData, ElevationPoint, RouteInfo } from "../types";
import {
  getTipIndicesByResistance,
  getCoachingPhrases,
} from "./phraseManifest";

declare var google: any;

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
  // 1. Calculate accurate slope
  let slope = 0;
  if (upcomingPoints.length > 1) {
    if (typeof google !== "undefined" && google.maps && google.maps.geometry) {
      const start = upcomingPoints[0];
      const end = upcomingPoints[upcomingPoints.length - 1];
      const distance = google.maps.geometry.spherical.computeDistanceBetween(
        start.location,
        end.location
      );
      const rise = end.elevation - start.elevation;
      if (distance > 0) slope = (rise / distance) * 100;
    }
  }

  // 2. Resistance based on slope (기존 고정 로직 유지)
  let targetRes = 3;
  if (slope >= 10) targetRes = 8;
  else if (slope >= 7) targetRes = 7;
  else if (slope >= 5) targetRes = 6;
  else if (slope >= 3) targetRes = 5;
  else if (slope >= 1) targetRes = 4;
  else if (slope >= -1) targetRes = 3;
  else if (slope >= -3) targetRes = 2;
  else targetRes = 1;

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

  // UI 표시용: 저항이 바뀐 경우 "(Set to N)" 붙임 (캐시 재생은 tipId + resId 로 분리 재생)
  const tipForDisplay =
    resistanceText !== previousResistance
      ? `${tipText} (Set to ${targetRes})`
      : tipText;

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
  const segmentSize = 80;
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

/** 주행 시작 시 코스 전반 안내 (Gemini 1회 호출) */
export const getCourseBriefing = async (route: RouteInfo): Promise<string> => {
  const apiKey = (process as { env?: { GOOGLE_GEMINI_API_KEY?: string } }).env
    ?.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    return `Starting the ride. Total distance ${route.distance}, estimated ${route.duration}. Shall we start a fun ride today?`;
  }
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a friendly cycling coach. Give one short (1-2 sentences) encouraging course overview for a ride. Route: from "${route.origin}" to "${route.destination}". Distance: ${route.distance}, estimated duration: ${route.duration}. Reply in English only, friendly and motivating. No bullet points.`;
    const res = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });
    const text = (res as { text?: string }).text?.trim();
    if (text) return text;
  } catch (_) {
    // fallback
  }
  return `Starting the ride. Total distance ${route.distance}, estimated ${route.duration}. Shall we start a fun ride today?`;
};

/** 주행 종료 시 격려 멘트 (Gemini 1회 호출) */
export const getRideEncouragement = async (
  route: RouteInfo,
  stats?: { distance: string; duration: string }
): Promise<string> => {
  const apiKey = (process as { env?: { GOOGLE_GEMINI_API_KEY?: string } }).env
    ?.GOOGLE_GEMINI_API_KEY;
  const dist = stats?.distance ?? route.distance;
  const dur = stats?.duration ?? route.duration;
  if (!apiKey) {
    return `Ride finished. Distance covered ${dist}, duration ${dur}. Great job!`;
  }
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `You are a cycling coach. The rider just finished: "${route.origin}" to "${route.destination}". Distance covered: ${dist}, duration: ${dur}. Give one short (1 sentence) encouraging closing message in English. No bullet points.`;
    const res = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });
    const text = (res as { text?: string }).text?.trim();
    if (text) return text;
  } catch (_) {
    // fallback
  }
  return `Ride finished. Distance covered ${dist}, duration ${dur}. Great job!`;
};
