import type { Map } from 'mapbox-gl';
import { ROUTE_LAYER } from './mapboxRouteLayer';

export const MAPILLARY_VECTOR_SOURCE_ID = 'mapillary-coverage-vtp';
export const MAPILLARY_SEQUENCE_LAYER_ID = 'mapillary-sequence-lines';

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
          'line-color': '#39c67f',
          'line-opacity': 0.55,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 3, 16, 5],
        },
      },
      beforeId
    );
  }
}

export function setMapillaryCoverageVisibility(map: Map, visible: boolean): void {
  if (!map.getLayer(MAPILLARY_SEQUENCE_LAYER_ID)) return;
  map.setLayoutProperty(MAPILLARY_SEQUENCE_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
}
