import { useEffect, useRef } from 'react';
import { CancelMapillaryError, Viewer } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';

type MapillaryRideViewerProps = {
  accessToken: string;
  imageId: string;
  /** true이면 공간 탐색을 360(spherical) 이미지로 제한 */
  sphericalNavigation?: boolean;
  className?: string;
};

/**
 * 주행 동기화용 Mapillary JS 뷰어 — iframe 대신 단일 Viewer에서 `moveTo`로 이미지 전환.
 */
export function MapillaryRideViewer({
  accessToken,
  imageId,
  sphericalNavigation = false,
  className,
}: MapillaryRideViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const lastImageIdRef = useRef<string | null>(null);
  const filterAppliedRef = useRef<boolean | null>(null);

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

    return () => {
      viewer.remove();
      viewerRef.current = null;
      // 재마운트(Strict Mode 등) 시 새 Viewer에서 moveTo가 다시 실행되도록
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
      if (lastImageIdRef.current === imageId && !filterChanged) return;
      lastImageIdRef.current = imageId;
      try {
        await viewer.moveTo(imageId);
      } catch (e) {
        if (e instanceof CancelMapillaryError) return;
        lastImageIdRef.current = null;
      }
    };

    void run();
  }, [imageId, sphericalNavigation]);

  return <div ref={containerRef} className={className ?? ''} />;
}
