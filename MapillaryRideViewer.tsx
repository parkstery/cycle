import { useEffect, useRef, useState } from 'react';
import { CancelMapillaryError, TransitionMode, Viewer } from 'mapillary-js';
import { computeDistanceBetween } from './services/geoUtils';
import 'mapillary-js/dist/mapillary.css';

type MapillaryRideViewerProps = {
  accessToken: string;
  imageId: string;
  /** true이면 공간 탐색을 360(spherical) 이미지로 제한 */
  sphericalNavigation?: boolean;
  /** 경로 전방 지점 — `project`→`setCenter`로 시야 정렬(가능할 때만 1회) */
  lookAt?: { lat: number; lng: number } | null;
  /** 주행 방위(도). 전방 투영 실패 시 360에서만 큰 편차일 때 보정 */
  driveHeadingDeg?: number | null;
  className?: string;
};

function wrap01(x: number): number {
  return ((x % 1) + 1) % 1;
}

function signedBearingDeltaDeg(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

async function raf2(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/** 한 번의 호출에서 setCenter 는 최대 1회 — 미세 lookAt 변화로 인한 떨림 방지 */
async function alignViewToRide(
  viewer: Viewer,
  lookAt: { lat: number; lng: number } | null | undefined,
  driveHeadingDeg: number | null | undefined,
  sphericalNavigation: boolean
): Promise<void> {
  const headingOk = driveHeadingDeg != null && Number.isFinite(driveHeadingDeg);
  const lookOk = lookAt && Number.isFinite(lookAt.lat) && Number.isFinite(lookAt.lng);

  await raf2();

  if (lookOk) {
    try {
      const pixel = await viewer.project(lookAt!);
      if (pixel && pixel.length >= 2) {
        const basic = await viewer.unprojectToBasic(pixel);
        if (basic && basic.length >= 2 && Number.isFinite(basic[0]) && Number.isFinite(basic[1])) {
          viewer.setCenter([basic[0], basic[1]]);
          return;
        }
      }
    } catch {
      /* fall through */
    }
  }

  if (sphericalNavigation && headingOk) {
    try {
      const b = await viewer.getBearing();
      const cur = await viewer.getCenter();
      if (!cur || cur.length < 2) return;
      const delta = signedBearingDeltaDeg(b, driveHeadingDeg!);
      if (Math.abs(delta) < 5) return;
      const y = Math.min(0.94, Math.max(0.06, cur[1]!));
      viewer.setCenter([wrap01(cur[0]! + delta / 360), y]);
    } catch {
      /* ignore */
    }
  }
}

type SyncPayload = {
  lookAt: { lat: number; lng: number } | null;
  driveHeadingDeg: number | null;
  sphericalNavigation: boolean;
};

/** 주행 중 재정렬: lookAt 이동(m)·방위 변화(°) 또는 시간이 충분히 지난 경우에만 */
const REALIGN_MIN_MOVE_M = 7;
const REALIGN_MIN_HEADING_DEG = 6;
const REALIGN_MAX_INTERVAL_MS = 3200;
const REALIGN_DEBOUNCE_MS = 420;

/**
 * 주행 동기화용 Mapillary JS 뷰어 — iframe 대신 단일 Viewer에서 `moveTo`로 이미지 전환.
 */
export function MapillaryRideViewer({
  accessToken,
  imageId,
  sphericalNavigation = false,
  lookAt = null,
  driveHeadingDeg = null,
  className,
}: MapillaryRideViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const lastImageIdRef = useRef<string | null>(null);
  const filterAppliedRef = useRef<boolean | null>(null);
  const alignDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRealignSnapshotRef = useRef<{
    lat: number;
    lng: number;
    heading: number;
    atMs: number;
  } | null>(null);
  const syncRef = useRef<SyncPayload>({
    lookAt: null,
    driveHeadingDeg: null,
    sphericalNavigation: false,
  });
  syncRef.current = {
    lookAt: lookAt ?? null,
    driveHeadingDeg: driveHeadingDeg ?? null,
    sphericalNavigation: sphericalNavigation === true,
  };

  const [viewReady, setViewReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    const token = accessToken.trim();
    if (!el || !token) return;

    const viewer = new Viewer({
      accessToken: token,
      container: el,
      component: { cover: false },
    });
    viewerRef.current = viewer;
    lastImageIdRef.current = null;
    filterAppliedRef.current = null;
    lastRealignSnapshotRef.current = null;
    setViewReady(false);

    return () => {
      if (alignDebounceRef.current) {
        clearTimeout(alignDebounceRef.current);
        alignDebounceRef.current = null;
      }
      viewer.remove();
      viewerRef.current = null;
      lastImageIdRef.current = null;
      filterAppliedRef.current = null;
      lastRealignSnapshotRef.current = null;
    };
  }, [accessToken]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !imageId) return;

    const applyFilter = async (): Promise<boolean> => {
      const want = sphericalNavigation === true;
      if (filterAppliedRef.current === want) return false;
      filterAppliedRef.current = want;
      try {
        if (want) await viewer.setFilter(['==', 'cameraType', 'spherical']);
        else await viewer.setFilter([]);
      } catch {
        /* 필터 실패 시에도 moveTo 시도 */
      }
      return true;
    };

    const run = async () => {
      const filterChanged = await applyFilter();
      if (lastImageIdRef.current === imageId && !filterChanged) {
        const s = syncRef.current;
        const snap = lastRealignSnapshotRef.current;
        if (s.lookAt && s.driveHeadingDeg != null && Number.isFinite(s.driveHeadingDeg)) {
          if (snap) {
            const d = computeDistanceBetween({ lat: snap.lat, lng: snap.lng }, s.lookAt);
            const hDiff = Math.abs(signedBearingDeltaDeg(snap.heading, s.driveHeadingDeg));
            const aged = Date.now() - snap.atMs > REALIGN_MAX_INTERVAL_MS;
            if (d < REALIGN_MIN_MOVE_M && hDiff < REALIGN_MIN_HEADING_DEG && !aged) {
              setViewReady(true);
              return;
            }
          }
        }
        await alignViewToRide(viewer, s.lookAt, s.driveHeadingDeg, s.sphericalNavigation);
        const s2 = syncRef.current;
        if (s2.lookAt && s2.driveHeadingDeg != null && Number.isFinite(s2.driveHeadingDeg)) {
          lastRealignSnapshotRef.current = {
            lat: s2.lookAt.lat,
            lng: s2.lookAt.lng,
            heading: s2.driveHeadingDeg,
            atMs: Date.now(),
          };
        }
        setViewReady(true);
        return;
      }

      setViewReady(false);
      lastRealignSnapshotRef.current = null;
      try {
        viewer.setTransitionMode(TransitionMode.Instantaneous);
      } catch {
        /* ignore */
      }

      try {
        await viewer.moveTo(imageId);
        lastImageIdRef.current = imageId;
        const s = syncRef.current;
        await alignViewToRide(viewer, s.lookAt, s.driveHeadingDeg, s.sphericalNavigation);
        const s2 = syncRef.current;
        if (s2.lookAt && s2.driveHeadingDeg != null && Number.isFinite(s2.driveHeadingDeg)) {
          lastRealignSnapshotRef.current = {
            lat: s2.lookAt.lat,
            lng: s2.lookAt.lng,
            heading: s2.driveHeadingDeg,
            atMs: Date.now(),
          };
        }
      } catch (e) {
        if (e instanceof CancelMapillaryError) return;
        lastImageIdRef.current = null;
        setViewReady(false);
        return;
      } finally {
        try {
          viewer.setTransitionMode(TransitionMode.Default);
        } catch {
          /* ignore */
        }
      }
      setViewReady(true);
    };

    void run();
  }, [imageId, sphericalNavigation]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !imageId || lastImageIdRef.current !== imageId) return;

    const s = syncRef.current;
    if (!s.lookAt || s.driveHeadingDeg == null || !Number.isFinite(s.driveHeadingDeg)) return;

    const snap = lastRealignSnapshotRef.current;
    if (snap) {
      const dMoved = computeDistanceBetween({ lat: snap.lat, lng: snap.lng }, s.lookAt);
      const hDiff = Math.abs(signedBearingDeltaDeg(snap.heading, s.driveHeadingDeg));
      const aged = Date.now() - snap.atMs > REALIGN_MAX_INTERVAL_MS;
      if (dMoved < REALIGN_MIN_MOVE_M && hDiff < REALIGN_MIN_HEADING_DEG && !aged) {
        return;
      }
    }

    if (alignDebounceRef.current) clearTimeout(alignDebounceRef.current);
    alignDebounceRef.current = setTimeout(() => {
      alignDebounceRef.current = null;
      void (async () => {
        const v = viewerRef.current;
        if (!v || lastImageIdRef.current !== imageId) return;
        const s2 = syncRef.current;
        if (!s2.lookAt || s2.driveHeadingDeg == null || !Number.isFinite(s2.driveHeadingDeg)) return;
        const sn = lastRealignSnapshotRef.current;
        if (sn) {
          const dMoved = computeDistanceBetween({ lat: sn.lat, lng: sn.lng }, s2.lookAt);
          const hDiff = Math.abs(signedBearingDeltaDeg(sn.heading, s2.driveHeadingDeg));
          const aged = Date.now() - sn.atMs > REALIGN_MAX_INTERVAL_MS;
          if (dMoved < REALIGN_MIN_MOVE_M && hDiff < REALIGN_MIN_HEADING_DEG && !aged) return;
        }
        await alignViewToRide(v, s2.lookAt, s2.driveHeadingDeg, s2.sphericalNavigation);
        lastRealignSnapshotRef.current = {
          lat: s2.lookAt.lat,
          lng: s2.lookAt.lng,
          heading: s2.driveHeadingDeg,
          atMs: Date.now(),
        };
      })();
    }, REALIGN_DEBOUNCE_MS);

    return () => {
      if (alignDebounceRef.current) {
        clearTimeout(alignDebounceRef.current);
        alignDebounceRef.current = null;
      }
    };
  }, [imageId, lookAt?.lat, lookAt?.lng, driveHeadingDeg, sphericalNavigation]);

  return (
    <div
      ref={containerRef}
      className={className ?? ''}
      style={{
        opacity: viewReady ? 1 : 0,
        transition: 'opacity 80ms ease-out',
      }}
    />
  );
}
