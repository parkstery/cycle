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

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_RETRIES_429 = 2;

/** 429 응답에서 retryDelay(예: "39s") 파싱 후 ms 반환. 없으면 40_000 */
function parseRetryDelayMs(body: string): number {
  try {
    const m = body.match(/"retryDelay"\s*:\s*"(\d+)s"/);
    if (m) return Math.min(Number(m[1]) * 1000, 120_000);
  } catch (_) {}
  return 40_000; // 기본 40초 대기
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Gemini generateContent REST 호출. 429 시 retryDelay 후 재시도(최대 MAX_RETRIES_429회) */
async function callGeminiWithRetry(apiKey: string, prompt: string): Promise<string> {
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 256, temperature: 0.7 },
  });
  let lastBody = "";
  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    lastBody = await res.text();
    if (res.status === 429 && attempt < MAX_RETRIES_429) {
      const delayMs = parseRetryDelayMs(lastBody);
      await sleep(delayMs);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Gemini API ${res.status}: ${lastBody.slice(0, 200)}`);
    }
    const data = JSON.parse(lastBody) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text ?? "";
  }
  throw new Error(`Gemini API 429 after ${MAX_RETRIES_429} retries: ${lastBody.slice(0, 200)}`);
}

/** 주행 시작 시 코스 전반 안내. API 키 있으면 Gemini 호출(429 재시도), 없으면 고정 문구 */
export const getCourseBriefing = async (route: RouteInfo): Promise<string> => {
  const apiKey = (typeof process !== "undefined" && process.env?.GOOGLE_GEMINI_API_KEY) || "";
  const fallback = `The ride distance is ${route.distance}. Have a great ride!`;
  if (!apiKey) return fallback;
  try {
    const text = await callGeminiWithRetry(
      apiKey,
      `Brief the cyclist in one short sentence. Ride distance: ${route.distance}. Be encouraging. English only.`
    );
    return text || fallback;
  } catch (_) {
    return fallback;
  }
};

/** 주행 종료 시 격려 멘트. API 키 있으면 Gemini 호출(429 재시도), 없으면 고정 문구 */
export const getRideEncouragement = async (
  route: RouteInfo,
  stats?: { distance: string; duration: string }
): Promise<string> => {
  const apiKey = (typeof process !== "undefined" && process.env?.GOOGLE_GEMINI_API_KEY) || "";
  const dist = stats?.distance ?? route.distance;
  const dur = stats?.duration ?? "";
  const fallback = `You covered ${dist}. Great job!`;
  if (!apiKey) return fallback;
  try {
    const text = await callGeminiWithRetry(
      apiKey,
      `Congratulate the cyclist in one short sentence. Distance: ${dist}${dur ? `, Duration: ${dur}` : ""}. English only.`
    );
    return text || fallback;
  } catch (_) {
    return fallback;
  }
};
