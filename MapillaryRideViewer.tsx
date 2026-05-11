import React, { useEffect, useRef } from 'react';
import 'mapillary-js/dist/mapillary.css';
import { NavigationDirection, Viewer, type SequenceComponent } from 'mapillary-js';

type Props = {
  accessToken: string;
  imageId: string;
};

/**
 * MapillaryJS 뷰어: 임베드 iframe 대신 WebGL 뷰어로 시퀀스 자동 재생(play).
 */
const MapillaryRideViewer: React.FC<Props> = ({ accessToken, imageId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !accessToken.trim()) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    const viewer = new Viewer({
      accessToken: accessToken.trim(),
      container: el,
      component: {
        cover: false,
        sequence: {
          direction: NavigationDirection.Next,
          visible: true,
        },
      },
      trackResize: true,
    });
    viewerRef.current = viewer;
    return () => {
      try {
        viewer.remove();
      } catch {
        /* dispose */
      }
      viewerRef.current = null;
    };
  }, [accessToken]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !imageId) return;
    let cancelled = false;
    const seq = () => viewer.getComponent('sequence') as SequenceComponent;
    try {
      seq().stop?.();
    } catch {
      /* */
    }
    void viewer
      .moveTo(imageId)
      .then(() => {
        if (cancelled) return;
        try {
          seq().play();
        } catch {
          /* */
        }
      })
      .catch(() => {
        /* IO / navigable */
      });
    return () => {
      cancelled = true;
      try {
        seq().stop?.();
      } catch {
        /* */
      }
    };
  }, [imageId]);

  return <div ref={containerRef} className="absolute inset-0 h-full min-h-[140px] w-full bg-black" />;
};

export default MapillaryRideViewer;
