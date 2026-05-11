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

/**
 * equirectangular basic Y 가 너무 위(하늘)·아래(발밑)로 치우치면 시야를 ‘지평선 근처’로 당김.
 * GPS project 만으로는 카메라 피치(위를 찍은 원본)를 복구할 수 없어, 완전한 도로 정면은 불가에 가깝다.
 */
const BASIC_Y_BAND_LO = 0.34;
const BASIC_Y_BAND_HI = 0.66;

function softenBasicYTowardHorizon(by: number): number {
  if (!Number.isFinite(by)) return 0.5;
  if (by < BASIC_Y_BAND_LO) return by + (BASIC_Y_BAND_LO - by) * 0.62;
  if (by > BASIC_Y_BAND_HI) return by - (by - BASIC_Y_BAND_HI) * 0.62;
  return by;
}

async function raf2(): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/** `full`: 이동 직후. `bearingDrift`: 같은 파노에서도 전방 project 우선, 실패 시에만 베어링 UV 보정(흔들림 최소화) */
type AlignMode = 'full' | 'bearingDrift';

/** 매 렌더마다 raw 주행 방위를 이 비율만큼 목표 쪽으로 당김(저역 통과) */
const HEADING_SMOOTH_ALPHA = 0.14;

/** 한 번의 호출에서 setCenter 는 최대 1회 — 가능하면 project 한 번으로 끝내 bearing UV 스냅을 줄임 */
async function alignViewToRide(
  viewer: Viewer,
  lookAt: { lat: number; lng: number } | null | undefined,
  bearingTargetDeg: number | null | undefined,
  sphericalNavigation: boolean,
  mode: AlignMode
): Promise<void> {
  const headingOk = bearingTargetDeg != null && Number.isFinite(bearingTargetDeg);
  const lookOk = lookAt && Number.isFinite(lookAt.lat) && Number.isFinite(lookAt.lng);
  const drift = mode === 'bearingDrift';

  await raf2();

  const tryProject = async (): Promise<boolean> => {
    if (!lookOk) return false;
    try {
      const pixel = await viewer.project(lookAt!);
      if (!pixel || pixel.length < 2) return false;
      const basic = await viewer.unprojectToBasic(pixel);
      if (!basic || basic.length < 2 || !Number.isFinite(basic[0]) || !Number.isFinite(basic[1])) return false;
      viewer.setCenter([basic[0], softenBasicYTowardHorizon(basic[1]!)]);
      return true;
    } catch {
      return false;
    }
  };

  /** drift·full 공통: 공간 목표(전방점) 우선 — 숫자 회전 보정은 폴백으로만 */
  if (await tryProject()) return;

  if (sphericalNavigation && headingOk) {
    try {
      const b = await viewer.getBearing();
      const cur = await viewer.getCenter();
      if (!cur || cur.length < 2) return;
      const delta = signedBearingDeltaDeg(b, bearingTargetDeg!);
      /** drift에서는 잦은 setCenter 방지, full에서는 초기 정렬만 빠르게 */
      const minDeg = drift ? 16 : 6;
      if (Math.abs(delta) < minDeg) return;
      const y = Math.min(0.88, Math.max(0.12, softenBasicYTowardHorizon(cur[1]!)));
      viewer.setCenter([wrap01(cur[0]! + delta / 360), y]);
    } catch {
      /* ignore */
    }
  }
}

type SyncPayload = {
  lookAt: { lat: number; lng: number } | null;
  /** 저역 통과된 방위 — 정렬·스냅샷 비교에만 사용 */
  bearingTargetDeg: number | null;
  sphericalNavigation: boolean;
};

