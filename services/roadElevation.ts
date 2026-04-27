/**
 * DEM 기반 elevation 샘플을 "도로 종단선형"에 가깝게 보정.
 * 코칭(R)과 elevation 차트가 동일한 route.elevation 을 쓰도록 단일 소스화한다.
 *
 * 2026-04-27 개정 (C안):
 *  - estimateRoadSlope 가 long(장구간 안정) / short(±60 m 짧은 윈도우) 두 채널을 반환.
 *  - aiCoach 가 두 값을 결합해 짧은 가파른 진입을 놓치지 않게 한다.
 *  - clampSlopeRateByDistance 시드를 첫 N 점 평균으로 보강.
 *  - bridgePatternAttenuation 게이트를 강화하고 감쇠 계수를 완화 (오인 시에도 R 추락 방지).
 */

import type { ElevationPoint } from '../types';
import { computeDistanceBetween } from './geoUtils';

export const ROAD_SMOOTH_WINDOW_M = 200;
export const ROAD_SMOOTH_WINDOW_MAX_M = 420;
export const ROAD_SLOPE_LOW_PASS_ALPHA = 0.25;
export const ROAD_SLOPE_DELTA_LIMIT_PER_50M = 1.0;
export const ROAD_SLOPE_DELTA_LIMIT_PER_M = ROAD_SLOPE_DELTA_LIMIT_PER_50M / 50;

/** 짧은 가파른 진입을 잡기 위한 보조(short) 채널의 반경. */
export const ROAD_SHORT_WINDOW_HALF_M = 60;

/** Bridge-pattern 감쇠 게이트: 일반 산복도로 오인을 줄이도록 보수적으로 강화. */
export const BRIDGE_PATTERN_DISTANCE_M = 1500;
export const BRIDGE_PATTERN_ENDPOINT_DIFF_M = 4;
export const BRIDGE_PATTERN_MID_DIP_M = 10;
/** 끝점-중앙 dip 외에 슬라이스 전체 변동(maxEl-minEl)이 dip 의 일정 비율 이상이면 교량으로 보지 않는다. */
export const BRIDGE_PATTERN_VARIATION_GUARD_RATIO = 1.3;
/** 교량으로 판단됐을 때의 감쇠 — 0.35 → 0.6 으로 완화. */
export const BRIDGE_PATTERN_ATTENUATION = 0.6;

/** 국소 교량/하천 trench 복원: DEM 이 강/하천 수면으로 꺼진 구간을 deck line 으로 끌어올린다. */
export const LOCAL_BRIDGE_MIN_WIDTH_M = 40;
export const LOCAL_BRIDGE_MAX_WIDTH_M = 2200;
export const LOCAL_BRIDGE_MAX_ENDPOINT_GRADE = 0.035;

type RoadSample = { elevation: number; cumulativeDistM: number };

function buildRoadSamples(points: ElevationPoint[]): RoadSample[] {
  if (points.length === 0) return [];
  const samples: RoadSample[] = [{ elevation: Number(points[0].elevation) || 0, cumulativeDistM: 0 }];
  let cumulativeDistM = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    let segmentM = 0;
    try {
      segmentM = computeDistanceBetween(prev.location, curr.location);
    } catch {
      segmentM = 0;
    }
    if (!Number.isFinite(segmentM) || segmentM < 0) segmentM = 0;
    cumulativeDistM += segmentM;
    samples.push({
      elevation: Number(curr.elevation) || 0,
      cumulativeDistM,
    });
  }
  return samples;
}

function averageElevationAround(samples: RoadSample[], centerIdx: number, windowM: number): number {
  const centerDist = samples[centerIdx].cumulativeDistM;
  const minDist = centerDist - windowM;
  const maxDist = centerDist + windowM;
  let sum = 0;
  let count = 0;
  for (const sample of samples) {
    if (sample.cumulativeDistM >= minDist && sample.cumulativeDistM <= maxDist) {
      sum += sample.elevation;
      count++;
    }
  }
  return count > 0 ? sum / count : samples[centerIdx].elevation;
}

function buildRoadLikeElevation(samples: RoadSample[], windowM: number): number[] {
  if (samples.length === 0) return [];
  const out = new Array<number>(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = averageElevationAround(samples, i, windowM);
  }
  return out;
}

