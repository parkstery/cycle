
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, Navigation, Play, Pause, RotateCcw, Trash2, X, MapPin, Target, Volume2, AreaChart as AreaChartIcon, ChevronRight, ChevronLeft, History, Info, Route as RouteIcon, Zap, Activity, ShieldAlert, Bike, Footprints, Car, Maximize2, Minimize2, Waypoints, ArrowUpDown, Plus, CheckCircle2, Layers, Star, Square } from 'lucide-react';
import { RouteInfo, TravelMode, SimulationState, CoachingData, SavedRoute, PanoDataItem, AppPhase, CachedCoachingItem } from './types';
import { getAdvancedCoaching, getPredictiveCoaching, getCourseBriefing, getRideEncouragement } from './services/aiCoach';
// It's me EG
// Declare google global
declare var google: any;

// Pegman-style Street View icon (inline SVG data URI – always loads, no external request)
const PEGMAN_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
    '<circle cx="12" cy="7" r="5" fill="#F4B400" stroke="#E37400" stroke-width="1"/>' +
    '<ellipse cx="12" cy="16" rx="5" ry="6" fill="#F4B400" stroke="#E37400" stroke-width="1"/>' +
    '<path d="M10 21.5 L10 24 M14 21.5 L14 24" stroke="#E37400" stroke-width="1.2" fill="none"/>' +
    '</svg>'
  );

const PLAYLIST = [
  "https://www.dropbox.com/scl/fi/oq5lnyyc41rxso4kgm6en/1.mp3?rlkey=1j6uj6kxtu833jrljqz5qa0wx&st=ig1goyal&raw=1",
  "https://www.dropbox.com/scl/fi/qduirdh7mt24ucms1jn32/.mp3?rlkey=09o1232kpdahjlsns95ppbhrc&st=hsarn2s1&raw=1",
  "https://www.dropbox.com/scl/fi/8fbdd1t6v18z2m17ecidt/1.mp3?rlkey=sm15ow3aun8az4z6y2vseefy0&st=kbmlsn1m&raw=1",
  "https://www.dropbox.com/scl/fi/bvtw5s1pimhv42k3bgdxh/.mp3?rlkey=6ujd668vw7kzioe277gkqvsq7&st=cq1x65f8&raw=1",
  "https://www.dropbox.com/scl/fi/j1hzv2yx22uc0xl9redbj/1.mp3?rlkey=vjay2iyw06u84gygzxcoatz9w&st=9so3eh5n&raw=1",
  "https://www.dropbox.com/scl/fi/2avdaszs6csfvocofa9l9/.mp3?rlkey=ssqfzfmapfa3kkrqdifazbmoj&st=h4pfgwtr&raw=1"
];

// Helper to wrap getPanorama in a Promise (no direction filter)
const findStreetView = (
    service: any,
    location: any,
    radius: number
): Promise<any> => {
    return new Promise((resolve) => {
        service.getPanorama({
            location,
            radius,
            source: google.maps.StreetViewSource.GOOGLE,
            preference: google.maps.StreetViewPreference.NEAREST
        }, (data: any, status: string) => {
            if (status === 'OK' && data) {
                resolve(data);
            } else {
                resolve(null);
            }
        });
    });
};

/** Normalize angle difference to [-180, 180] */
function normalizeAngleDiff(deg: number): number {
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    return deg;
}

/**
 * 주행 방향 각도 범위 내 거리뷰만 채택.
 * radius만 쓰면 전·후·좌·우 pano가 나오므로, 반환 pano가 전방 반구(±90°) 내인지 검사.
 */
const findStreetViewInDirection = (
    service: any,
    pathPoint: any,
    pathNext: any,
    pathIndex: number,
    path: any[],
    radius: number,
    maxAngleDeg: number = 90
): Promise<PanoDataItem | null> => {
    return new Promise((resolve) => {
        service.getPanorama({
            location: pathPoint,
            radius,
            source: google.maps.StreetViewSource.GOOGLE,
            preference: google.maps.StreetViewPreference.NEAREST
        }, (data: any, status: string) => {
            if (status !== 'OK' || !data?.location?.pano) {
                resolve(null);
                return;
            }
            const driveHeading = google.maps.geometry.spherical.computeHeading(pathPoint, pathNext);
            const panoLatLng = data.location.latLng;
            const bearingToPano = google.maps.geometry.spherical.computeHeading(pathPoint, panoLatLng);
            const angleDiff = Math.abs(normalizeAngleDiff(bearingToPano - driveHeading));
            if (angleDiff > maxAngleDeg) {
                resolve(null);
                return;
            }
            const nextIdx = Math.min(pathIndex + 10, path.length - 1);
            const heading = google.maps.geometry.spherical.computeHeading(pathPoint, path[nextIdx]);
            resolve({
                pathIndex,
                panoId: data.location.pano,
                location: data.location.latLng,
                heading
            });
        });
    });
};

/** True when current inputs match the last successful route request (for Go reuse). */
function inputsMatch(
  origin: string,
  destination: string,
  waypoints: { name: string; location: any }[],
  mode: TravelMode,
  last: { origin: string; destination: string; waypointNames: string[]; mode: TravelMode }
): boolean {
  if (mode !== last.mode) return false;
  if (origin.trim() !== last.origin || destination.trim() !== last.destination) return false;
  if (waypoints.length !== last.waypointNames.length) return false;
  return waypoints.every((w, i) => (w.name || '').trim() === (last.waypointNames[i] || '').trim());
}

