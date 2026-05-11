import {
  computeDistanceBetween,
  computeHeading,
  type LatLngLike,
} from './geoUtils';

export type MapillaryStreetCandidate = {
  id: string;
  thumb1024Url?: string;
  lng: number;
  lat: number;
  compassAngle?: number;
  /** Graph API `sequence` — 같은 시퀀스 우선 시 연속성에 사용 */
  sequenceId?: string;
  isPano: boolean;
};

type GeoJsonPoint = { type?: string; coordinates?: [number, number] };

function pointFromGeometry(g: GeoJsonPoint | undefined): { lng: number; lat: number } | null {
  const c = g?.coordinates;
  if (!c || c.length < 2) return null;
  const lng = c[0];
  const lat = c[1];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

/** Graph `images` 검색 반경: 넓으면 옆 도로 후보가 섞임 — 10~50m 로 클램프 */
export function mapillaryStreetSearchRadiusM(speedKmH?: number | null): number {
  const v = speedKmH != null && Number.isFinite(speedKmH) ? speedKmH : 25;
  const r = v < 20 ? 16 : 28;
  return Math.min(50, Math.max(10, r));
}

/** 반경 검색(radius 최대 50m). 주행 위치 근처 Mapillary 이미지 후보. */
export async function fetchMapillaryStreetCandidates(
  accessToken: string,
  lat: number,
  lng: number,
  init?: { signal?: AbortSignal; radiusM?: number }
): Promise<MapillaryStreetCandidate[]> {
  const token = accessToken.trim();
  if (!token) return [];
  const fields = [
    'id',
    'thumb_1024_url',
    'geometry',
    'computed_geometry',
    'compass_angle',
    'computed_compass_angle',
    'sequence',
    'is_pano',
  ].join(',');
  const url = new URL('https://graph.mapillary.com/images');
  url.searchParams.set('access_token', token);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));
  const radius = Math.min(50, Math.max(10, Math.round(init?.radiusM ?? 22)));
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('limit', '12');
  url.searchParams.set('fields', fields);
  const res = await fetch(url.toString(), { signal: init?.signal, referrerPolicy: 'no-referrer' });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{
      id?: string | number;
      thumb_1024_url?: string;
      geometry?: GeoJsonPoint;
      computed_geometry?: GeoJsonPoint;
      compass_angle?: number;
      computed_compass_angle?: number;
      is_pano?: boolean;
    }>;
  };
  const rows = json.data ?? [];
  const out: MapillaryStreetCandidate[] = [];
  for (const row of rows) {
    const id = row.id != null ? String(row.id) : '';
    if (!id) continue;
    const pt = pointFromGeometry(row.computed_geometry) ?? pointFromGeometry(row.geometry);
    if (!pt) continue;
    const compassAngle =
      typeof row.computed_compass_angle === 'number' && Number.isFinite(row.computed_compass_angle)
        ? row.computed_compass_angle
        : typeof row.compass_angle === 'number' && Number.isFinite(row.compass_angle)
          ? row.compass_angle
          : undefined;
    let sequenceId: string | undefined;
    const seq = (row as { sequence?: unknown }).sequence;
    if (typeof seq === 'string' && seq.length) sequenceId = seq;
    else if (seq && typeof seq === 'object' && seq !== null && 'id' in seq) {
      const sid = (seq as { id?: unknown }).id;
      if (sid != null && String(sid).length) sequenceId = String(sid);
    }
    const thumb1024Url = typeof row.thumb_1024_url === 'string' ? row.thumb_1024_url : undefined;
    const isPano = row.is_pano === true;
    out.push({ id, lng: pt.lng, lat: pt.lat, compassAngle, thumb1024Url, sequenceId, isPano });
  }
  return out;
}

function smallestAngleDiffDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * 경로상 촘촘한 전방 샘플(m) — 커버리지가 빽빽할 때 멀리 있는 키프레임으로 튀는 것을 줄인다.
 * (기존 0,35,70… 대비 약 2배 밀도)
 */
export const MAPILLARY_STREET_LOOKAHEAD_SAMPLES_DENSE_M = [
  0, 10, 20, 30, 40, 50, 60, 72, 84, 96, 110, 125, 140, 158, 176, 195, 215, 235, 255, 275, 300,
] as const;

/**
 * 직전 촬영점과의 연속성을 고려하되, **경로상 가장 가까운 샘플 히트** 밖으로는 나가지 않는다.
 * (먼 샘플만 히트할 때 100~300m 점프 방지)
 * dismissedId 가 있으면 우선 제외하고, 후보가 없을 때만 무시한다.
 */