function adaptiveWindowByDistance(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM <= ROAD_SMOOTH_WINDOW_M) return ROAD_SMOOTH_WINDOW_M;
  const t = Math.min(1, Math.max(0, (distanceM - ROAD_SMOOTH_WINDOW_M) / 1600));
  return ROAD_SMOOTH_WINDOW_M + (ROAD_SMOOTH_WINDOW_MAX_M - ROAD_SMOOTH_WINDOW_M) * t;
}

function computeWindowSlope(samples: RoadSample[], roadElev: number[], centerIdx: number, windowM: number): number {
  if (samples.length < 2) return 0;
  const centerDist = samples[centerIdx].cumulativeDistM;
  const startDist = centerDist - windowM;
  const endDist = centerDist + windowM;
  let startIdx = 0;
  while (startIdx < samples.length - 1 && samples[startIdx].cumulativeDistM < startDist) startIdx++;
  let endIdx = samples.length - 1;
  while (endIdx > 0 && samples[endIdx].cumulativeDistM > endDist) endIdx--;
  if (endIdx <= startIdx) {
    startIdx = Math.max(0, centerIdx - 1);
    endIdx = Math.min(samples.length - 1, centerIdx + 1);
  }
  const distM = Math.max(0, samples[endIdx].cumulativeDistM - samples[startIdx].cumulativeDistM);
  if (distM < 1e-6) return 0;
  const riseM = roadElev[endIdx] - roadElev[startIdx];
  return (riseM / distM) * 100;
}

function smoothSlopeBidirectional(rawSlope: number[], alpha: number): number[] {
  if (rawSlope.length === 0) return [];
  const forward = new Array<number>(rawSlope.length);
  forward[0] = rawSlope[0];
  for (let i = 1; i < rawSlope.length; i++) {
    forward[i] = alpha * rawSlope[i] + (1 - alpha) * forward[i - 1];
  }
  const backward = new Array<number>(rawSlope.length);
  backward[rawSlope.length - 1] = rawSlope[rawSlope.length - 1];
  for (let i = rawSlope.length - 2; i >= 0; i--) {
    backward[i] = alpha * rawSlope[i] + (1 - alpha) * backward[i + 1];
  }
  return rawSlope.map((_, i) => (forward[i] + backward[i]) / 2);
}

/**
 * 시작 시드를 첫 N 점 평균으로 잡아, slope[0] 이 우연히 낮게 잡힌 경우에도
 * 후속 클램프가 진입 구간을 너무 오래 잡아두지 않도록 한다.
 */
function clampSlopeRateByDistance(samples: RoadSample[], slope: number[], maxDeltaPerM: number, seedAvgN: number = 4): number[] {
  if (slope.length === 0) return [];
  const out = new Array<number>(slope.length);
  const seedCount = Math.max(1, Math.min(seedAvgN, slope.length));
  let seed = 0;
  for (let i = 0; i < seedCount; i++) seed += slope[i];
  seed = seed / seedCount;
  out[0] = seed;
  for (let i = 1; i < slope.length; i++) {
    const segM = Math.max(1, samples[i].cumulativeDistM - samples[i - 1].cumulativeDistM);
    const limit = maxDeltaPerM * segM;
    const delta = slope[i] - out[i - 1];
    if (delta > limit) out[i] = out[i - 1] + limit;
    else if (delta < -limit) out[i] = out[i - 1] - limit;
    else out[i] = slope[i];
  }
  return out;
}

/**
 * 슬라이스 안에서 코칭에 쓸 대표 경사 한 값.
 * - default: 20~80 % 트림 + tail 가중 (장구간 안정)
 * - shortContext: 트림 없이 단순 평균 (짧은 슬라이스에서 피크가 깎이는 것 방지)
 */
function robustRepresentativeSlope(slopeSeries: number[], shortContext: boolean = false): number {
  if (slopeSeries.length === 0) return 0;
  if (slopeSeries.length === 1) return slopeSeries[0];
  if (shortContext) {
    return slopeSeries.reduce((acc, v) => acc + v, 0) / slopeSeries.length;
  }
  const sorted = slopeSeries.slice().sort((a, b) => a - b);
  const lo = Math.floor(sorted.length * 0.2);
  const hi = Math.max(lo + 1, Math.ceil(sorted.length * 0.8));
  const core = sorted.slice(lo, hi);
  const mean = core.reduce((acc, v) => acc + v, 0) / core.length;
  const tailFocus = slopeSeries.slice(Math.max(0, slopeSeries.length - Math.max(3, Math.floor(slopeSeries.length * 0.25))));
  const tailMean = tailFocus.reduce((acc, v) => acc + v, 0) / tailFocus.length;
  return mean * 0.6 + tailMean * 0.4;
}

