/** mapbox-gl + CSS 를 한 번만 동적 로드 (메인 번들에서 분리) */
let loadPromise: Promise<typeof import('mapbox-gl').default> | null = null;

export function loadMapboxGl(): Promise<typeof import('mapbox-gl').default> {
  if (!loadPromise) {
    loadPromise = Promise.all([import('mapbox-gl'), import('mapbox-gl/dist/mapbox-gl.css')])
      .then(([mod]) => mod.default)
      .catch((e) => {
        loadPromise = null;
        throw e;
      });
  }
  return loadPromise;
}