/** 같은 파노 안 재정렬: 덜 자주·덜 민감하게(setCenter·내부 easing 충돌 완화) */
const REALIGN_MIN_MOVE_M = 18;
const REALIGN_MIN_HEADING_DEG = 14;
const REALIGN_MAX_INTERVAL_MS = 5200;
const REALIGN_DEBOUNCE_MS = 820;

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
  const smoothedBearingRef = useRef<number | null>(null);
  const smoothImageIdRef = useRef<string | null>(null);

  if (smoothImageIdRef.current !== imageId) {
    smoothImageIdRef.current = imageId;
    smoothedBearingRef.current = null;
  }

  const rawHeading = driveHeadingDeg != null && Number.isFinite(driveHeadingDeg) ? driveHeadingDeg : null;
  let bearingTargetDeg: number | null = null;
  if (rawHeading != null) {
    const prev = smoothedBearingRef.current;
    bearingTargetDeg =
      prev == null ? rawHeading : prev + signedBearingDeltaDeg(prev, rawHeading) * HEADING_SMOOTH_ALPHA;
    smoothedBearingRef.current = bearingTargetDeg;
  } else {
    smoothedBearingRef.current = null;
  }

  const syncRef = useRef<SyncPayload>({
    lookAt: null,
    bearingTargetDeg: null,
    sphericalNavigation: false,
  });
  syncRef.current = {
    lookAt: lookAt ?? null,
    bearingTargetDeg,
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
      /**
       * Default 는 전환마다 데이터에 따라 모션/블렌드를 바꿔 “옆에서 날아옴” 등 느낌이 들쭉날쭉함.
       * 주행 거리뷰는 Instantaneous 로 통일(스틸컷, 모션·블렌드 없음) — API 상 선택지는 이 둘뿐.
       */
      transitionMode: TransitionMode.Instantaneous,
      component: {
        cover: false,
        /** 도로 위 전방 이동 화살표(쉐브론) */
        direction: false,
        /** 상단 재생·prev·next 시퀀스 컨트롤 */
        sequence: { visible: false },
      },
    });
    viewerRef.current = viewer;
    lastImageIdRef.current = null;
    filterAppliedRef.current = null;
    lastRealignSnapshotRef.current = null;
    smoothedBearingRef.current = null;
    smoothImageIdRef.current = null;
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
      smoothedBearingRef.current = null;
      smoothImageIdRef.current = null;
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
      /** 같은 파노에서의 시야 보정은 lookAt 이펙트의 디바운스 한 경로로만 처리 — 여기서 즉시 setCenter 하면 이중 보정·툭툭 유발 */
      if (lastImageIdRef.current === imageId && !filterChanged) {
        setViewReady(true);
        return;
      }

      /** 첫 이미지 로드에서만 페이드인 — 이미지 간 전환은 Instantaneous(스틸컷) */
      const isFirstImageThisSession = lastImageIdRef.current == null;
      if (isFirstImageThisSession) {
        setViewReady(false);
      }
      lastRealignSnapshotRef.current = null;

      try {
        try {
          viewer.setTransitionMode(TransitionMode.Instantaneous);
        } catch {
          /* ignore */
        }
        await viewer.moveTo(imageId);
        try {
          viewer.setTransitionMode(TransitionMode.Instantaneous);
        } catch {
          /* ignore */
        }
        lastImageIdRef.current = imageId;
        const s = syncRef.current;
        await alignViewToRide(viewer, s.lookAt, s.bearingTargetDeg, s.sphericalNavigation, 'full');
        const s2 = syncRef.current;
        if (s2.lookAt && s2.bearingTargetDeg != null && Number.isFinite(s2.bearingTargetDeg)) {
          lastRealignSnapshotRef.current = {
            lat: s2.lookAt.lat,
            lng: s2.lookAt.lng,
            heading: s2.bearingTargetDeg,
            atMs: Date.now(),
          };
        }
      } catch (e) {
        if (e instanceof CancelMapillaryError) return;
        lastImageIdRef.current = null;
        setViewReady(false);
        return;
      }
      setViewReady(true);
    };

    void run();
  }, [imageId, sphericalNavigation]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !imageId || lastImageIdRef.current !== imageId) return;

    const s = syncRef.current;
    if (!s.lookAt || s.bearingTargetDeg == null || !Number.isFinite(s.bearingTargetDeg)) return;

    const snap = lastRealignSnapshotRef.current;
    if (snap) {
      const dMoved = computeDistanceBetween({ lat: snap.lat, lng: snap.lng }, s.lookAt);
      const hDiff = Math.abs(signedBearingDeltaDeg(snap.heading, s.bearingTargetDeg));
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
        if (!s2.lookAt || s2.bearingTargetDeg == null || !Number.isFinite(s2.bearingTargetDeg)) return;
        const sn = lastRealignSnapshotRef.current;
        if (sn) {
          const dMoved = computeDistanceBetween({ lat: sn.lat, lng: sn.lng }, s2.lookAt);
          const hDiff = Math.abs(signedBearingDeltaDeg(sn.heading, s2.bearingTargetDeg));
          const aged = Date.now() - sn.atMs > REALIGN_MAX_INTERVAL_MS;
          if (dMoved < REALIGN_MIN_MOVE_M && hDiff < REALIGN_MIN_HEADING_DEG && !aged) return;
        }
        await alignViewToRide(v, s2.lookAt, s2.bearingTargetDeg, s2.sphericalNavigation, 'bearingDrift');
        lastRealignSnapshotRef.current = {
          lat: s2.lookAt.lat,
          lng: s2.lookAt.lng,
          heading: s2.bearingTargetDeg,
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
        /** 이미지 스틸컷과 맞추기 — 패널 페이드가 전환 잔상처럼 느껴지지 않게 */
        transition: 'none',
      }}
    />
  );
}