function bridgePatternAttenuation(samples: RoadSample[], roadLikeElevation: number[], slope: number): number {
  const totalDist = samples[samples.length - 1]?.cumulativeDistM ?? 0;
  if (totalDist < BRIDGE_PATTERN_DISTANCE_M) return slope;
  const startEl = roadLikeElevation[0] ?? 0;
  const endEl = roadLikeElevation[roadLikeElevation.length - 1] ?? 0;
  const endpointMean = (startEl + endEl) / 2;
  const endpointDiff = Math.abs(endEl - startEl);
  let minIdx = 0;
  let maxEl = roadLikeElevation[0] ?? 0;
  let minEl = roadLikeElevation[0] ?? 0;
  for (let i = 1; i < roadLikeElevation.length; i++) {
    if (roadLikeElevation[i] < roadLikeElevation[minIdx]) minIdx = i;
    if (roadLikeElevation[i] > maxEl) maxEl = roadLikeElevation[i];
    if (roadLikeElevation[i] < minEl) minEl = roadLikeElevation[i];
  }
  const dipMin = roadLikeElevation[minIdx] ?? endpointMean;
  const midDip = endpointMean - dipMin;
  const totalSpan = maxEl - minEl;
  const centerRatio = roadLikeElevation.length > 1 ? minIdx / (roadLikeElevation.length - 1) : 0.5;
  const valleyIsCentral = centerRatio >= 0.2 && centerRatio <= 0.8;
  // 추가 가드: 슬라이스 전체 변동이 midDip 의 1.3 배 이상이면 단순 dip 가 아닌 일반 굴곡으로 본다.
  const variationOk = totalSpan <= midDip * BRIDGE_PATTERN_VARIATION_GUARD_RATIO;
  const isBridgeLike =
    endpointDiff <= BRIDGE_PATTERN_ENDPOINT_DIFF_M &&
    midDip >= BRIDGE_PATTERN_MID_DIP_M &&
    valleyIsCentral &&
    variationOk;
  if (!isBridgeLike) return slope;
  return slope * BRIDGE_PATTERN_ATTENUATION;
}

/** 짧은 윈도우(±ROAD_SHORT_WINDOW_HALF_M) 에서의 단순 종단 경사. trim/rate-limit/감쇠 미적용. */
function computeShortSlope(samples: RoadSample[]): number {
  if (samples.length <= 1) return 0;
  const halfWindow = ROAD_SHORT_WINDOW_HALF_M;
  const roadLikeShort = buildRoadLikeElevation(samples, halfWindow);
  const slopes = samples.map((_, i) => computeWindowSlope(samples, roadLikeShort, i, halfWindow));
  return robustRepresentativeSlope(slopes, true);
}

