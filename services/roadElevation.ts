/**
 * DEM 기반 elevation 샘플을 "도로 종단선형"에 가깝게 보정.
 * 코칭(R)과 elevation 차트가 동일한 route.elevation 을 쓰도록 단일 소스화한다.
 */

import type { ElevationPoint } from '../types';
import { computeDistanceBetween } from './geoUtils';

export const ROAD_SMOOTH_WINDOW_M = 200;
export const ROAD_SMOOTH_WINDOW_MAX_M = 420;
export const ROAD_SLOPE_LOW_PASS_ALPHA = 0.25;
export const ROAD_SLOPE_DELTA_LIMIT_PER_50M = 1.0;
export const ROAD_SLOPE_DELTA_LIMIT_PER_M = ROAD_SLOPE_DELTA_LIMIT_PER_50M / 50;
export const BRIDGE_PATTERN_DISTANCE_M = 1200;
export const BRIDGE_PATTERN_ENDPOINT_DIFF_M = 8;
export const BRIDGE_PATTERN_MID_DIP_M = 10;

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

function clampSlopeRateByDistance(samples: RoadSample[], slope: number[], maxDeltaPerM: number): number[] {
  if (slope.length === 0) return [];
  const out = new Array<number>(slope.length);
  out[0] = slope[0];
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

function robustRepresentativeSlope(slopeSeries: number[]): number {
  if (slopeSeries.length === 0) return 0;
  if (slopeSeries.length === 1) return slopeSeries[0];
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
  for (let i = 1; i < roadLikeElevation.length; i++) {
    if (roadLikeElevation[i] < roadLikeElevation[minIdx]) minIdx = i;
  }
  const minEl = roadLikeElevation[minIdx] ?? endpointMean;
  const midDip = endpointMean - minEl;
  const centerRatio = roadLikeElevation.length > 1 ? minIdx / (roadLikeElevation.length - 1) : 0.5;
  const valleyIsCentral = centerRatio >= 0.2 && centerRatio <= 0.8;
  const isBridgeLike =
    endpointDiff <= BRIDGE_PATTERN_ENDPOINT_DIFF_M &&
    midDip >= BRIDGE_PATTERN_MID_DIP_M &&
    valleyIsCentral;
  if (!isBridgeLike) return slope;
  return slope * 0.35;
}

/** 코칭 슬라이스용: 기존과 동일한 slope 추정 */
export function estimateRoadSlope(upcomingPoints: ElevationPoint[]): { slope: number; distanceM: number; elevationSpanM: number } {
  const samples = buildRoadSamples(upcomingPoints);
  if (samples.length <= 1) return { slope: 0, distanceM: 0, elevationSpanM: 0 };
  const distanceM = samples[samples.length - 1].cumulativeDistM;
  let minEl = Infinity;
  let maxEl = -Infinity;
  for (const p of upcomingPoints) {
    if (p.elevation < minEl) minEl = p.elevation;
    if (p.elevation > maxEl) maxEl = p.elevation;
  }
  const elevationSpanM = Number.isFinite(minEl) && Number.isFinite(maxEl) ? maxEl - minEl : 0;
  const adaptiveWindow = adaptiveWindowByDistance(distanceM);
  const halfWindow = adaptiveWindow / 2;
  const roadLikeElevation = buildRoadLikeElevation(samples, halfWindow);
  const rawSlope = samples.map((_, i) => computeWindowSlope(samples, roadLikeElevation, i, halfWindow));
  const slopeBidirectional = smoothSlopeBidirectional(rawSlope, ROAD_SLOPE_LOW_PASS_ALPHA);
  const slopeRoad = clampSlopeRateByDistance(samples, slopeBidirectional, ROAD_SLOPE_DELTA_LIMIT_PER_M);
  const representative = robustRepresentativeSlope(slopeRoad);
  const bridgeAwareSlope = bridgePatternAttenuation(samples, roadLikeElevation, representative);
  return { slope: bridgeAwareSlope, distanceM, elevationSpanM };
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
  for (let i = 1; i < roadLike.length; i++) {
    if (roadLike[i] < roadLike[minIdx]) minIdx = i;
  }
  const minEl = roadLike[minIdx] ?? startEl;
  const endpointMean = (startEl + endEl) / 2;
  const midDip = endpointMean - minEl;
  const centerRatio = roadLike.length > 1 ? minIdx / (roadLike.length - 1) : 0.5;
  const valleyIsCentral = centerRatio >= 0.2 && centerRatio <= 0.8;
  const endpointDiff = Math.abs(endEl - startEl);
  const longBridgeLike =
    totalDist >= BRIDGE_PATTERN_DISTANCE_M &&
    endpointDiff <= BRIDGE_PATTERN_ENDPOINT_DIFF_M &&
    midDip >= BRIDGE_PATTERN_MID_DIP_M &&
    valleyIsCentral;

  const outElev = roadLike.slice();
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
