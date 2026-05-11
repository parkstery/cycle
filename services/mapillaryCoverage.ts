import type { Map } from 'mapbox-gl';
import { ROUTE_LAYER } from './mapboxRouteLayer';

export const MAPILLARY_VECTOR_SOURCE_ID = 'mapillary-coverage-vtp';
export const MAPILLARY_PANO_VECTOR_SOURCE_ID = 'mapillary-pano-coverage-vtp';
export const MAPILLARY_SEQUENCE_LAYER_ID = 'mapillary-sequence-lines';
export const MAPILLARY_PANO_SEQUENCE_LAYER_ID = 'mapillary-pano-sequence-lines';

/** Mapillary API v4 public coverage MVT — `sequence` = 촬영 경로 라인 */
export function ensureMapillaryCoverageLayer(map: Map, accessToken: string): void {
  const token = accessToken.trim();
  if (!token) return;

  if (!map.getSource(MAPILLARY_VECTOR_SOURCE_ID)) {
    map.addSource(MAPILLARY_VECTOR_SOURCE_ID, {
      type: 'vector',
      tiles: [
        `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`,
      ],
      minzoom: 6,
      maxzoom: 14,
    });
  }

  if (!map.getSource(MAPILLARY_PANO_VECTOR_SOURCE_ID)) {
    map.addSource(MAPILLARY_PANO_VECTOR_SOURCE_ID, {
      type: 'vector',
      tiles: [
        `https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}&is_pano=true`,
      ],
      minzoom: 6,
      maxzoom: 14,
    });
  }

  if (!map.getLayer(MAPILLARY_SEQUENCE_LAYER_ID)) {
    const beforeId = map.getLayer(ROUTE_LAYER) ? ROUTE_LAYER : undefined;
    map.addLayer(
      {
        id: MAPILLARY_SEQUENCE_LAYER_ID,
        type: 'line',
        source: MAPILLARY_VECTOR_SOURCE_ID,
        'source-layer': 'sequence',
        layout: {
          visibility: 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          // OSRM/Mapbox 도로(시안) 위에서도 구분되게 — Mapillary 전용 색
          'line-color': '#f97316',
          'line-opacity': 0.92,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 5, 16, 7],
        },
      },
      beforeId
    );
  }

  if (!map.getLayer(MAPILLARY_PANO_SEQUENCE_LAYER_ID)) {
    const beforeId = map.getLayer(ROUTE_LAYER) ? ROUTE_LAYER : undefined;
    map.addLayer(
      {
        id: MAPILLARY_PANO_SEQUENCE_LAYER_ID,
        type: 'line',
        source: MAPILLARY_PANO_VECTOR_SOURCE_ID,
        'source-layer': 'sequence',
        layout: {
          visibility: 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          // 360도 파노라마 구간은 전체 커버리지 위에 더 밝고 굵게 중첩한다.
          'line-color': '#22d3ee',
          'line-opacity': 0.96,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.4, 14, 7, 16, 10],
        },
      },
      beforeId
    );
  }
}

/** Mapillary(위성 스트리트뷰) 커버리지를 OSRM routable(시안) 오버레이 아래에 둔다 — 커버리지 “레벨”이 OSRM보다 높지 않게 유지 */
export function stackMapillaryBelowRoutableRoads(map: Map, routableLayerId: string): void {
  if (!map.getLayer(MAPILLARY_SEQUENCE_LAYER_ID)) return;
  if (!routableLayerId || !map.getLayer(routableLayerId)) return;
  try {
    map.moveLayer(MAPILLARY_SEQUENCE_LAYER_ID, routableLayerId);
    if (map.getLayer(MAPILLARY_PANO_SEQUENCE_LAYER_ID)) {
      map.moveLayer(MAPILLARY_PANO_SEQUENCE_LAYER_ID, routableLayerId);
    }
  } catch {
    /* 순서 불가 */
  }
}

export function setMapillaryCoverageVisibility(map: Map, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none';
  if (map.getLayer(MAPILLARY_SEQUENCE_LAYER_ID)) {
    map.setLayoutProperty(MAPILLARY_SEQUENCE_LAYER_ID, 'visibility', visibility);
  }
  if (map.getLayer(MAPILLARY_PANO_SEQUENCE_LAYER_ID)) {
    map.setLayoutProperty(MAPILLARY_PANO_SEQUENCE_LAYER_ID, 'visibility', visibility);
  }
}
