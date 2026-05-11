import { useEffect, useRef, useState } from 'react';
import { CancelMapillaryError, TransitionMode, Viewer } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';

type MapillaryRideViewerProps = {
  accessToken: string;
  imageId: string;
  /** true이면 공간 탐색을 360(spherical) 이미지로 제한 */
  sphericalNavigation?: boolean;
  /** 경로 전방 지점 — `project`→`setCenter`로 시야 미세 조정 */
  lookAt?: { lat: number; lng: number } | null;
  /** 주행 방위(도). 360에서는 먼저 방위 정렬 후 lookAt 투영 */
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

/** 360: 주행 방위로 먼저 맞춘 뒤 lookAt 투영으로 다듬음. 비파노: 투영 우선. */
async function alignViewToRide(
  viewer: Viewer,
  lookAt: { lat: number; lng: number } | null | undefined,
  driveHeadingDeg: number | null | undefined,
  sphericalForBearingFirst: boolean
): Promise<void> {
  const headingOk = driveHeadingDeg != null && Number.isFinite(driveHeadingDeg);
  const lookOk = lookAt && Number.isFinite(lookAt.lat) && Number.isFinite(lookAt.lng);

  await raf2();

  const applyBearingFromCenter = async (): Promise<void> => {
    if (!headingOk) return;
    try {
      const b = await viewer.getBearing();
      const cur = await viewer.getCenter();
      if (!cur || cur.length < 2) return;
      const delta = signedBearingDeltaDeg(b, driveHeadingDeg!);
      if (Math.abs(delta) <= 0.35) return;
      const y = Math.min(0.94, Math.max(0.06, cur[1]!));
      viewer.setCenter([wrap01(cur[0]! + delta / 360), y]);
    } catch {
      /* ignore */
    }
  };

  const applyProjectLookAt = async (): Promise<boolean> => {
    if (!lookOk) return false;
    try {
      const pixel = await viewer.project(lookAt!);
      if (!pixel || pixel.length < 2) return false;
      const basic = await viewer.unprojectToBasic(pixel);
      if (!basic || basic.length < 2 || !Number.isFinite(basic[0]) || !Number.isFinite(basic[1])) return false;
      viewer.setCenter([basic[0], basic[1]]);
      return true;
    } catch {
      return false;
    }
  };

  if (sphericalForBearingFirst && headingOk) {
    await applyBearingFromCenter();
    await raf2();
    await applyProjectLookAt();
    try {
      const b = await viewer.getBearing();
      const cur = await viewer.getCenter();
      if (cur && cur.length >= 2) {
        const delta = signedBearingDeltaDeg(b, driveHeadingDeg!);
        if (Math.abs(delta) > 2) {
          const y = Math.min(0.94, Math.max(0.06, cur[1]!));
          viewer.setCenter([wrap01(cur[0]! + delta / 360), y]);
        }
      }
    } catch {
      /* ignore */
    }
    return;
  }

  const projected = await applyProjectLookAt();
  if (!projected && headingOk) {
    await applyBearingFromCenter();
  }
}

type SyncPayload = {
  lookAt: { lat: number; lng: number } | null;
  driveHeadingDeg: number | null;
  sphericalNavigation: boolean;
};

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
        await alignViewToRide(viewer, s.lookAt, s.driveHeadingDeg, s.sphericalNavigation);
        setViewReady(true);
        return;
      }

      setViewReady(false);
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
        await raf2();
        await alignViewToRide(viewer, s.lookAt, s.driveHeadingDeg, s.sphericalNavigation);
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

    if (alignDebounceRef.current) clearTimeout(alignDebounceRef.current);
    alignDebounceRef.current = setTimeout(() => {
      alignDebounceRef.current = null;
      const s = syncRef.current;
      void alignViewToRide(viewer, s.lookAt, s.driveHeadingDeg, s.sphericalNavigation);
    }, 90);

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
        transition: 'opacity 120ms ease-out',
      }}
    />
  );
}