export function chooseMapillaryPickAlongPath(
  rows: Array<{ sampleM: number; pick: MapillaryStreetCandidate | null }>,
  options: {
    dismissedId: string | null;
    prevPick: { id: string; lat: number; lng: number; sequenceId?: string } | null;
    /** 이전 프레임과의 허용 최대 거리(m) — 초과 시 큰 패널티 */
    maxGpsJumpM: number;
    /** 라이더가 이전 촬영점에서 이 거리(m) 이상 떨어지면 연속성 가중을 끈다 */
    stalePrevRiderDistM?: number;
    /** 현재 라이더 위치 — stale 판정에 사용 */
    riderLatLng?: { lat: number; lng: number } | null;
  }
): MapillaryStreetCandidate | null {
  const withPick = rows.filter((r): r is { sampleM: number; pick: MapillaryStreetCandidate } => r.pick != null);
  if (!withPick.length) return null;

  const staleM = options.stalePrevRiderDistM ?? 72;
  let prevEffective: typeof options.prevPick = options.prevPick;
  const rider = options.riderLatLng;
  if (
    prevEffective &&
    rider &&
    Number.isFinite(rider.lat) &&
    Number.isFinite(rider.lng)
  ) {
    try {
      if (
        computeDistanceBetween(rider, { lat: prevEffective.lat, lng: prevEffective.lng }) > staleM
      ) {
        prevEffective = null;
      }
    } catch {
      prevEffective = null;
    }
  }

  const minSampleHit = Math.min(...withPick.map((r) => r.sampleM));
  /** minSampleHit ~ +이 값(m) 안에서만 후보 — 먼 전방 샘플만 있는 경우로의 도약 차단 */
  const ALONG_PATH_ENVELOPE_M = 48;
  const alongNarrow = withPick.filter((r) => r.sampleM <= minSampleHit + ALONG_PATH_ENVELOPE_M);
  const alongPool = alongNarrow.length ? alongNarrow : withPick;

  const notDismissed = alongPool.filter((r) => r.pick.id !== options.dismissedId);
  const pool = notDismissed.length ? notDismissed : alongPool;
  const sorted = [...pool].sort((a, b) => a.sampleM - b.sampleM);

  if (!prevEffective) {
    return sorted[0]!.pick;
  }

  const prev = prevEffective;
  const MAX = options.maxGpsJumpM;
  const RELAX = Math.min(125, MAX * 2.25);

  const prevSeq = prev.sequenceId;

  const score = (r: { sampleM: number; pick: MapillaryStreetCandidate }): number => {
    const p = r.pick;
    const sameId = p.id === prev.id;
    const sameSeq =
      !!prevSeq && !!p.sequenceId && p.sequenceId === prevSeq ? 1 : 0;
    let dPrev = 9999;
    try {
      dPrev = computeDistanceBetween({ lat: prev.lat, lng: prev.lng }, { lat: p.lat, lng: p.lng });
    } catch {
      /* keep dPrev */
    }
    let jumpPenalty = 0;
    if (!sameId) {
      if (dPrev <= MAX) jumpPenalty = dPrev * 0.22;
      else if (dPrev <= RELAX) jumpPenalty = MAX * 0.22 + (dPrev - MAX) * 1.65;
      else jumpPenalty = 4000 + dPrev;
    }
    return r.sampleM * 1.85 + jumpPenalty - (sameId ? 380 : 0) - sameSeq * 95;
  };

  return [...sorted].sort((a, b) => score(a) - score(b))[0]!.pick;
}

/** 촬영 방향(compass)이 진행 방향과 크게 어긋나면 옆 도로·역주행 프레임일 가능성이 큼 */
const MAX_HEADING_DIFF_DEG = 45;