const App: React.FC = () => {
  // Map & Service References
  const mapRef = useRef<HTMLDivElement>(null);
  
  // Double Buffering Refs
  const svContainerRef = useRef<HTMLDivElement>(null);
  const svRef1 = useRef<HTMLDivElement>(null);
  const svRef2 = useRef<HTMLDivElement>(null);
  const panorama1 = useRef<any>(null);
  const panorama2 = useRef<any>(null);
  const activePanoRef = useRef<number>(0); // 0 or 1
  const [visiblePanoIdx, setVisiblePanoIdx] = useState<number>(0); // Controls Z-Index

  const googleMap = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const simulationMarker = useRef<any>(null);
  const startMarker = useRef<any>(null);
  const endMarker = useRef<any>(null);
  const waypointMarkers = useRef<any[]>([]);
  const tempMarker = useRef<any>(null);
  const searchMarkerRef = useRef<any>(null); // 검색 결과 지도 마커
  
  // We keep a general reference to the *currently active* panorama for non-swapping logic if needed,
  // but mostly we use panorama1/panorama2 directly.
  const geocoder = useRef<any>(null);
  const placesService = useRef<any>(null);
  const elevationService = useRef<any>(null);
  const polylineOverlay = useRef<any>(null);
  const coverageLayer = useRef<any>(null);
  const svServiceRef = useRef<any>(null); 
  const svErrorCount = useRef(0);
  const isSvSearching = useRef(false); // Semaphore to prevent overlapping SV searches
  const isSegmentFetchingRef = useRef(false); // Prevent overlapping on-demand segment fetches
  const pendingSwapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Cancel previous swap when called again
  const pendingSwapFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Fallback swap if status_changed never OK (방안 A)

  // Exact Coordinate References (Fix for Road Snapping)
  const originLocationRef = useRef<any>(null);
  const destLocationRef = useRef<any>(null);

  // Last route request params: reuse route on Go when inputs unchanged (avoid duplicate Directions/Elevation)
  const lastRouteRequestRef = useRef<{ origin: string; destination: string; waypointNames: string[]; mode: TravelMode } | null>(null);

  // Audio References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const simulationActiveRef = useRef(false);

  // App Core State
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [simulation, setSimulation] = useState<SimulationState>({ isActive: false, currentIndex: 0, speed: 100 });
  const [speedKmH, setSpeedKmH] = useState(20); 
  const [mode, setMode] = useState<TravelMode>(TravelMode.BICYCLING);
  const [loading, setLoading] = useState(false);
  const [isSvActive, setIsSvActive] = useState(false);
  const [isSvFullScreen, setIsSvFullScreen] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [svStatus, setSvStatus] = useState<string>('OK');
  const [showSvWarning, setShowSvWarning] = useState(false);
  const [routeSource, setRouteSource] = useState<'GOOGLE' | 'OSRM' | null>(null);
  const [mapType, setMapType] = useState<string>('roadmap');
  
  // Independent Timer States for Elevation Chart
  const [elapsedTime, setElapsedTime] = useState(0);
  const [coveredDistance, setCoveredDistance] = useState(0);

  // Advanced Coach State
  const [coachData, setCoachData] = useState<CoachingData | null>(null);
  const [isCoachThinking, setIsCoachThinking] = useState(false);
  const lastCoachedIndex = useRef<number>(-1);
  const lastValidUntilFetched = useRef<number>(-1);

  // Folding States
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [routeInputExpanded, setRouteInputExpanded] = useState(true);
  const [elevationExpanded, setElevationExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  // Input States
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState<{name: string, location: any}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Script Loading State
  const [isMapsApiLoaded, setIsMapsApiLoaded] = useState(false);

  // Traffic optimization: phase (PREPARING = API allowed, RUNNING = cache only)
  const [appPhase, setAppPhase] = useState<AppPhase>('IDLE');
  const [preparingProgress, setPreparingProgress] = useState<{ k: number; n: number } | null>(null);
  const lastPanToTime = useRef<number>(0);

  // Favorites (My Routes) State
  const [favoriteRoutes, setFavoriteRoutes] = useState<SavedRoute[]>(() => {
    const saved = localStorage.getItem('favorite_routes');
    if (saved) return JSON.parse(saved);
    
    // Default Routes if nothing saved
    return [
      {
        id: "def-jeju",
        origin: "대한민국 제주특별자치도 서귀포시 성산읍 신산리 1130-12",
        destination: "대한민국 제주특별자치도 서귀포시 성산읍 온평리 1286-4",
        waypoints: [],
        timestamp: Date.now()
      },
      {
        id: "def-paris",
        origin: "Ch. de Gaulle - Étoile Grande Armée, 75116 Paris, 프랑스",
        destination: "33 Bd de Grenelle, 75015 Paris, 프랑스",
        waypoints: [],
        timestamp: Date.now()
      },
      {
        id: "def-switz",
        origin: "HXJQ+M5 스위스 그린델발트",
        destination: "H2R4+H7 스위스 그린델발트",
        waypoints: [],
        timestamp: Date.now()
      },
      {
        id: "def-italy",
        origin: "Via dell’Abbondanza, 6, 80045 Pompei NA, 이탈리아",
        destination: "Villa delle Tombe, 8, 80045 Pompei NA, 이탈리아",
        waypoints: [],
        timestamp: Date.now()
      }
    ];
  });

  // Recent Place Searches (SearchBar)
  const [recentPlaceSearches, setRecentPlaceSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent_places');
    return saved ? JSON.parse(saved) : [];
  });

  const [clickedLocation, setClickedLocation] = useState<{lat: number, lng: number, name?: string, address: string, elevation: number | null, location: any} | null>(null);

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  /** 주행 시간 표시용 단순 형식 (예: 1:25) */
  const formatDurationSimple = (totalSeconds: number) => {
    if (!isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.round((totalSeconds % 3600) / 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  // Helper to check if current route is saved
  const isCurrentRouteSaved = useCallback(() => {
    if (!origin || !destination) return false;
    return favoriteRoutes.some(saved => 
        saved.origin === origin && 
        saved.destination === destination && 
        saved.waypoints.length === waypoints.length &&
        saved.waypoints.every((wp, i) => wp.name === waypoints[i].name)
    );
  }, [origin, destination, waypoints, favoriteRoutes]);

  const handleToggleFavorite = () => {
    if (!origin || !destination) return;
    
    const isSaved = isCurrentRouteSaved();
    
    if (isSaved) {
        // Remove
        const newFavorites = favoriteRoutes.filter(saved => !(
            saved.origin === origin && 
            saved.destination === destination && 
            saved.waypoints.length === waypoints.length &&
            saved.waypoints.every((wp, i) => wp.name === waypoints[i].name)
        ));
        setFavoriteRoutes(newFavorites);
        localStorage.setItem('favorite_routes', JSON.stringify(newFavorites));
    } else {
        // Add
        if (favoriteRoutes.length >= 5) {
            alert("Maximum 5 routes can be saved. Please remove a route to save a new one.");
            return;
        }
        
        // Serialize waypoints
        const newWaypoints = waypoints.map(wp => {
            // Check if location is a Google LatLng object (has methods) or plain object
            const lat = typeof wp.location.lat === 'function' ? wp.location.lat() : wp.location.lat;
            const lng = typeof wp.location.lng === 'function' ? wp.location.lng() : wp.location.lng;
            return {
                name: wp.name,
                lat: lat,
                lng: lng
            };
        });

        const newRoute: SavedRoute = {
            id: Date.now().toString(),
            origin,
            destination,
            waypoints: newWaypoints,
            timestamp: Date.now()
        };

        const newFavorites = [newRoute, ...favoriteRoutes];
        setFavoriteRoutes(newFavorites);
        localStorage.setItem('favorite_routes', JSON.stringify(newFavorites));
    }
  };

  const handleLoadFavorite = (saved: SavedRoute) => {
    setOrigin(saved.origin);
    setDestination(saved.destination);
    
    // Clear precise location refs when loading from favorites (fallback to address string)
    originLocationRef.current = null;
    destLocationRef.current = null;

    // Deserialize waypoints
    const restoredWaypoints = saved.waypoints.map(wp => ({
        name: wp.name,
        location: new google.maps.LatLng(wp.lat, wp.lng)
    }));
    setWaypoints(restoredWaypoints);
  };

  const handleDeleteFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = favoriteRoutes.filter(r => r.id !== id);
    setFavoriteRoutes(newFavorites);
    localStorage.setItem('favorite_routes', JSON.stringify(newFavorites));
  };

  // Helper: swap only after nextPano is OK + 150ms delay (방안 A: 검은 화면 방지)
  const scheduleSwapAfterOk = useCallback((nextPano: any, _nextIdx: number, doSwap: () => void) => {
    if (pendingSwapFallbackRef.current) {
      clearTimeout(pendingSwapFallbackRef.current);
      pendingSwapFallbackRef.current = null;
    }
    const doSwapWithDelay = () => {
      pendingSwapTimeoutRef.current = null;
      doSwap();
    };
    const FALLBACK_MS = 1500;
    const DELAY_AFTER_OK_MS = 150;
    let listener: any = null;
    pendingSwapFallbackRef.current = setTimeout(() => {
      pendingSwapFallbackRef.current = null;
      if (listener) google.maps.event.removeListener(listener);
      doSwap();
    }, FALLBACK_MS);
    listener = nextPano.addListener('status_changed', () => {
      if (nextPano.getStatus() !== 'OK') return;
      if (listener) { google.maps.event.removeListener(listener); listener = null; }
      if (pendingSwapFallbackRef.current) { clearTimeout(pendingSwapFallbackRef.current); pendingSwapFallbackRef.current = null; }
      pendingSwapTimeoutRef.current = setTimeout(doSwapWithDelay, DELAY_AFTER_OK_MS);
    });
  }, []);

  // Helper function to update panorama atomically (Hybrid Double Buffer)
  const setPanoramaView = useCallback((location: any, heading: number) => {
      if (!svServiceRef.current) return;
      if (pendingSwapTimeoutRef.current) {
          clearTimeout(pendingSwapTimeoutRef.current);
          pendingSwapTimeoutRef.current = null;
      }
      if (pendingSwapFallbackRef.current) {
          clearTimeout(pendingSwapFallbackRef.current);
          pendingSwapFallbackRef.current = null;
      }
      svServiceRef.current.getPanorama({
          location: location,
          radius: 50,
          source: google.maps.StreetViewSource.GOOGLE,
          preference: google.maps.StreetViewPreference.NEAREST
      }, (data: any, status: string) => {
          if (status === 'OK' && data?.location) {
              const currentIdx = activePanoRef.current;
              const nextIdx = currentIdx === 0 ? 1 : 0;
              const currentPano = currentIdx === 0 ? panorama1.current : panorama2.current;
              const nextPano = nextIdx === 0 ? panorama1.current : panorama2.current;

              if (!currentPano || !nextPano) return;

              const newPanoId = data.location.pano;
              const currentPanoId = currentPano.getPano();

              const doSwap = () => {
                  pendingSwapTimeoutRef.current = null;
                  activePanoRef.current = nextIdx;
                  setVisiblePanoIdx(nextIdx);
                  if (googleMap.current) googleMap.current.setStreetView(nextPano);
              };

              nextPano.setOptions({
                  pano: newPanoId,
                  pov: { heading, pitch: 0 },
                  visible: true
              });

              scheduleSwapAfterOk(nextPano, nextIdx, doSwap);
          }
      });
  }, [scheduleSwapAfterOk]);

  /**
   * 거리뷰 표시: 내부적으로 계산된 각도(heading)를 적용한 뒤 스왑하여 보여줌.
   * 같은 파노라마·동일 heading이면 스왑 생략(같은 이미지 두 번 노출 방지).
   * 방안 A: nextPano status_changed → OK 후 150ms 지연 스왑 + 1.5s 폴백.
   */
  const setPanoramaViewByPanoId = useCallback((panoId: string, heading: number) => {
    if (pendingSwapTimeoutRef.current) {
      clearTimeout(pendingSwapTimeoutRef.current);
      pendingSwapTimeoutRef.current = null;
    }
    if (pendingSwapFallbackRef.current) {
      clearTimeout(pendingSwapFallbackRef.current);
      pendingSwapFallbackRef.current = null;
    }
    const currentIdx = activePanoRef.current;
    const nextIdx = currentIdx === 0 ? 1 : 0;
    const currentPano = currentIdx === 0 ? panorama1.current : panorama2.current;
    const nextPano = nextIdx === 0 ? panorama1.current : panorama2.current;
    if (!currentPano || !nextPano) return;
    const currentPanoId = currentPano.getPano();

    const doSwap = () => {
      pendingSwapTimeoutRef.current = null;
      activePanoRef.current = nextIdx;
      setVisiblePanoIdx(nextIdx);
      if (googleMap.current) googleMap.current.setStreetView(nextPano);
    };

    // 같은 파노라마·동일(또는 거의 동일) heading이면 스왑하지 않음 → 같은 이미지 두 번 보이는 부작용 방지
    if (currentPanoId === panoId) {
      const currentPov = currentPano.getPov?.();
      const curH = currentPov?.heading ?? 0;
      if (Math.abs(normalizeAngleDiff(curH - heading)) < 3) return;
    }

    nextPano.setOptions({ pano: panoId, pov: { heading, pitch: 0 }, visible: true });
    scheduleSwapAfterOk(nextPano, nextIdx, doSwap);
  }, [scheduleSwapAfterOk]);

  /** Pre-fetch Street View along path with driving-direction filter. fromDistanceM/maxDistanceM = segment (e.g. initial 0–150m). */
  const preFetchStreetViewData = useCallback(async (
    path: any[],
    onProgress: (k: number, n: number) => void,
    options?: { fromDistanceM?: number; maxDistanceM?: number; intervalM?: number }
  ): Promise<PanoDataItem[]> => {
    if (!svServiceRef.current || !path.length) return [];
    const cumDist: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      cumDist[i] = cumDist[i - 1] + google.maps.geometry.spherical.computeDistanceBetween(path[i - 1], path[i]);
    }
    const totalM = cumDist[path.length - 1];
    const intervalM = options?.intervalM ?? 10;
    const fromDistanceM = options?.fromDistanceM ?? 0;
    const maxDistanceM = options?.maxDistanceM ?? totalM;
    const samples: number[] = [];
    for (let d = fromDistanceM; d <= Math.min(totalM, maxDistanceM); d += intervalM) {
      let i = 0;
      while (i < path.length - 1 && cumDist[i + 1] < d) i++;
      samples.push(Math.min(i, path.length - 1));
    }
    const panoData: PanoDataItem[] = [];
    const n = samples.length;
    for (let k = 0; k < n; k++) {
      const pathIndex = samples[k];
      const pathPoint = path[pathIndex];
      const pathNext = path[Math.min(pathIndex + 10, path.length - 1)];
      let item: PanoDataItem | null = null;
      for (const r of [30, 20, 15]) {
        item = await findStreetViewInDirection(
          svServiceRef.current,
          pathPoint,
          pathNext,
          pathIndex,
          path,
          r,
          90
        );
        if (item) break;
      }
      // 연속 디스플레이 우선: 방향 필터 실패 시에도 해당 구간에 pano가 있으면 추가 (생략 방지)
      if (!item) {
        const fallback = await findStreetView(svServiceRef.current, pathPoint, 30);
        if (fallback?.location?.pano) {
          const heading = google.maps.geometry.spherical.computeHeading(pathPoint, pathNext);
          item = {
            pathIndex,
            panoId: fallback.location.pano,
            location: fallback.location.latLng,
            heading
          };
        }
      }
      if (item) panoData.push(item);
      onProgress(k + 1, n);
      if (k < n - 1) await new Promise(r => setTimeout(r, 80));
    }
    return panoData;
  }, []);

  // Find panoData item with largest pathIndex <= current path index
  const getPanoDataForIndex = useCallback((panoData: PanoDataItem[], pathIndex: number): PanoDataItem | null => {
    if (!panoData.length) return null;
    let best: PanoDataItem | null = null;
    for (const p of panoData) {
      if (p.pathIndex <= pathIndex && (best === null || p.pathIndex > best.pathIndex)) best = p;
    }
    return best ?? panoData[0];
  }, []);

  // Dynamic Script Loading
  useEffect(() => {
    if ((window as any).google && (window as any).google.maps) {
      setIsMapsApiLoaded(true);
      return;
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_MAPS_API_KEY is missing via process.env");
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry,elevation`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsMapsApiLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Map Initialization
  useEffect(() => {
    if (isMapsApiLoaded && mapRef.current && !googleMap.current) {
        googleMap.current = new google.maps.Map(mapRef.current, {
            center: { lat: 37.7749, lng: -122.4194 },
            zoom: 14,
            mapTypeControl: false, // Disabled default map type control
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: false,
            rotateControl: false, // Disabled rotation/compass control
            scaleControl: true, // Enabled scale control....by eg
            scaleControlOptions: {
              position: google.maps.ControlPosition.BOTTOM_LEFT
            },
            cameraControl: false, // Disabled the new Camera Control (Tilt/Rotate UI)
            clickableIcons: false, // Hide the "Camera/Move" (Map Toolbar) in bottom right
            styles: [
                { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
            ]
        });

        directionsRenderer.current = new google.maps.DirectionsRenderer({
            map: googleMap.current,
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: { 
                strokeColor: '#3b82f6', 
                strokeOpacity: 0.6, 
                strokeWeight: 5,
                clickable: false // Ensure clicks pass through the route line to the map
            }
        });

        geocoder.current = new google.maps.Geocoder();
        placesService.current = new google.maps.places.PlacesService(googleMap.current);
        elevationService.current = new google.maps.ElevationService();
        
        // Restore Coverage Layer
        coverageLayer.current = new google.maps.StreetViewCoverageLayer();

        // --- DOUBLE BUFFERING INITIALIZATION ---
        const svOptions = {
             visible: true, // Always visible internally, controlled by container
             enableCloseButton: false,
             disableDefaultUI: true,
             clickToGo: false,
             motionTracking: true, 
             motionTrackingControl: true
        };

        panorama1.current = new google.maps.StreetViewPanorama(svRef1.current, svOptions);
        panorama2.current = new google.maps.StreetViewPanorama(svRef2.current, svOptions);
        
        // Initialize with Pano 1 active
        googleMap.current.setStreetView(panorama1.current);
        // ---------------------------------------

        svServiceRef.current = new google.maps.StreetViewService();

        // Listeners for Status (Attached to Pano 1 for general status tracking, 
        // effectively we might need to track both but usually error status matters most)
        const handleStatus = () => {
             // We can check status of the active one
             const currentPano = activePanoRef.current === 0 ? panorama1.current : panorama2.current;
             if (currentPano) {
                const status = currentPano.getStatus();
                setSvStatus(status);
                if (status === 'OK') setShowSvWarning(false);
             }
        };

        panorama1.current.addListener('status_changed', handleStatus);
        panorama2.current.addListener('status_changed', handleStatus);

        googleMap.current.addListener("click", (e: any) => {
             e.stop();
             if (e.placeId) {
                 placesService.current.getDetails({ placeId: e.placeId }, (place: any, status: any) => {
                     if (status === 'OK') {
                         setClickedLocation({
                             lat: place.geometry.location.lat(),
                             lng: place.geometry.location.lng(),
                             name: place.name,
                             address: place.formatted_address,
                             elevation: null,
                             location: place.geometry.location
                         });
                     }
                 });
             } else {
                 geocoder.current.geocode({ location: e.latLng }, (results: any, status: any) => {
                     if (status === 'OK' && results[0]) {
                         // Fix: Use the formatted address as name instead of "Selected Location" to prevent routing errors
                         setClickedLocation({
                             lat: e.latLng.lat(),
                             lng: e.latLng.lng(),
                             name: results[0].formatted_address, 
                             address: results[0].formatted_address,
                             elevation: null,
                             location: e.latLng
                         });
                     }
                 });
             }
        });
    }
  }, [isMapsApiLoaded]);

  // Restore Coverage Layer Effect
  useEffect(() => {
    if (googleMap.current && coverageLayer.current) {
      coverageLayer.current.setMap(showCoverage ? googleMap.current : null);
    }
  }, [showCoverage]);

  useEffect(() => {
    simulationActiveRef.current = simulation.isActive;
  }, [simulation.isActive]);

  useEffect(() => {
    setTimeout(() => {
      if (googleMap.current) google.maps.event.trigger(googleMap.current, 'resize');
      // Trigger resize on both panoramas
      if (panorama1.current) google.maps.event.trigger(panorama1.current, 'resize');
      if (panorama2.current) google.maps.event.trigger(panorama2.current, 'resize');
    }, 550);
  }, [isSvFullScreen]);

  useEffect(() => {
    let timer: number;
    if (simulation.isActive && route) {
      setAppPhase('RUNNING');
      if (tempMarker.current) { tempMarker.current.setMap(null); }
      const currentIdx = simulation.currentIndex;
      if (currentIdx >= route.path.length - 1) {
          setSimulation(prev => ({ ...prev, isActive: false }));
          setAppPhase('IDLE');
          getRideEncouragement(route, { distance: route.distance, duration: route.duration }).then(speak);
          return;
      }
      const currentPos = route.path[currentIdx];
      
      // Update Simulation Marker
      if (!simulationMarker.current) {
          simulationMarker.current = new google.maps.Marker({ 
              position: currentPos, 
              map: googleMap.current, 
              icon: { 
                  path: "M15.5,5.5c1.1,0,2-0.9,2-2s-0.9-2-2-2s-2,0.9-2,2S14.4,5.5,15.5,5.5z M5,12c-2.8,0-5,2.2-5,5s2.2,5,5,5 s5-2.2,5-5S7.8,12,5,12z M5,20c-1.7,0-3-1.3-3-3s1.3-3,3-3s3,1.3,3,3S6.7,20,5,20z M19,12c-2.8,0-5,2.2-5,5s2.2,5,5,5s5-2.2,5-5 S21.8,12,19,12z M19,20c-1.7,0-3-1.3-3-3s1.3-3,3-3s3,1.3,3,3S20.7,20,19,20z M13,7h-2.8l-3.7,6.6C6.3,13.8,6.1,14,5.9,14.1 c-0.1,0-0.3,0-0.4,0l-1-0.2c-0.6-0.2-1.1,0.2-1.3,0.7c-0.2,0.6,0.2,1.1,0.7,1.3l1,0.2c0.7,0.1,1.4-0.1,1.9-0.6l3.3-6l2.1,0l2.3,4.4 c0.3,0.5,0.8,0.8,1.4,0.8h3.3c0.6,0,1-0.4,1-1s-0.4-1-1-1h-2.9L13,7z", 
                  scale: 1.5, fillColor: '#3b82f6', fillOpacity: 1, strokeWeight: 1, strokeColor: '#ffffff', anchor: new google.maps.Point(12, 12)
              } 
          });
      }
      const lookAheadIdx = Math.min(currentIdx + 10, route.path.length - 1);
      const targetPosForHeading = route.path[lookAheadIdx];
      const heading = google.maps.geometry.spherical.computeHeading(currentPos, targetPosForHeading);
      simulationMarker.current.setPosition(currentPos);
      simulationMarker.current.setOptions({ rotation: heading });

      // ---- STREET VIEW: Progressive (panoData cache + on-demand segment fetch) or fallback (real-time API) ----
      if (isSvActive) {
        if (route.panoData?.length) {
          const panoItem = getPanoDataForIndex(route.panoData, currentIdx);
          if (panoItem) setPanoramaViewByPanoId(panoItem.panoId, panoItem.heading);
          // On-demand: fetch next segment when approaching end of cached panoData (throttle via isSegmentFetchingRef)
          const lastPano = route.panoData[route.panoData.length - 1];
          if (
            lastPano &&
            currentIdx >= lastPano.pathIndex - 150 &&
            !isSegmentFetchingRef.current &&
            svServiceRef.current
          ) {
            isSegmentFetchingRef.current = true;
            const path = route.path;
            const cumDist: number[] = [0];
            for (let i = 1; i < path.length; i++) {
              cumDist[i] = cumDist[i - 1] + google.maps.geometry.spherical.computeDistanceBetween(path[i - 1], path[i]);
            }
            const totalM = cumDist[path.length - 1];
            const distAtLast = cumDist[Math.min(lastPano.pathIndex, path.length - 1)];
            const fromM = distAtLast + 10;
            const toM = Math.min(distAtLast + 200, totalM);
            if (fromM < toM) {
              preFetchStreetViewData(path, () => {}, { fromDistanceM: fromM, maxDistanceM: toM, intervalM: 10 })
                .then((nextPanos) => {
                  if (nextPanos.length) {
                    setRoute((prev) => prev ? { ...prev, panoData: [...(prev.panoData || []), ...nextPanos] } : null);
                  }
                })
                .finally(() => { isSegmentFetchingRef.current = false; });
            } else {
              isSegmentFetchingRef.current = false;
            }
          }
        } else if (svServiceRef.current && !isSvSearching.current) {
          const activePano = activePanoRef.current === 0 ? panorama1.current : panorama2.current;
          const currentPanoLoc = activePano?.getLocation()?.latLng;
          const distFromLastPano = currentPanoLoc ? google.maps.geometry.spherical.computeDistanceBetween(currentPos, currentPanoLoc) : Infinity;
          if (distFromLastPano > 15 || !currentPanoLoc) {
            isSvSearching.current = true;
            (async () => {
              const pathNext = route.path[Math.min(currentIdx + 10, route.path.length - 1)];
              let item: PanoDataItem | null = await findStreetViewInDirection(
                svServiceRef.current, currentPos, pathNext, currentIdx, route.path, 30, 90
              );
              if (!item) {
                for (let i = 1; i <= 5; i++) {
                  const targetIdx = Math.min(currentIdx + i, route.path.length - 1);
                  const pt = route.path[targetIdx];
                  const pn = route.path[Math.min(targetIdx + 10, route.path.length - 1)];
                  item = await findStreetViewInDirection(svServiceRef.current, pt, pn, targetIdx, route.path, 30, 90);
                  if (item) break;
                }
              }
              if (!item) {
                const fallback = await findStreetView(svServiceRef.current, currentPos, 100);
                if (fallback?.location?.pano) {
                  const nextIdx = Math.min(currentIdx + 1, route.path.length - 1);
                  const finalHeading = google.maps.geometry.spherical.computeHeading(currentPos, route.path[nextIdx]);
                  setPanoramaView(fallback.location.latLng, finalHeading);
                  setShowSvWarning(false);
                } else if (svErrorCount.current++ > 5) setShowSvWarning(true);
              } else {
                setRoute((prev) => prev ? { ...prev, panoData: [item!] } : null);
                setPanoramaViewByPanoId(item.panoId, item.heading);
                setShowSvWarning(false);
              }
              isSvSearching.current = false;
            })();
          }
        }
        if (isSvFullScreen && googleMap.current) {
          const now = Date.now();
          if (now - lastPanToTime.current > 1000) {
            lastPanToTime.current = now;
            googleMap.current.panTo(currentPos);
          }
        }
      }
      // -----------------------------------------------------------

      // ---- AI COACHING: Predictive (cachedCoaching) or legacy (every 21 steps). 모든 멘트는 브라우저 TTS(speak). ----
      const cached = route.cachedCoaching;
      const currentCached = cached?.find(c => c.validUntilPathIndex >= currentIdx);
      if (currentCached) {
        setCoachData(currentCached.coaching);
        const lastValid = cached?.length ? cached[cached.length - 1]?.validUntilPathIndex ?? 0 : 0;
        if (currentIdx >= lastValid - 100 && lastValidUntilFetched.current !== lastValid && route.elevation.length > 0) {
          lastValidUntilFetched.current = lastValid;
          const pathLen = route.path.length;
          const elevLen = route.elevation.length;
          const startElevIdx = Math.floor((currentIdx / pathLen) * elevLen);
          const segmentSize = Math.min(20, elevLen - startElevIdx);
          if (segmentSize > 0) {
            const upcomingSlice = route.elevation.slice(startElevIdx, startElevIdx + segmentSize);
            setIsCoachThinking(true);
            getPredictiveCoaching(upcomingSlice, pathLen, elevLen, currentIdx, speedKmH, coachData?.resistance)
              .then(({ coaching, validUntilPathIndex }) => {
                setRoute(prev => prev ? { ...prev, cachedCoaching: [...(prev.cachedCoaching || []), { coaching, validUntilPathIndex }] } : null);
                setCoachData(coaching);
                speak(coaching.tip);
              })
              .finally(() => setIsCoachThinking(false));
          }
        }
      } else if (currentIdx > 0 && currentIdx % 21 === 0 && currentIdx !== lastCoachedIndex.current) {
        (async () => {
          const currentElev = route.elevation[Math.floor((currentIdx / route.path.length) * route.elevation.length)]?.elevation || 0;
          const upcoming = route.elevation.slice(Math.floor((currentIdx / route.path.length) * route.elevation.length), Math.floor(((currentIdx + 20) / route.path.length) * route.elevation.length));
          setIsCoachThinking(true);
          const newCoaching = await getAdvancedCoaching(currentElev, upcoming, speedKmH, coachData?.resistance);
          setCoachData(newCoaching);
          speak(newCoaching.tip);
          setIsCoachThinking(false);
          lastCoachedIndex.current = currentIdx;
        })();
      }
      let delay = 100;
      const nextPos = route.path[currentIdx + 1];
      if (nextPos) {
          const distMeters = google.maps.geometry.spherical.computeDistanceBetween(currentPos, nextPos);
          const speedMetersPerSec = (speedKmH * 1000) / 3600;
          if (speedMetersPerSec > 0) { delay = (distMeters / speedMetersPerSec) * 1000; }
      }
      if (delay < 50) delay = 50;
      timer = window.setTimeout(() => { setSimulation(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 })); }, delay);
    }
    return () => clearTimeout(timer);
  }, [simulation.isActive, simulation.currentIndex, route, speedKmH, isSvFullScreen, isSvActive]); 

  // Secondary Effect for Timer (same as before)
  useEffect(() => {
    let timer: number;
    if (simulation.isActive && route) {
      timer = window.setInterval(() => {
        setElapsedTime(prev => prev + 1);
        const metersPerSecond = (speedKmH * 1000) / 3600;
        setCoveredDistance(prev => prev + metersPerSecond);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [simulation.isActive, route, speedKmH]);

  const fadeAudio = (targetVolume: number, duration: number = 2000, onComplete?: () => void) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    const stepTime = 50;
    const steps = duration / stepTime;
    const volumeStep = (targetVolume - audio.volume) / steps;
    fadeIntervalRef.current = window.setInterval(() => {
      let newVolume = audio.volume + volumeStep;
      if (volumeStep > 0 && newVolume >= targetVolume) newVolume = targetVolume;
      if (volumeStep < 0 && newVolume <= targetVolume) newVolume = targetVolume;
      newVolume = Math.max(0, Math.min(1, newVolume));
      audio.volume = newVolume;
      if (newVolume === targetVolume) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        if (onComplete) onComplete();
      }
    }, stepTime);
  };

  const playRandomMusic = () => {
    if (!audioRef.current) return;
    const track = PLAYLIST[Math.floor(Math.random() * PLAYLIST.length)];
    audioRef.current.src = track;
    audioRef.current.volume = 0;
    audioRef.current.play().catch(e => console.log("Audio autoplay blocked or failed", e));
    fadeAudio(0.3);
  };

  useEffect(() => {
    if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener('ended', () => {
            if (simulationActiveRef.current) {
                playRandomMusic();
            }
        });
    }
    return () => {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (simulation.isActive) {
        if (audioRef.current && audioRef.current.paused) { playRandomMusic(); }
    } else {
        if (audioRef.current && !audioRef.current.paused) {
            fadeAudio(0, 2000, () => { audioRef.current?.pause(); });
        }
    }
  }, [simulation.isActive]);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; 
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith('en') && 
      (voice.name.includes('Female') || voice.name.includes('Google US English') || voice.name.includes('Samantha'))
    );
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const createCustomMarker = (latLng: any, label: string, color: string) => {
    return new google.maps.Marker({
      position: latLng,
      map: googleMap.current,
      label: { text: label, color: 'white', fontWeight: 'bold', fontSize: '14px' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 14,
        fillColor: color,
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#ffffff'
      }
    });
  };

  const clearMapOverlays = () => {
    setAppPhase('IDLE');
    setPreparingProgress(null);
    if (directionsRenderer.current) directionsRenderer.current.setDirections({ routes: [] });
    if (polylineOverlay.current) { polylineOverlay.current.setMap(null); polylineOverlay.current = null; }
    if (simulationMarker.current) { simulationMarker.current.setMap(null); simulationMarker.current = null; }
    if (startMarker.current) { startMarker.current.setMap(null); startMarker.current = null; }
    if (endMarker.current) { endMarker.current.setMap(null); endMarker.current = null; }
    if (searchMarkerRef.current) { searchMarkerRef.current.setMap(null); searchMarkerRef.current = null; }
    waypointMarkers.current.forEach(m => m.setMap(null));
    waypointMarkers.current = [];
    setRoute(null);
    lastRouteRequestRef.current = null;
    setSimulation({ isActive: false, currentIndex: 0, speed: 100 });
    setCoachData(null);
    setRouteSource(null);
    setWaypoints([]);
    
    // Explicitly clear start and end inputs
    setOrigin('');
    setDestination('');
    
    // Clear Coordinate Refs
    originLocationRef.current = null;
    destLocationRef.current = null;

    svErrorCount.current = 0;
    setShowSvWarning(false);
    setElapsedTime(0);
    setCoveredDistance(0);
  };

  const restartSimulation = () => {
    if (route && route.path.length > 0) {
      setSimulation(prev => ({ ...prev, currentIndex: 0, isActive: true }));
      lastCoachedIndex.current = -1;
      setElapsedTime(0);
      setCoveredDistance(0);
      
      const startPos = route.path[0];
      const nextPos = route.path.length > 1 ? route.path[1] : startPos;
      const heading = google.maps.geometry.spherical.computeHeading(startPos, nextPos);
      
      // Update view (Hybrid)
      setPanoramaView(startPos, heading);

      setIsSvFullScreen(true);

      getCourseBriefing(route).then(speak);
    }
  };

  const handleStopSimulation = () => {
    setSimulation(prev => ({ ...prev, isActive: false, currentIndex: 0 }));
    setAppPhase('IDLE');
    lastValidUntilFetched.current = -1;
    setIsSvFullScreen(false); // Reset fullscreen state
    // We don't hide panorama instance itself anymore, just the container via isSvActive toggle
    // However, simulation.isActive sets isSvActive state usually in toggle? 
    // Wait, isSvActive was controlled via visibility button. 
    // We should probably hide the SV container when stopped?
    // No, maybe user wants to see it? Let's leave isSvActive state as is, 
    // but the simulation effect won't run.
    
    setIsCoachThinking(false);
    setCoachData(null);
    window.speechSynthesis.cancel();
  };

  const handleToggleSimulation = () => {
    setSimulation(prev => {
        const isActive = !prev.isActive;
        if (isActive) {
            // Restore heading/position
            if (route && route.path[prev.currentIndex]) {
                 const nextIdx = Math.min(prev.currentIndex + 1, route.path.length - 1);
                 const heading = google.maps.geometry.spherical.computeHeading(
                     route.path[prev.currentIndex], 
                     route.path[nextIdx]
                 );
                 setPanoramaView(route.path[prev.currentIndex], heading);
            }
            setIsSvFullScreen(true);
            setIsSvActive(true); // Ensure container is visible
        }
        return { ...prev, isActive };
    });
  };

  const calculateRoute = useCallback(async (
    targetMode?: TravelMode, 
    autoStart: boolean = false, 
    customOrigin?: string, 
    customDestination?: string, 
    customWaypoints?: {name: string, location: any}[]
  ) => {
    const activeMode = targetMode || mode;
    const finalOrigin = customOrigin || origin;
    const finalDestination = customDestination || destination;
    const activeWaypoints = customWaypoints || waypoints;

    if (!finalOrigin || !finalDestination) return;
    
    // Log calculateRoute call for debugging excessive API calls
    const routeCallTime = new Date().toISOString();
    const stackTrace = new Error().stack || '';
    const caller = stackTrace.split('\n')[2]?.trim() || 'unknown';
    const routeCallInfo = {
      timestamp: routeCallTime,
      origin: finalOrigin.substring(0, 50), // Truncate for readability
      destination: finalDestination.substring(0, 50),
      mode: activeMode,
      autoStart,
      hasWaypoints: activeWaypoints.length > 0,
      caller: caller
    };
    console.log('[CALCULATE_ROUTE_CALL]', JSON.stringify(routeCallInfo, null, 2));
    
    setLoading(true);
    setCoachData(null);
    setRouteSource(null);
    setElapsedTime(0);
    setCoveredDistance(0);
    lastCoachedIndex.current = -1;
    if (polylineOverlay.current) { polylineOverlay.current.setMap(null); polylineOverlay.current = null; }
    const ds = new google.maps.DirectionsService();
    const es = new google.maps.ElevationService();
    
    // PRIORITIZE COORDINATE REFS if they are set (and assume they match the current text intent)
    // If calculating from handleSetStart, originLocationRef was just set.
    // If calculating from manual input, refs should be null.
    const useOrigin = originLocationRef.current || finalOrigin;
    const useDest = destLocationRef.current || finalDestination;

    try {
      let path: any[] = [];
      let distText = '', durText = '';
      try {
        const result = await new Promise<any>((resolve, reject) => {
          ds.route({ 
            origin: useOrigin, 
            destination: useDest, 
            waypoints: activeWaypoints.map(wp => ({ location: wp.location, stopover: true })),
            optimizeWaypoints: true,
            travelMode: google.maps.TravelMode[activeMode] 
          }, (result: any, status: any) => {
            // Handle Directions API response status
            if (status === 'OK' && result) {
              resolve(result);
            } else {
              // ZERO_RESULTS is not an error - it means no route found, will fallback to OSRM
              if (status === 'ZERO_RESULTS') {
                console.info('[DIRECTIONS_API_ZERO_RESULTS]', {
                  timestamp: new Date().toISOString(),
                  status: status,
                  origin: finalOrigin.substring(0, 50),
                  destination: finalDestination.substring(0, 50),
                  message: 'No route found in Google Directions API. Falling back to OSRM...'
                });
              } else {
                // Log actual errors (403, etc.)
                console.error('[DIRECTIONS_API_STATUS_ERROR]', {
                  timestamp: new Date().toISOString(),
                  status: status,
                  origin: finalOrigin.substring(0, 50),
                  destination: finalDestination.substring(0, 50),
                  message: status === 'REQUEST_DENIED' 
                    ? '403 Forbidden - Check API key permissions and restrictions'
                    : `Directions API returned status: ${status}`
                });
              }
              reject(new Error(`Directions API error: ${status}`));
            }
          });
        });
        if (result.routes && result.routes[0]) {
          directionsRenderer.current?.setDirections(result);

          // Fix: Explicitly fit bounds for Google Routes so the camera moves to the route
          if (result.routes[0].bounds) {
             googleMap.current.fitBounds(result.routes[0].bounds);
          }

          path = result.routes[0].overview_path;
          let totalMeters = 0;
          result.routes[0].legs.forEach((leg: any) => { totalMeters += leg.distance.value; });
          distText = totalMeters >= 1000 ? `${(totalMeters/1000).toFixed(1)} km` : `${totalMeters} m`;
          let totalSecs = 0;
          result.routes[0].legs.forEach((leg: any) => { totalSecs += leg.duration.value; });
          durText = formatDurationSimple(totalSecs);
          setRouteSource('GOOGLE');
        }
      } catch (e) {
        // Log Directions API error for debugging
        const errorMessage = e instanceof Error ? e.message : String(e);
        const isZeroResults = errorMessage.includes('ZERO_RESULTS');
        
        if (isZeroResults) {
          // ZERO_RESULTS is expected - will use OSRM fallback
          console.info('[DIRECTIONS_API_FALLBACK]', {
            timestamp: new Date().toISOString(),
            origin: finalOrigin.substring(0, 50),
            destination: finalDestination.substring(0, 50),
            message: 'Google Directions API found no route. Using OSRM fallback...',
            fallingBackToOSRM: true
          });
        } else {
          // Actual error (403, network error, etc.)
          console.error('[DIRECTIONS_API_ERROR]', {
            timestamp: new Date().toISOString(),
            origin: finalOrigin.substring(0, 50),
            destination: finalDestination.substring(0, 50),
            error: errorMessage,
            fallingBackToOSRM: true
          });
        }
        
        // Safe geocoding helper that reuses LatLng object if available, or geocodes address
        const getCoord = async (val: any, addr: string) => {
            if (val && typeof val.lat === 'function') return val; // It's a Google LatLng object
            if (val && val.lat && val.lng) return new google.maps.LatLng(val.lat, val.lng); // It's a plain coord object
            
            return new Promise<any>((resolve, reject) => {
                geocoder.current.geocode({address: addr}, (results: any, status: any) => {
                    if (status === 'OK' && results && results[0]) {
                        resolve(results[0].geometry.location);
                    } else {
                        reject(status);
                    }
                });
            });
        }

        const originLatLng = await getCoord(useOrigin, finalOrigin);
        const destLatLng = await getCoord(useDest, finalDestination);
        
        // Resolve Waypoints (they store location objects already)
        // const wpLatLngs = await Promise.all(activeWaypoints.map(wp => geocodePromise(wp.name).catch(() => null))); 
        // Logic changed: waypoints are already objects with location. We can just use them.
        const wpLatLngs = activeWaypoints.map(wp => wp.location); 

        const profile = activeMode === TravelMode.BICYCLING ? 'cycling' : 'foot';
        
        const coords = [originLatLng, ...wpLatLngs, destLatLng].map(p => `${p.lng()},${p.lat()}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=polyline`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.code === 'Ok') {
          path = google.maps.geometry.encoding.decodePath(data.routes[0].geometry);
          distText = `${(data.routes[0].distance / 1000).toFixed(1)} km`;
          durText = formatDurationSimple(data.routes[0].duration);
          setRouteSource('OSRM');
          const b = new google.maps.LatLngBounds(); path.forEach(p => b.extend(p)); googleMap.current.fitBounds(b);
        }
      }
      if (path.length > 0) {
        // Log Elevation API call for debugging
        const elevationCallTime = new Date().toISOString();
        const elevationCallInfo = {
          timestamp: elevationCallTime,
          origin: finalOrigin,
          destination: finalDestination,
          pathLength: path.length,
          mode: activeMode,
          stackTrace: new Error().stack
        };
        console.log('[ELEVATION_API_CALL]', JSON.stringify(elevationCallInfo, null, 2));
        
        const elevationRes = await es.getElevationAlongPath({ path, samples: 100 });

        // Calculate physiological duration based on slope and user speed
        let calculatedSeconds = 0;
        const points = elevationRes.results;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const dist = google.maps.geometry.spherical.computeDistanceBetween(p1.location, p2.location);
            
            if (dist > 0) {
                const elevationChange = p2.elevation - p1.elevation;
                const grade = (elevationChange / dist) * 100;
                
                // Grade adjustments recommended by Fitness Expert
                let factor = 1.0;
                if (grade <= -6) factor = 1.35; // Steep descent
                else if (grade <= -3) factor = 1.25; // Descent
                else if (grade <= -1) factor = 1.10; // Mild descent
                else if (grade < 1) factor = 1.00; // Flat
                else if (grade < 3) factor = 0.85; // Mild ascent
                else if (grade < 6) factor = 0.70; // Ascent
                else factor = 0.50; // Steep ascent (> 6%)
                
                // V = V0 * factor
                const adjustedSpeedMs = (speedKmH * 1000 / 3600) * factor;
                calculatedSeconds += (dist / adjustedSpeedMs);
            }
        }
        
        durText = formatDurationSimple(calculatedSeconds);

        const densifiedPath = [];
        const segmentLength = 2;
        for (let i = 0; i < path.length - 1; i++) {
             const p1 = path[i];
             const p2 = path[i + 1];
             densifiedPath.push(p1);
             const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
             if (dist > segmentLength) {
                 const stepCount = Math.floor(dist / segmentLength);
                 const heading = google.maps.geometry.spherical.computeHeading(p1, p2);
                 for (let j = 1; j <= stepCount; j++) {
                     const nextPt = google.maps.geometry.spherical.computeOffset(p1, j * segmentLength, heading);
                     densifiedPath.push(nextPt);
                 }
             }
        }
        densifiedPath.push(path[path.length - 1]);
        if (startMarker.current) startMarker.current.setMap(null);
        if (endMarker.current) endMarker.current.setMap(null);
        waypointMarkers.current.forEach(m => m.setMap(null));
        waypointMarkers.current = [];
        startMarker.current = createCustomMarker(densifiedPath[0], 'A', '#3b82f6');
        endMarker.current = createCustomMarker(densifiedPath[densifiedPath.length - 1], 'B', '#ef4444');
        activeWaypoints.forEach((wp, idx) => {
            const m = createCustomMarker(wp.location, (idx + 1).toString(), '#f59e0b');
            waypointMarkers.current.push(m);
        });
        polylineOverlay.current = new google.maps.Polyline({ 
            path: densifiedPath, strokeColor: '#ff3020', strokeWeight: 5, clickable: false, map: googleMap.current 
        });
        setRoute({ origin: finalOrigin, destination: finalDestination, distance: distText, duration: durText, path: densifiedPath, elevation: elevationRes.results });
        lastRouteRequestRef.current = { origin: String(finalOrigin).trim(), destination: String(finalDestination).trim(), waypointNames: activeWaypoints.map(w => (w.name || '').trim()), mode: activeMode };

        // Progressive loading: pre-fetch first 200m (10m interval) for continuous display; rest loaded on-demand
        (async () => {
          setAppPhase('PREPARING');
          setPreparingProgress({ k: 0, n: 1 });
          const panoData = await preFetchStreetViewData(
            densifiedPath,
            (k, n) => setPreparingProgress({ k, n }),
            { maxDistanceM: 200, intervalM: 10 }
          );
          setPreparingProgress(null);
          setRoute((prev) => (prev ? { ...prev, panoData } : null));
          setAppPhase('IDLE');

          if (autoStart) {
            setSimulation({ isActive: true, currentIndex: 0, speed: 100 });
            setAppPhase('RUNNING');
            setIsSvFullScreen(true);
            setIsSvActive(true);
            const pathLen = densifiedPath.length;
            const elevLen = elevationRes.results.length;
            const segmentSize = Math.min(20, elevLen);
            const upcomingSlice = elevationRes.results.slice(0, segmentSize);
            if (upcomingSlice.length > 0) {
              setIsCoachThinking(true);
              try {
                const { coaching, validUntilPathIndex } = await getPredictiveCoaching(upcomingSlice, pathLen, elevLen, 0, speedKmH);
                setCoachData(coaching);
                setRoute((prev) => prev ? { ...prev, cachedCoaching: [{ coaching, validUntilPathIndex }] } : null);
                getCourseBriefing({ origin: finalOrigin, destination: finalDestination, distance: distText, duration: durText, path: densifiedPath, elevation: elevationRes.results }).then(speak);
              } finally {
                setIsCoachThinking(false);
              }
            }
            lastCoachedIndex.current = 0;
            const firstPano = panoData.length > 0 ? panoData[0] : null;
            if (firstPano) setPanoramaViewByPanoId(firstPano.panoId, firstPano.heading);
            else {
              const startPos = densifiedPath[0];
              const heading = google.maps.geometry.spherical.computeHeading(startPos, densifiedPath.length > 1 ? densifiedPath[1] : startPos);
              setPanoramaView(startPos, heading);
            }
          }
        })();
      }
    } catch (err) { 
      console.error('[CALCULATE_ROUTE_FINAL_ERROR]', {
        timestamp: new Date().toISOString(),
        origin: finalOrigin.substring(0, 50),
        destination: finalDestination.substring(0, 50),
        error: err instanceof Error ? err.message : String(err)
      });
      alert("경로를 찾을 수 없습니다."); 
    }
    finally { setLoading(false); }
  }, [origin, destination, waypoints, mode, speedKmH, setPanoramaView, preFetchStreetViewData, setPanoramaViewByPanoId]);

  /** Start simulation using existing route (no Directions/Elevation). Used when Go is clicked after 경로탐색 with same inputs. */
  const startSimulationOnly = useCallback(async (currentRoute: RouteInfo) => {
    setElapsedTime(0);
    setCoveredDistance(0);
    lastCoachedIndex.current = -1;
    setSimulation({ isActive: true, currentIndex: 0, speed: 100 });
    setAppPhase('RUNNING');
    setIsSvFullScreen(true);
    setIsSvActive(true);
    const pathLen = currentRoute.path.length;
    const elevLen = currentRoute.elevation.length;
    const segmentSize = Math.min(20, elevLen);
    const upcomingSlice = currentRoute.elevation.slice(0, segmentSize);
    if (upcomingSlice.length > 0) {
      setIsCoachThinking(true);
      try {
        const { coaching, validUntilPathIndex } = await getPredictiveCoaching(upcomingSlice, pathLen, elevLen, 0, speedKmH);
        setCoachData(coaching);
        setRoute((prev) => (prev ? { ...prev, cachedCoaching: [{ coaching, validUntilPathIndex }] } : null));
        getCourseBriefing(currentRoute).then(speak);
      } finally {
        setIsCoachThinking(false);
      }
    }
    lastCoachedIndex.current = 0;
    const firstPano = currentRoute.panoData && currentRoute.panoData.length > 0 ? currentRoute.panoData[0] : null;
    if (firstPano) setPanoramaViewByPanoId(firstPano.panoId, firstPano.heading);
    else {
      const startPos = currentRoute.path[0];
      const heading = pathLen > 1
        ? google.maps.geometry.spherical.computeHeading(startPos, currentRoute.path[1])
        : 0;
      setPanoramaView(startPos, heading);
    }
  }, [speedKmH, setPanoramaView, setPanoramaViewByPanoId]);

  const handleSetStart = () => {
    if (clickedLocation) {
      const newOrigin = clickedLocation.name || clickedLocation.address;
      setOrigin(newOrigin);
      originLocationRef.current = clickedLocation.location; // CAPTURE EXACT COORDINATES
      
      if (startMarker.current) startMarker.current.setMap(null);
      startMarker.current = createCustomMarker(clickedLocation.location, 'A', '#3b82f6');

      setClickedLocation(null);
    }
  };

  const handleSetEnd = () => {
    if (clickedLocation) {
      const newDest = clickedLocation.name || clickedLocation.address;
      setDestination(newDest);
      destLocationRef.current = clickedLocation.location; // CAPTURE EXACT COORDINATES

      if (endMarker.current) endMarker.current.setMap(null);
      endMarker.current = createCustomMarker(clickedLocation.location, 'B', '#ef4444');

      setClickedLocation(null);
    }
  };

  const handleSwapEndpoints = () => {
    const tempOrigin = origin;
    const newOrigin = destination;
    const newDestination = tempOrigin;
    const newWaypoints = [...waypoints].reverse();

    // SWAP EXACT COORDINATES
    const tempLoc = originLocationRef.current;
    originLocationRef.current = destLocationRef.current;
    destLocationRef.current = tempLoc;

    setOrigin(newOrigin);
    setDestination(newDestination);
    setWaypoints(newWaypoints);
  };

  const handleAddWaypoint = () => {
    if (clickedLocation && waypoints.length < 3) {
      const wpName = clickedLocation.name || clickedLocation.address;
      const newWaypoints = [...waypoints, { name: wpName, location: clickedLocation.location }];
      setWaypoints(newWaypoints);

      const m = createCustomMarker(clickedLocation.location, (waypoints.length + 1).toString(), '#f59e0b');
      waypointMarkers.current.push(m);

      setClickedLocation(null);
    }
  };

  const handleRemoveWaypoint = (idx: number) => {
    const newWaypoints = waypoints.filter((_, i) => i !== idx);
    setWaypoints(newWaypoints);
    
    // Immediately remove marker and re-index visual markers
    if (waypointMarkers.current[idx]) {
        waypointMarkers.current[idx].setMap(null);
        waypointMarkers.current.splice(idx, 1);
        waypointMarkers.current.forEach((m, i) => {
            m.setLabel({ text: (i + 1).toString(), color: 'white', fontWeight: 'bold', fontSize: '14px' });
        });
    }

  };

  const handleRemoveStart = () => {
    setOrigin('');
    originLocationRef.current = null;
    if (startMarker.current) {
      startMarker.current.setMap(null);
      startMarker.current = null;
    }
  };

  const handleRemoveEnd = () => {
    setDestination('');
    destLocationRef.current = null;
    if (endMarker.current) {
      endMarker.current.setMap(null);
      endMarker.current = null;
    }
  };
  
  const handlePlaceSearch = (term?: string) => {
      const query = term || searchTerm;
      if (!query) return;

      if (!placesService.current && googleMap.current) {
          placesService.current = new google.maps.places.PlacesService(googleMap.current);
      }

      if (placesService.current) {
          placesService.current.findPlaceFromQuery({
              query: query,
              fields: ['name', 'geometry', 'formatted_address']
          }, (results: any, status: any) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
                  const place = results[0];
                  if (place.geometry && place.geometry.location) {
                      googleMap.current.setCenter(place.geometry.location);
                      googleMap.current.setZoom(16);
                      if (searchMarkerRef.current) {
                          searchMarkerRef.current.setMap(null);
                          searchMarkerRef.current = null;
                      }
                      searchMarkerRef.current = createCustomMarker(
                          place.geometry.location,
                          'P',
                          '#22c55e'
                      );
                      setClickedLocation({
                          lat: place.geometry.location.lat(),
                          lng: place.geometry.location.lng(),
                          name: place.name,
                          address: place.formatted_address || query,
                          elevation: null,
                          location: place.geometry.location
                      });

                      setRecentPlaceSearches(prev => {
                          const filtered = prev.filter(item => item !== query);
                          const updated = [query, ...filtered].slice(0, 5);
                          localStorage.setItem('recent_places', JSON.stringify(updated));
                          return updated;
                      });
                      setSearchTerm(query);
                  }
              }
          });
      }
  };

  const handlePlaceHistoryClick = (term: string) => {
      setSearchTerm(term);
      handlePlaceSearch(term);
  };

  const handleClearSearch = () => {
      setSearchTerm('');
      setClickedLocation(null);
      if (searchMarkerRef.current) {
          searchMarkerRef.current.setMap(null);
          searchMarkerRef.current = null;
      }
  };
  
  const handleToggleMapType = () => {
    if (googleMap.current) {
        const currentType = googleMap.current.getMapTypeId();
        const newType = currentType === 'roadmap' ? 'hybrid' : 'roadmap';
        googleMap.current.setMapTypeId(newType);
        setMapType(newType);
    }
  };

  const isSaved = isCurrentRouteSaved();

  return (
    <div className="fixed inset-0 bg-slate-900 overflow-hidden font-sans">
      
      {/* Street View Container - Replaced single Ref with Dual Refs */}
      <div ref={svContainerRef} className={`bg-black transition-all duration-500 ease-in-out ${isSvActive ? (isSvFullScreen ? 'absolute inset-0 z-40 opacity-100' : 'absolute top-0 left-0 right-0 h-[50%] z-20 opacity-100 border-b-2 border-slate-700') : 'absolute top-0 left-0 w-full h-0 opacity-0 pointer-events-none z-0'}`}>
         {/* Panorama 1: Z-Index 10 when not active, 20 when active */}
         <div ref={svRef1} className={`absolute inset-0 transition-opacity duration-300 ${visiblePanoIdx === 0 ? 'z-20 opacity-100' : 'z-10'}`} />
         {/* Panorama 2: Z-Index 10 when not active, 20 when active */}
         <div ref={svRef2} className={`absolute inset-0 transition-opacity duration-300 ${visiblePanoIdx === 1 ? 'z-20 opacity-100' : 'z-10'}`} />
      </div>

      {appPhase === 'PREPARING' && preparingProgress && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[55] pointer-events-none">
          <div className="bg-slate-800/90 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl shadow-xl">
            <span className="text-white font-bold text-sm">Preparing Street View... ({preparingProgress.k}/{preparingProgress.n})</span>
          </div>
        </div>
      )}
      {isSvActive && showSvWarning && (
        <div className={`absolute left-4 z-[45] flex items-center justify-start pointer-events-none ${isSvFullScreen ? 'bottom-32' : 'top-[42%]'}`}>
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2 shadow-xl animate-in fade-in zoom-in duration-300">
             <ShieldAlert size={18} className="text-amber-500 animate-pulse" />
             <span className="text-white font-bold text-xs">No Street View available for this section.</span>
          </div>
        </div>
      )}
      <div ref={mapRef} className={`transition-all duration-500 ease-in-out ${isSvFullScreen ? "absolute top-4 left-4 w-40 h-40 z-50 rounded-3xl border-4 border-white shadow-2xl overflow-hidden" : (isSvActive ? "absolute bottom-0 left-0 right-0 h-[50%] z-10" : "absolute inset-0 z-10")}`} />
      {simulation.isActive && coachData && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[70] w-full max-w-[60%] pointer-events-none flex justify-center">
          <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2 shadow-2xl flex items-center justify-center animate-in fade-in slide-in-from-top-4 duration-500">
             <p className="text-white font-medium text-sm leading-snug text-center line-clamp-2">{coachData.tip}</p>
          </div>
        </div>
      )}
      
      {/* Map Style Button - Moved Left */}
      <div className="absolute right-20 top-4 z-50">
        <button onClick={handleToggleMapType} title="Change Map Style" className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${mapType === 'hybrid' ? 'bg-slate-800 text-white' : 'bg-white text-slate-400'}`}>
            <Layers size={24} />
        </button>
      </div>

      {/* Main Control Group - Shifted Up by removing first element */}
      <div className="absolute right-4 top-4 z-50 flex flex-col gap-2">
        <button onClick={() => setShowCoverage(!showCoverage)} title={showCoverage ? "Hide Coverage Layer" : "Show Coverage Layer"} className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${showCoverage ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}>
            <RouteIcon size={24} />
        </button>
        <button onClick={() => setIsSvActive(!isSvActive)} title={isSvActive ? "Hide Street View" : "Show Street View"} className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${isSvActive ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-400'}`}>
            <img src={PEGMAN_ICON} alt="Street View" className="w-6 h-6 object-contain" />
        </button>
        {isSvActive && (
            <button onClick={() => setIsSvFullScreen(!isSvFullScreen)} title={isSvFullScreen ? "Minimize View" : "Maximize View"} className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center bg-white text-slate-900`}>
                {isSvFullScreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
            </button>
        )}
      </div>

      <div className={`absolute top-4 left-4 z-[80] flex flex-col items-start transition-all duration-300 ease-out bg-white/95 backdrop-blur-md shadow-2xl overflow-hidden ${searchExpanded ? 'w-[300px] max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200' : 'w-12 h-12 rounded-full border-2 border-blue-600 group'}`}>
        <div className="flex items-center w-full h-12 pr-5 shrink-0">
          <button onClick={() => setSearchExpanded(!searchExpanded)} title="Search Places" className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-slate-500 hover:text-blue-600">{searchExpanded ? <ChevronLeft size={20} /> : <Search size={20} />}</button>
          <input type="text" placeholder="Search place..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePlaceSearch()} className="flex-1 bg-transparent border-none outline-none text-slate-900 font-bold text-[12px] pr-2" />
          {searchTerm && (
            <button onClick={handleClearSearch} title="Clear Search" className="flex-shrink-0 w-8 h-full flex items-center justify-center text-slate-400 hover:text-red-500">
               <X size={14} />
            </button>
          )}
        </div>
        {searchExpanded && recentPlaceSearches.length > 0 && (
          <div className="w-full flex flex-col px-2 pb-2 gap-1 border-t border-slate-100">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-1 mt-1">Recent</span>
            {recentPlaceSearches.map((term, idx) => (
              <button key={idx} onClick={() => handlePlaceHistoryClick(term)} className="text-left w-full truncate text-[11px] text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded px-1 py-1 transition-colors flex items-center gap-2"><History size={10} className="text-slate-400"/>{term}</button>
            ))}
          </div>
        )}
      </div>
      <div className={`absolute bottom-4 left-4 z-[60] flex items-end transition-all duration-300 ease-out overflow-hidden ${routeInputExpanded ? (historyExpanded ? 'w-[598px] min-w-[598px] max-w-[598px]' : 'w-[300px] min-w-[300px] max-w-[300px]') : 'w-12 h-12 border-2 border-blue-600 rounded-full group'}`}>
        <div className={`bg-white/95 backdrop-blur-md rounded-[1.5rem] shadow-2xl flex flex-row w-full border border-slate-200 p-2 relative ${routeInputExpanded ? 'min-h-[140px]' : 'h-full'}`}>
          <button onClick={() => setRouteInputExpanded(!routeInputExpanded)} title="Route Settings" className={`absolute left-0 top-0 w-8 h-full flex items-center justify-center text-slate-400 hover:text-slate-600 z-10 ${!routeInputExpanded ? 'w-full' : ''}`}>{routeInputExpanded ? <ChevronLeft size={20} /> : <Waypoints size={20} className="text-blue-600" />}</button>
          {routeInputExpanded && (
            <div className="flex flex-row w-full pl-6 gap-3">
                <div className="flex-none w-[232px] flex flex-col justify-center gap-1.5">
                    <div className="relative flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 h-7 bg-white shadow-sm w-full">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                            <input className="flex-1 w-full text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate min-w-0" placeholder="Start" value={origin} onChange={(e) => { setOrigin(e.target.value); originLocationRef.current = null; }} />
                            <button onClick={handleRemoveStart} title="Remove Start" className="text-slate-400 hover:text-red-500 shrink-0">
                                <X size={10} />
                            </button>
                        </div>
                        {/* Waypoints Render */}
                        {waypoints.length > 0 && (
                            <div className="flex flex-col gap-1 px-1">
                                {waypoints.map((wp, idx) => (
                                    <div key={idx} className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 h-6 bg-slate-50 shadow-inner w-full">
                                        <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0 flex items-center justify-center text-[7px] text-white font-black">{idx + 1}</div>
                                        <span className="flex-1 text-[9px] text-slate-500 font-bold truncate tracking-tighter">{wp.name}</span>
                                        <button onClick={() => handleRemoveWaypoint(idx)} title="Remove Waypoint" className="text-slate-400 hover:text-red-500 shrink-0">
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 h-7 bg-white shadow-sm w-full">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
                            <input className="flex-1 w-full text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate min-w-0" placeholder="End" value={destination} onChange={(e) => { setDestination(e.target.value); destLocationRef.current = null; }} />
                            <button onClick={handleRemoveEnd} title="Remove End" className="text-slate-400 hover:text-red-500 shrink-0">
                                <X size={10} />
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 w-full px-0.5">
                         <span className="text-[9px] font-bold text-slate-400 uppercase">Speed</span>
                         <input type="number" min="10" max="100" value={speedKmH} onChange={(e) => setSpeedKmH(Number(e.target.value))} className="w-8 h-5 text-[10px] font-bold text-center bg-slate-50 border border-slate-300 rounded text-slate-700 focus:outline-none focus:border-blue-500 p-0 shrink-0" />
                         <input type="range" min="10" max="100" step="1" value={speedKmH} onChange={(e) => setSpeedKmH(Number(e.target.value))} className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                         <div className="flex items-center gap-1 ml-auto shrink-0">
                             <button onClick={handleSwapEndpoints} title="Swap Origin & Destination" className="w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-95 transition-transform"><ArrowUpDown size={12} className="text-slate-600" /></button>
                             
                             <button onClick={handleToggleFavorite} title={isSaved ? "My Routes" : "Add to Favorites"} className={`w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-95 transition-transform ${isSaved ? 'border-amber-200' : ''}`}>
                                <Star size={12} className={isSaved ? "text-amber-400 fill-amber-400" : "text-slate-400"} />
                             </button>

                             <button onClick={clearMapOverlays} title="Delete Route" className="w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-95 transition-transform"><Trash2 size={12} className="text-slate-600" /></button>
                         </div>
                    </div>
                    <div className="flex items-center gap-1.5 w-full">
                        <div className="flex-1 min-w-0 max-w-[88px] flex items-center justify-center gap-1 bg-slate-100 border border-slate-200 rounded-lg h-7 px-1 overflow-hidden">
                            <span className="text-[10px] font-black text-slate-700 truncate">{route ? route.distance : '0.0 km'}</span>
                            <div className="h-3 w-px bg-slate-300 shrink-0"></div>
                            <span className="text-[10px] font-bold text-slate-500 truncate">{route ? route.duration : '0:00'}</span>
                        </div>
                        <button onClick={() => calculateRoute(mode, false)} title="Search Route" disabled={loading || !origin || !destination} className="w-7 h-7 rounded-full bg-slate-100 border-2 border-red-500 flex items-center justify-center shrink-0 hover:bg-slate-200 active:scale-95 transition-transform text-slate-600">
                            <Search size={14} />
                        </button>
                        <button onClick={() => { if (route && lastRouteRequestRef.current && inputsMatch(origin, destination, waypoints, mode, lastRouteRequestRef.current)) { startSimulationOnly(route); } else { calculateRoute(mode, true); } }} title="Go" disabled={loading || !origin || !destination} className="w-20 bg-blue-700 text-white rounded-lg h-7 text-xs font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center shrink-0">{loading ? <Activity size={14} className="animate-spin" /> : 'Go'}</button>
                    </div>
                </div>
                
                <button 
                  onClick={() => setHistoryExpanded(!historyExpanded)}
                  title={historyExpanded ? "Collapse My Routes" : "Expand My Routes"}
                  className="w-4 shrink-0 flex items-center justify-center p-0 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  {historyExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>

                <div className={`flex-1 border-l border-slate-200 pl-2 flex flex-col justify-center gap-0.5 overflow-hidden transition-all duration-300 ease-in-out ${historyExpanded ? 'opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-2 pointer-events-none p-0 border-none'}`}>
                    <div className="flex justify-between items-center px-1 mb-1">
                         <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">My Routes</span>
                         <span className="text-[9px] text-slate-300 font-medium">{favoriteRoutes.length}/5</span>
                    </div>
                    {favoriteRoutes.length > 0 ? favoriteRoutes.map((route) => (
                        <div key={route.id} className="group/item flex items-center justify-between w-full hover:bg-slate-50 rounded px-1 py-0.5 transition-colors">
                            <button onClick={() => handleLoadFavorite(route)} title={`${route.origin} -> ${route.destination}`} className="text-left flex-1 truncate text-[10px] text-slate-600 hover:text-blue-600 leading-tight">
                                <span className="font-bold mr-1">{route.origin}</span>
                                <span className="text-slate-400">to</span>
                                <span className="font-bold ml-1">{route.destination}</span>
                                {route.waypoints.length > 0 && <span className="ml-1 text-[8px] text-amber-500 font-bold">+{route.waypoints.length}</span>}
                            </button>
                            <button onClick={(e) => handleDeleteFavorite(route.id, e)} className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"><X size={10} /></button>
                        </div>
                    )) : (<div className="text-[10px] text-slate-400 text-center italic mt-2">No saved routes</div>)}
                </div>
            </div>
          )}
        </div>
      </div>
      {route && (
        <div className={`absolute bottom-4 z-[50] flex items-end justify-end transition-all duration-300 ease-out ${elevationExpanded ? 'right-4 w-[80%] max-w-[288px]' : 'right-16 w-12 h-12 group'}`}>
          <div className="bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl flex items-center w-full border border-slate-200 p-1 overflow-hidden">
            <button onClick={() => setElevationExpanded(!elevationExpanded)} title="Elevation Profile" className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-blue-600 order-last">{elevationExpanded ? <ChevronRight size={20} /> : <AreaChartIcon size={20} />}</button>
            {elevationExpanded && (
              <div className="flex-1 pl-3 pr-0 py-1 flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                         <h2 className="text-slate-900 font-black text-sm tracking-tighter truncate">{route.distance}</h2>
                         {simulation.isActive && (<div className="flex flex-col justify-center items-start leading-none ml-1"><span className="text-[10px] text-blue-600 font-bold animate-pulse">{(coveredDistance / 1000).toFixed(1)}km</span><span className="text-[10px] text-blue-600 font-bold animate-pulse">{formatTime(elapsedTime)}</span></div>)}
                    </div>
                    <p className="text-slate-400 text-[7px] font-black uppercase tracking-widest truncate">{routeSource} ROUTE</p>
                  </div>
                  <div className="flex gap-1 items-center shrink-0">
                    <button onClick={restartSimulation} title="Restart Simulation" className="w-8 h-8 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-slate-200"><RotateCcw size={14} /></button>
                    <button onClick={handleToggleSimulation} title={simulation.isActive ? "Pause Simulation" : "Start Simulation"} className={`w-8 h-8 rounded-xl flex items-center justify-center ${simulation.isActive ? 'bg-amber-100 text-amber-600' : 'bg-blue-600 text-white'}`}>{simulation.isActive ? <Pause size={12} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
                    <button onClick={handleStopSimulation} title="Stop Simulation" className="w-8 h-8 bg-red-100 text-red-600 rounded-xl flex items-center justify-center hover:bg-red-200">
                      <Square size={14} fill="currentColor" />
                    </button>
                  </div>
                </div>
                <div className="h-10 w-full bg-slate-900 rounded-xl p-1 relative overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%"><AreaChart data={route.elevation} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}><Area type="monotone" dataKey="elevation" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} isAnimationActive={false} /><ReferenceLine x={Math.floor((simulation.currentIndex / route.path.length) * (route.elevation.length - 1))} stroke="#ffffff" /></AreaChart></ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {clickedLocation && (
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 z-50 w-[85%] max-w-[300px]">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-slate-200 relative">
            <button onClick={() => setClickedLocation(null)} title="Close" className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1.5"><X size={10}/></button>
            <p className="text-slate-800 text-[12px] font-bold truncate">{clickedLocation.name}</p>
            <p className="text-slate-500 text-[10px] mb-2 truncate">{clickedLocation.address}</p>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              <button onClick={handleSetStart} title="Set as Start" className="py-2 bg-blue-50 text-blue-700 rounded-xl text-[9px] font-black tracking-tighter uppercase">START (A)</button>
              <button onClick={handleAddWaypoint} disabled={waypoints.length >= 3} title="Add Waypoint" className={`py-2 rounded-xl text-[9px] font-black tracking-tighter uppercase flex items-center justify-center gap-0.5 ${waypoints.length >= 3 ? 'bg-slate-100 text-slate-400' : 'bg-amber-50 text-amber-700'}`}>
                  <Plus size={10}/> WAYPOINT ({waypoints.length}/3)
              </button>
              <button onClick={handleSetEnd} title="Set as Destination" className="py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black tracking-tighter uppercase">END (B)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
