import type { Map, GeoJSONSource } from 'mapbox-gl';

export const ROUTE_SOURCE = 'cycle-route-src';
/** 넓은 반투명 라인 — OSRM 경로 “커버리지” 시각화(Street View 커버리지 대체) */
export const ROUTE_CORRIDOR_LAYER = 'cycle-route-corridor';
export const ROUTE_LAYER = 'cycle-route-line';

export function mapStyleUrl(mapType: string): string {
  switch (mapType) {
    case 'satellite':
      return 'mapbox://styles/mapbox/satellite-v9';
    case 'hybrid':
      return 'mapbox://styles/mapbox/satellite-streets-v12';
    case 'light':
      return 'mapbox://styles/mapbox/light-v11';
    case 'roadmap':
    case 'streets':
    default:
      return 'mapbox://styles/mapbox/streets-v12';
  }
}

export function pathToLineCoords(path: any[]): [number, number][] {
  return path.map((p) => {
    const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
    const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
    return [lng, lat] as [number, number];
  });
}

export function ensureRouteLineLayer(map: Map): void {
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [] },
      },
    });
  }
  // 코리더는 메인 라인 아래에 그린다. 기존 맵에 라인만 있을 때도 마이그레이션한다.
  if (!map.getLayer(ROUTE_CORRIDOR_LAYER)) {
    const beforeMain = map.getLayer(ROUTE_LAYER) ? ROUTE_LAYER : undefined;
    map.addLayer(
      {
        id: ROUTE_CORRIDOR_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: {
          visibility: 'none',
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#2563eb',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 16, 18, 22],
          'line-opacity': 0.38,
          'line-blur': 1.5,
        },
      },
      beforeMain
    );
  }
  if (!map.getLayer(ROUTE_LAYER)) {
    map.addLayer({
      id: ROUTE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ff3020',
        'line-width': 5,
        'line-opacity': 1,
      },
    });
  }
}

/** OSRM 경로 강조(파란 코리더) 표시 — 같은 GeoJSON 소스를 공유한다. */
export function setRouteCorridorVisibility(map: Map, visible: boolean): void {
  if (!map.getLayer(ROUTE_CORRIDOR_LAYER)) return;
  map.setLayoutProperty(ROUTE_CORRIDOR_LAYER, 'visibility', visible ? 'visible' : 'none');
}

export function setRouteLineGeometry(map: Map, path: any[]): void {
  const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  const coordinates = pathToLineCoords(path);
  src.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  });
}

export function clearRouteLineGeometry(map: Map): void {
  const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [] },
  });
}

export function fitMapToPath(map: Map, path: any[], padding = 48): void {
  if (!path.length) return;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const p of path) {
    const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
    const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return;
  try {
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding, duration: 600, maxZoom: 16 }
    );
  } catch {
    /* ignore */
  }
}
