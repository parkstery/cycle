import { computeDistanceBetween, computeHeading, computeOffset, type LatLngLike } from './geoUtils';

export type MapillaryStreetCandidate = {
  id: string;
  thumb1024Url?: string;
  lng: number;
  lat: number;
  compassAngle?: number;
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

/** 반경 검색(radius 최대 50m). 주행 위치 근처 Mapillary 이미지 후보. */
export async function fetchMapillaryStreetCandidates(
  accessToken: string,
  lat: number,
  lng: number,
  init?: { signal?: AbortSignal }
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
    'is_pano',
  ].join(',');
  const url = new URL('https://graph.mapillary.com/images');
  url.searchParams.set('access_token', token);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));
  url.searchParams.set('radius', '50');
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
    const thumb1024Url = typeof row.thumb_1024_url === 'string' ? row.thumb_1024_url : undefined;
    const isPano = row.is_pano === true;
    out.push({ id, lng: pt.lng, lat: pt.lat, compassAngle, thumb1024Url, isPano });
  }
  return out;
}

function smallestAngleDiffDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** 경로 진행 방향과 가깝고·현재 위치에 가까운 촬영 프레임 선택 */
/**
 * 경로상 촘촘한 전방 샘플(m) — 커버리지가 빽빽할 때 멀리 있는 키프레임으로 튀는 것을 줄인다.
 * (기존 0,35,70… 대비 약 2배 밀도)
 */
export const MAPILLARY_STREET_LOOKAHEAD_SAMPLES_DENSE_M = [
  0, 10, 20, 30, 40, 50, 60, 72, 84, 96, 110, 125, 140, 158, 176, 195, 215, 235, 255, 275, 300,
] as const;

/**
 * 직전에 표시한 촬영점과의 GPS 거리로 점프를 제한하면서, 전방 샘플 중 하나를 고른다.
 * dismissedId 가 있으면 우선 제외하고, 후보가 없을 때만 무시한다.
 */
export function chooseMapillaryPickAlongPath(
  rows: Array<{ sampleM: number; pick: MapillaryStreetCandidate | null }>,
  options: {
    dismissedId: string | null;
    prevPick: { id: string; lat: number; lng: number } | null;
    /** 이전 프레임과의 허용 최대 거리(m) — 초과 시 큰 패널티 */
    maxGpsJumpM: number;
  }
): MapillaryStreetCandidate | null {
  const withPick = rows.filter((r): r is { sampleM: number; pick: MapillaryStreetCandidate } => r.pick != null);
  if (!withPick.length) return null;

  const notDismissed = withPick.filter((r) => r.pick.id !== options.dismissedId);
  const pool = notDismissed.length ? notDismissed : withPick;
  const sorted = [...pool].sort((a, b) => a.sampleM - b.sampleM);

  if (!options.prevPick) {
    return sorted[0]!.pick;
  }

  const prev = options.prevPick;
  const MAX = options.maxGpsJumpM;
  const RELAX = Math.min(125, MAX * 2.25);

  const score = (r: { sampleM: number; pick: MapillaryStreetCandidate }): number => {
    const p = r.pick;
    const sameId = p.id === prev.id;
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
    return r.sampleM * 0.1 + jumpPenalty - (sameId ? 350 : 0);
  };

  return [...sorted].sort((a, b) => score(a) - score(b))[0]!.pick;
}

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
  let best = candidates[0]!;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = computeDistanceBetween(current, { lat: c.lat, lng: c.lng });
    const bearingToImage = computeHeading(current, { lat: c.lat, lng: c.lng });
    const forwardAlign = smallestAngleDiffDeg(driveHeadingDeg, bearingToImage);
    const compass = c.compassAngle;
    const facingAlign =
      compass != null && Number.isFinite(compass) ? smallestAngleDiffDeg(driveHeadingDeg, compass) : 50;
    const score = d + forwardAlign * 0.45 + facingAlign * 0.2;
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
      try {
        const heading = computeHeading(p1 as LatLngLike, p2 as LatLngLike);
        const off = computeOffset(p1 as LatLngLike, remaining, heading);
        return { lat: off.lat, lng: off.lng, pathIndex: i };
      } catch {
        return { lat: ll2.lat, lng: ll2.lng, pathIndex: i };
      }
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
  init?: { signal?: AbortSignal }
): Promise<Array<{ sampleM: number; pick: MapillaryStreetCandidate | null }>> {
  const tasks = samplesM.map(async (sampleM) => {
    const pt = pathPointAhead(path, startIdx, sampleM);
    if (!pt) return { sampleM, pick: null as MapillaryStreetCandidate | null };
    const drive = driveHeadingAtPathIndex(path, pt.pathIndex);
    const candidates = await fetchMapillaryStreetCandidates(accessToken, pt.lat, pt.lng, init);
    const pick = pickMapillaryStreetCandidate(candidates, { lat: pt.lat, lng: pt.lng }, drive);
    return { sampleM, pick };
  });
  return Promise.all(tasks);
}