export function pickMapillaryStreetCandidate(
  candidates: MapillaryStreetCandidate[],
  current: LatLngLike,
  driveHeadingDeg: number | null
): MapillaryStreetCandidate | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0]!;
  if (driveHeadingDeg == null || !Number.isFinite(driveHeadingDeg)) {
    return [...candidates].sort(
      (a, b) =>
        computeDistanceBetween(current, { lat: a.lat, lng: a.lng }) -
        computeDistanceBetween(current, { lat: b.lat, lng: b.lng })
    )[0]!;
  }

  const withCompass = candidates.filter((c) => c.compassAngle != null && Number.isFinite(c.compassAngle));
  const headingAligned = withCompass.filter(
    (c) => smallestAngleDiffDeg(driveHeadingDeg, c.compassAngle!) <= MAX_HEADING_DIFF_DEG
  );
  const pool = headingAligned.length ? headingAligned : withCompass.length ? withCompass : candidates;

  let best = pool[0]!;
  let bestScore = Infinity;
  for (const c of pool) {
    const d = computeDistanceBetween(current, { lat: c.lat, lng: c.lng });
    const bearingToImage = computeHeading(current, { lat: c.lat, lng: c.lng });
    const forwardAlign = smallestAngleDiffDeg(driveHeadingDeg, bearingToImage);
    const compass = c.compassAngle;
    const facingAlign =
      compass != null && Number.isFinite(compass) ? smallestAngleDiffDeg(driveHeadingDeg, compass) : 50;
    const score = d + forwardAlign * 0.45 + facingAlign * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function mapillaryEmbedUrl(imageKey: string, style: 'photo' | 'classic' = 'photo'): string {
  const u = new URL('https://www.mapillary.com/embed');
  u.searchParams.set('image_key', imageKey);
  u.searchParams.set('style', style);
  return u.toString();
}

function pathPointLatLng(p: unknown): { lat: number; lng: number } | null {
  if (p == null || typeof p !== 'object') return null;
  const o = p as { lat?: unknown; lng?: unknown };
  const lat = typeof o.lat === 'function' ? (o.lat as () => number)() : (o.lat as number);
  const lng = typeof o.lng === 'function' ? (o.lng as () => number)() : (o.lng as number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** 경로 `startIdx`에서 누적 `forwardMeters` 만큼 앞쪽 좌표(선분 보간). */
export function pathPointAhead(
  path: unknown[],
  startIdx: number,
  forwardMeters: number
): { lat: number; lng: number; pathIndex: number } | null {
  if (!path.length || forwardMeters < 0) return null;
  const si = Math.min(Math.max(0, Math.floor(startIdx)), path.length - 1);
  if (forwardMeters === 0) {
    const cur = pathPointLatLng(path[si]);
    if (!cur) return null;
    return { lat: cur.lat, lng: cur.lng, pathIndex: si };
  }
  let i = si;
  let remaining = forwardMeters;
  while (i < path.length - 1 && remaining > 0) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const ll1 = pathPointLatLng(p1);
    const ll2 = pathPointLatLng(p2);
    if (!ll1 || !ll2) {
      i += 1;
      continue;
    }
    let seg = 2;
    try {
      seg = computeDistanceBetween(p1 as LatLngLike, p2 as LatLngLike);
    } catch {
      seg = 2;
    }
    if (!Number.isFinite(seg) || seg <= 0) seg = 2;
    if (remaining <= seg) {
      const t = seg > 0 ? remaining / seg : 1;
      return {
        lat: ll1.lat + t * (ll2.lat - ll1.lat),
        lng: ll1.lng + t * (ll2.lng - ll1.lng),
        pathIndex: i,
      };
    }
    remaining -= seg;
    i += 1;
  }
  const last = pathPointLatLng(path[path.length - 1]);
  if (!last) return null;
  return { lat: last.lat, lng: last.lng, pathIndex: path.length - 1 };
}

export function driveHeadingAtPathIndex(path: unknown[], idx: number): number | null {
  const j = Math.min(path.length - 1, Math.max(0, idx) + 14);
  if (j <= idx) return null;
  const a = path[idx];
  const b = path[j];
  if (!a || !b) return null;
  try {
    return computeHeading(a as LatLngLike, b as LatLngLike);
  } catch {
    return null;
  }
}

/** 전방 샘플 거리(m) 각각에서 Mapillary 후보 조회 — 병렬. */
export async function queryMapillaryAlongPathSamples(
  accessToken: string,
  path: unknown[],
  startIdx: number,
  samplesM: number[],
  init?: { signal?: AbortSignal; speedKmH?: number | null }
): Promise<Array<{ sampleM: number; pick: MapillaryStreetCandidate | null }>> {
  const radiusM = mapillaryStreetSearchRadiusM(init?.speedKmH);
  const tasks = samplesM.map(async (sampleM) => {
    const pt = pathPointAhead(path, startIdx, sampleM);
    if (!pt) return { sampleM, pick: null as MapillaryStreetCandidate | null };
    const drive = driveHeadingAtPathIndex(path, pt.pathIndex);
    const candidates = await fetchMapillaryStreetCandidates(accessToken, pt.lat, pt.lng, {
      signal: init?.signal,
      radiusM,
    });
    const pick = pickMapillaryStreetCandidate(candidates, { lat: pt.lat, lng: pt.lng }, drive);
    return { sampleM, pick };
  });
  return Promise.all(tasks);
}
