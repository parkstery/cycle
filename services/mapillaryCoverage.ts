import type { Map } from 'mapbox-gl';
import { ROUTE_LAYER } from './mapboxRouteLayer';

export const MAPILLARY_VECTOR_SOURCE_ID = 'mapillary-coverage-vtp';
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
          'line-opacity': 0.82,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 10, 16, 14],
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
        source: MAPILLARY_VECTOR_SOURCE_ID,
        'source-layer': 'sequence',
        filter: [
          'any',
          ['==', ['get', 'is_pano'], true],
          ['==', ['get', 'is_pano'], 1],
          ['==', ['get', 'is_pano'], 'true'],
        ],
        layout: {
          visibility: 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          // 360도 파노라마 구간은 전체 커버리지 위에 더 밝고 굵게 중첩한다.
          'line-color': '#22d3ee',
          'line-opacity': 0.96,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.2, 14, 4.4, 16, 6],
        },
      },
      beforeId
    );
  }
}

/**
 * Mapillary 커버리지를 OSRM 시안 도로(ROUTABLE) 위로 올리고, 주 경로선(ROUTE_LAYER) 바로 아래에 둔다.
 * 예전처럼 시안 “아래”에 두면 불투명에 가까운 시안 라인에 가려져 도시 구간에서 거의 보이지 않는다.
 */
export function stackMapillaryAboveRoutableBelowRoute(map: Map, routeLayerId: string = ROUTE_LAYER): void {
  if (!map.getLayer(MAPILLARY_SEQUENCE_LAYER_ID)) return;
  if (!routeLayerId || !map.getLayer(routeLayerId)) return;
  try {
    map.moveLayer(MAPILLARY_SEQUENCE_LAYER_ID, routeLayerId);
    if (map.getLayer(MAPILLARY_PANO_SEQUENCE_LAYER_ID)) {
      map.moveLayer(MAPILLARY_PANO_SEQUENCE_LAYER_ID, routeLayerId);
    }
  } catch {
    /* 순서 불가 */
  }
}

export function setMapillaryCoverageLayersVisibility(
  map: Map,
  visibility: { basic: boolean; pano360: boolean }
): void {
  const basicVis = visibility.basic ? 'visible' : 'none';
  const panoVis = visibility.pano360 ? 'visible' : 'none';
  if (map.getLayer(MAPILLARY_SEQUENCE_LAYER_ID)) {
    map.setLayoutProperty(MAPILLARY_SEQUENCE_LAYER_ID, 'visibility', basicVis);
  }
  if (map.getLayer(MAPILLARY_PANO_SEQUENCE_LAYER_ID)) {
    map.setLayoutProperty(MAPILLARY_PANO_SEQUENCE_LAYER_ID, 'visibility', panoVis);
  }
}