/** upcoming slice 전체의 시작→끝 순경사. 지속 오르막/내리막 판정용 보조 채널. */
function computeTrendSlope(samples: RoadSample[]): { trendSlope: number; trendRiseM: number } {
  if (samples.length <= 1) return { trendSlope: 0, trendRiseM: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const distM = Math.max(0, last.cumulativeDistM - first.cumulativeDistM);
  if (distM < 1e-6) return { trendSlope: 0, trendRiseM: 0 };
  const trendRiseM = last.elevation - first.elevation;
  return { trendSlope: (trendRiseM / distM) * 100, trendRiseM };
}

type BridgeDeckCandidate = {
  left: number;
  right: number;
  maxBelowM: number;
  score: number;
};

function minBridgeDipByWidth(widthM: number): number {
  if (widthM < 300) return 4;
  if (widthM < 1200) return 6;
  return 8;
}

/**
 * DEM 이 도로교가 아니라 강/하천 횡단면을 따라 아래로 꺼지는 구간을 찾아
 * 양 끝 shoulder 를 잇는 deck line 아래의 값만 끌어올린다.
 *
 * - 좁은 하천(40m~), 중간 하천, 한강급 장교량(~2.2km)을 모두 후보로 본다.
 * - endpoint 간 기울기가 너무 큰 구간은 실제 도로 경사일 가능성이 있어 제외한다.
 * - 보정은 하방만 수행하므로 실제 산/오르막을 깎지 않는다.
 */
function reconstructLocalBridgeDecks(samples: RoadSample[], elevations: number[]): number[] {
  if (samples.length < 4) return elevations.slice();
  const candidates: BridgeDeckCandidate[] = [];

  for (let left = 0; left < samples.length - 2; left++) {
    for (let right = left + 2; right < samples.length; right++) {
      const widthM = samples[right].cumulativeDistM - samples[left].cumulativeDistM;
      if (widthM < LOCAL_BRIDGE_MIN_WIDTH_M) continue;
      if (widthM > LOCAL_BRIDGE_MAX_WIDTH_M) break;

      const endpointDiffM = Math.abs(elevations[right] - elevations[left]);
      const maxEndpointDiffM = Math.max(5, widthM * LOCAL_BRIDGE_MAX_ENDPOINT_GRADE);
      if (endpointDiffM > maxEndpointDiffM) continue;

      let maxBelowM = 0;
      let maxBelowIdx = -1;
      let materiallyBelowCount = 0;

      for (let i = left + 1; i < right; i++) {
        const t = (samples[i].cumulativeDistM - samples[left].cumulativeDistM) / widthM;
        const deck = elevations[left] + (elevations[right] - elevations[left]) * t;
        const below = deck - elevations[i];
        if (below > maxBelowM) {
          maxBelowM = below;
          maxBelowIdx = i;
        }
      }

      const minDipM = minBridgeDipByWidth(widthM);
      if (maxBelowM < minDipM || maxBelowIdx < 0) continue;

      const centerRatio =
        (samples[maxBelowIdx].cumulativeDistM - samples[left].cumulativeDistM) / widthM;
      if (centerRatio < 0.15 || centerRatio > 0.85) continue;

      const materialBelowThreshold = Math.max(2, maxBelowM * 0.35);
      for (let i = left + 1; i < right; i++) {
        const t = (samples[i].cumulativeDistM - samples[left].cumulativeDistM) / widthM;
        const deck = elevations[left] + (elevations[right] - elevations[left]) * t;
        if (deck - elevations[i] >= materialBelowThreshold) materiallyBelowCount++;
      }
      if (materiallyBelowCount < 1) continue;

      // 깊지만 과도하게 넓은 후보보다, 실제 trench 폭에 가까운 후보를 우선한다.
      const score = maxBelowM - minDipM - widthM * 0.001;
      candidates.push({ left, right, maxBelowM, score });
    }
  }

  if (candidates.length === 0) return elevations.slice();

  const out = elevations.slice();
  const occupied = new Array<boolean>(samples.length).fill(false);
  candidates.sort((a, b) => b.score - a.score || b.maxBelowM - a.maxBelowM);

  for (const c of candidates) {
    let overlap = 0;
    for (let i = c.left; i <= c.right; i++) {
      if (occupied[i]) overlap++;
    }
    const spanCount = c.right - c.left + 1;
    if (overlap / spanCount > 0.4) continue;

    const widthM = samples[c.right].cumulativeDistM - samples[c.left].cumulativeDistM;
    if (widthM <= 1e-6) continue;
    for (let i = c.left; i <= c.right; i++) {
      const t = (samples[i].cumulativeDistM - samples[c.left].cumulativeDistM) / widthM;
      const deck = elevations[c.left] + (elevations[c.right] - elevations[c.left]) * t;
      if (deck > out[i]) out[i] = deck;
      occupied[i] = true;
    }
  }

  return out;
}

export type EstimateRoadSlopeResult = {
  /** 결합용 대표 slope (장구간 채널). 기존 호환. */
  slope: number;
  /** 짧은 윈도우 기반 보조 slope. aiCoach 에서 결합 사용. */
  slopeShort: number;
  /** upcoming slice 전체의 시작→끝 순경사. 완만하지만 지속적인 오르막/R3 고착 방지용. */
  trendSlope: number;
  /** upcoming slice 시작→끝 순상승량(m). trendSlope 신뢰도 보조값. */
  trendRiseM: number;
  distanceM: number;
  elevationSpanM: number;
};

/** 코칭 슬라이스용: long/short 두 채널을 함께 반환. */
export function estimateRoadSlope(upcomingPoints: ElevationPoint[]): EstimateRoadSlopeResult {
  const samples = buildRoadSamples(upcomingPoints);
  if (samples.length <= 1) {
    return { slope: 0, slopeShort: 0, trendSlope: 0, trendRiseM: 0, distanceM: 0, elevationSpanM: 0 };
  }
  const distanceM = samples[samples.length - 1].cumulativeDistM;
  let minEl = Infinity;
  let maxEl = -Infinity;
  for (const p of upcomingPoints) {
    if (p.elevation < minEl) minEl = p.elevation;
    if (p.elevation > maxEl) maxEl = p.elevation;
  }
  const elevationSpanM = Number.isFinite(minEl) && Number.isFinite(maxEl) ? maxEl - minEl : 0;

  // ---- Long channel: 기존 robust 파이프라인 ----
  const adaptiveWindow = adaptiveWindowByDistance(distanceM);
  const halfWindow = adaptiveWindow / 2;
  const roadLikeElevation = buildRoadLikeElevation(samples, halfWindow);
  const rawSlope = samples.map((_, i) => computeWindowSlope(samples, roadLikeElevation, i, halfWindow));
  const slopeBidirectional = smoothSlopeBidirectional(rawSlope, ROAD_SLOPE_LOW_PASS_ALPHA);
  const slopeRoad = clampSlopeRateByDistance(samples, slopeBidirectional, ROAD_SLOPE_DELTA_LIMIT_PER_M);
  // 짧은 슬라이스(<600 m)는 트림이 피크를 절단할 위험이 커 단순 평균으로 본다.
  const isShortSlice = distanceM < 600;
  const representative = robustRepresentativeSlope(slopeRoad, isShortSlice);
  const bridgeAwareSlope = bridgePatternAttenuation(samples, roadLikeElevation, representative);

  // ---- Short channel: ±60 m, 가공 최소화 ----
  const slopeShort = computeShortSlope(samples);
  const { trendSlope, trendRiseM } = computeTrendSlope(samples);

  return { slope: bridgeAwareSlope, slopeShort, trendSlope, trendRiseM, distanceM, elevationSpanM };
}

/**
 * 전체 elevation 프로필을 도로에 가깝게 보정해 차트·코칭이 동일 데이터를 사용하게 한다.
 */
export function applyRoadElevationModel(points: ElevationPoint[]): ElevationPoint[] {
  if (points.length <= 1) return points;
  const samples = buildRoadSamples(points);
  const distanceM = samples[samples.length - 1].cumulativeDistM;
  const adaptiveWindow = adaptiveWindowByDistance(distanceM);
  const halfWindow = adaptiveWindow / 2;
  const roadLike = buildRoadLikeElevation(samples, halfWindow);

  const startEl = roadLike[0] ?? 0;
  const endEl = roadLike[roadLike.length - 1] ?? 0;
  const totalDist = distanceM;
  let minIdx = 0;
  let topEl = roadLike[0] ?? 0;
  let bottomEl = roadLike[0] ?? 0;
  for (let i = 1; i < roadLike.length; i++) {
    if (roadLike[i] < roadLike[minIdx]) minIdx = i;
    if (roadLike[i] > topEl) topEl = roadLike[i];
    if (roadLike[i] < bottomEl) bottomEl = roadLike[i];
  }
  const minEl = roadLike[minIdx] ?? startEl;
  const endpointMean = (startEl + endEl) / 2;
  const midDip = endpointMean - minEl;
  const totalSpan = topEl - bottomEl;
  const centerRatio = roadLike.length > 1 ? minIdx / (roadLike.length - 1) : 0.5;
  const valleyIsCentral = centerRatio >= 0.2 && centerRatio <= 0.8;
  const endpointDiff = Math.abs(endEl - startEl);
  const variationOk = totalSpan <= midDip * BRIDGE_PATTERN_VARIATION_GUARD_RATIO;
  const longBridgeLike =
    totalDist >= BRIDGE_PATTERN_DISTANCE_M &&
    endpointDiff <= BRIDGE_PATTERN_ENDPOINT_DIFF_M &&
    midDip >= BRIDGE_PATTERN_MID_DIP_M &&
    valleyIsCentral &&
    variationOk;

  const outElev = reconstructLocalBridgeDecks(samples, roadLike);
  if (longBridgeLike && totalDist > 1e-6) {
    for (let i = 0; i < outElev.length; i++) {
      const t = samples[i].cumulativeDistM / totalDist;
      const deck = startEl + (endEl - startEl) * t;
      const below = deck - outElev[i];
      if (below > 0) {
        const w = Math.min(1, below / Math.max(6, midDip * 0.35));
        outElev[i] = outElev[i] * (1 - w) + deck * w;
      }
    }
  }

  return points.map((p, i) => ({
    ...p,
    elevation: Number(outElev[i]) || 0,
  }));
}
