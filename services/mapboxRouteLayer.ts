import mapboxgl, { type Map } from 'mapbox-gl';

export const ROUTE_SOURCE = 'cycle-route-src';
export const ROUTE_LAYER = 'cycle-route-line';

export function mapStyleUrl(mapType: string): string {
  return mapType === 'hybrid'
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : 'mapbox://styles/mapbox/streets-v12';
}

export function pathToLineCoords(path: any[]): [number, number][] {
  return path.map((p) => {
    const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
    const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
    return [lng, lat] as [number, number];
  });
}

export function ensureRouteLineLayer(map: Map): void {
  if (map.getSource(ROUTE_SOURCE)) return;
  map.addSource(ROUTE_SOURCE, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [] },
    },
  });
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

export function setRouteLineGeometry(map: Map, path: any[]): void {
  const src = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;
  const coordinates = pathToLineCoords(path);
  src.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  });
}

export function clearRouteLineGeometry(map: Map): void {
  const src = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [] },
  });
}

export function fitMapToPath(map: Map, path: any[], padding = 48): void {
  if (!path.length) return;
  const b = new mapboxgl.LngLatBounds();
  for (const p of path) {
    const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
    const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
    b.extend([lng, lat]);
  }
  try {
    map.fitBounds(b, { padding, duration: 600, maxZoom: 16 });
  } catch {
    /* ignore */
  }
}
