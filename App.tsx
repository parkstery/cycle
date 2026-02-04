
import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Navigation, Play, Pause, RotateCcw, Trash2, X, MapPin, Target, Volume2, AreaChart as AreaChartIcon, ChevronRight, ChevronLeft, History, Info, Route as RouteIcon, Zap, Activity, ShieldAlert, Bike, Footprints, Car, Maximize2, Minimize2, Waypoints, ArrowUpDown, Plus, CheckCircle2, Layers, Star, Square, Mic, Music } from 'lucide-react';
const ElevationChartView = lazy(() => import('./ElevationChartView'));
import { RouteInfo, TravelMode, SimulationState, CoachingData, SavedRoute, PanoDataItem, AppPhase, CachedCoachingItem } from './types';
import { getAdvancedCoaching, getPredictiveCoaching, getCourseBriefing, getRideEncouragement } from './services/aiCoach';
import * as nominatim from './services/nominatim';
import * as openElevation from './services/openElevation';
import { decodePath, computeDistanceBetween, computeHeading, computeOffset } from './services/geoUtils';
declare var google: any;
// 자동배포문제..
// 거리뷰 버튼 아이콘 (옵션: streetview-icon-option-a.png | b | c)
const STREETVIEW_ICON = '/streetview/streetview-icon-option-c.png';

const PLAYLIST = [  
  "https://www.dropbox.com/scl/fi/oq5lnyyc41rxso4kgm6en/1.mp3?rlkey=1j6uj6kxtu833jrljqz5qa0wx&st=ig1goyal&raw=1",
  "https://www.dropbox.com/scl/fi/qduirdh7mt24ucms1jn32/.mp3?rlkey=09o1232kpdahjlsns95ppbhrc&st=hsarn2s1&raw=1",
  "https://www.dropbox.com/scl/fi/8fbdd1t6v18z2m17ecidt/1.mp3?rlkey=sm15ow3aun8az4z6y2vseefy0&st=kbmlsn1m&raw=1",
  "https://www.dropbox.com/scl/fi/bvtw5s1pimhv42k3bgdxh/.mp3?rlkey=6ujd668vw7kzioe277gkqvsq7&st=cq1x65f8&raw=1",
  "https://www.dropbox.com/scl/fi/j1hzv2yx22uc0xl9redbj/1.mp3?rlkey=vjay2iyw06u84gygzxcoatz9w&st=9so3eh5n&raw=1",
  "https://www.dropbox.com/scl/fi/2avdaszs6csfvocofa9l9/.mp3?rlkey=ssqfzfmapfa3kkrqdifazbmoj&st=h4pfgwtr&raw=1",
  "https://www.dropbox.com/scl/fi/gcdfjs66qadt5jinkmou4/EG.mp3?rlkey=sb88y1sinjseqslsdqb385jod&st=vn1vnzqb&raw=1",
  "https://www.dropbox.com/scl/fi/s6fqpav6yuy8jt7i5kz9d/.mp3?rlkey=gtvqcypwwmltf1wfk6m5nwfht&st=kea9s4nx&raw=1",
  "https://www.dropbox.com/scl/fi/5rlpfefbfqz94zhqcahgn/1.mp3?rlkey=v393xy7ky2xq26ilyq37z7bks&st=5wol32h6&raw=1",
  "https://www.dropbox.com/scl/fi/y4hep3u8j0b3f9w9el5ww/.mp3?rlkey=6khecb5dsfie7n9snis93b7ir&st=f4k7d6we&raw=1",
];

/**
 * getPanorama with fallback: try GOOGLE first, then DEFAULT (includes user Photo Spheres).
 * Returns { data, usedFallback }. usedFallback true when DEFAULT was used.
 */
const getPanoramaWithFallback = (
    service: any,
    opts: { location: any; radius: number; preference?: any }
): Promise<{ data: any; usedFallback: boolean }> => {
    return new Promise((resolve) => {
        service.getPanorama({
            location: opts.location,
            radius: opts.radius,
            source: google.maps.StreetViewSource.GOOGLE,
            preference: opts.preference ?? google.maps.StreetViewPreference.NEAREST
        }, (data: any, status: string) => {
            if (status === 'OK' && data?.location?.pano) {
                resolve({ data, usedFallback: false });
                return;
            }
            service.getPanorama({
                location: opts.location,
                radius: opts.radius,
                source: google.maps.StreetViewSource.DEFAULT,
                preference: opts.preference ?? google.maps.StreetViewPreference.NEAREST
            }, (fallbackData: any, fallbackStatus: string) => {
                if (fallbackStatus === 'OK' && fallbackData?.location?.pano) {
                    resolve({ data: fallbackData, usedFallback: true });
                } else {
                    resolve({ data: null, usedFallback: false });
                }
            });
        });
    });
};

// Helper to wrap getPanorama in a Promise (no direction filter); uses GOOGLE then DEFAULT fallback
const findStreetView = (
    service: any,
    location: any,
    radius: number
): Promise<{ data: any; usedFallback: boolean } | null> => {
    return getPanoramaWithFallback(service, { location, radius }).then(({ data, usedFallback }) => {
        if (data) return { data, usedFallback };
        return null;
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
 * GOOGLE 먼저 시도, 없으면 DEFAULT(사용자 파노라마 포함) 폴백.
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
    return getPanoramaWithFallback(service, {
        location: pathPoint,
        radius,
        preference: google.maps.StreetViewPreference.NEAREST
    }).then(({ data, usedFallback }) => {
        if (!data?.location?.pano) return null;
        const driveHeading = computeHeading(pathPoint, pathNext);
        const panoLatLng = data.location.latLng;
        const bearingToPano = computeHeading(pathPoint, panoLatLng);
        const angleDiff = Math.abs(normalizeAngleDiff(bearingToPano - driveHeading));
        if (angleDiff > maxAngleDeg) return null;
        const nextIdx = Math.min(pathIndex + 10, path.length - 1);
        const heading = computeHeading(pathPoint, path[nextIdx]);
        return {
            pathIndex,
            panoId: data.location.pano,
            location: data.location.latLng,
            heading,
            isUserPhoto: usedFallback
        };
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

  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletPolylineRef = useRef<L.Polyline | null>(null);
  /** 노선 coverage 레이어: 사용자가 경로 선택 대상을 보기 위한 도로/자전거 노선 (Coverage 버튼으로 켜고 끔) */
  const leafletCoverageLayerRef = useRef<L.TileLayer | null>(null);
  const leafletMarkersRef = useRef<L.Layer[]>([]);
  const simulationMarker = useRef<L.Marker | null>(null);
  const startMarker = useRef<L.Marker | null>(null);
  const endMarker = useRef<L.Marker | null>(null);
  const waypointMarkers = useRef<L.Marker[]>([]);
  const tempMarker = useRef<L.Marker | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const svServiceRef = useRef<any>(null); 
  const svErrorCount = useRef(0);
  const isSvSearching = useRef(false); // Semaphore to prevent overlapping SV searches
  const isSegmentFetchingRef = useRef(false); // Prevent overlapping on-demand segment fetches
  /** Street View 표시용 path index: 시뮬 속도와 분리해 최대 60 km/h로만 진행해 고속에서도 거리뷰가 부드럽게 전환되도록 함 */
  const svDisplayPathIndexRef = useRef(0);
  const lastSvDisplayUpdateRef = useRef(0);
  /** 마지막으로 표시한 파노의 pathIndex — 더 작은 인덱스로 갱신해 후진처럼 보이는 현상 방지 */
  const lastDisplayedPanoPathIndexRef = useRef(-1);
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
  const [showCoverage, setShowCoverage] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [svStatus, setSvStatus] = useState<string>('OK');
  const [showSvWarning, setShowSvWarning] = useState(false);
  const [isUserPano, setIsUserPano] = useState(false); // true when showing user-contributed panorama (fallback)
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
  const [coachingOn, setCoachingOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);

  // Input States
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState<{name: string, location: any}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isLeafletReady, setIsLeafletReady] = useState(false);
  const [isMapsApiLoaded, setIsMapsApiLoaded] = useState(false);
  const [mapRevealed, setMapRevealed] = useState(false);

  // Traffic optimization: phase (PREPARING = API allowed, RUNNING = cache only)
  const [appPhase, setAppPhase] = useState<AppPhase>('IDLE');
  const [preparingProgress, setPreparingProgress] = useState<{ k: number; n: number } | null>(null);
  const lastPanToTime = useRef<number>(0);

  // Go 버튼 클릭 시 4초 카운트다운 (3, 2, 1, Start!) — 로딩 대기 시간 활용
  const [countdown, setCountdown] = useState<3 | 2 | 1 | 'start' | null>(null);
  const countdownDoneRef = useRef<(() => void) | null>(null);

  // Favorites (My Routes) State
  const [favoriteRoutes, setFavoriteRoutes] = useState<SavedRoute[]>(() => {
    const saved = localStorage.getItem('favorite_routes');
    if (saved) return JSON.parse(saved);
    
    // Default Routes if nothing saved
    return [
      {
        id: "def-seoul",
        origin: "대한민국 서울특별시 강남구 압구정동 384-2",
        destination: "대한민국 서울특별시 용산구 한남동 784-1",
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
        id: "def-florence",
        origin: "Borgo S. Lorenzo, 5 R, 50123 Firenze FI, 이탈리아",
        destination: "Piazza di Santa Croce, 21, 50122 Firenze FI, 이탈리아",
        waypoints: [],
        timestamp: Date.now()
      },
      {
        id: "def-greece",
        origin: "F96M+QX Oia, 그리스",
        destination: "F9HJ+VJ Ia, 그리스",
        waypoints: [],
        timestamp: Date.now()
      },
      {
        id: "def-egypt",
        origin: "X4FC+7H Al Haram, 이집트",
        destination: "X4HM+V4 Al Haram, 이집트",
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
      getPanoramaWithFallback(svServiceRef.current, { location, radius: 50 }).then(({ data, usedFallback }) => {
          if (!data?.location) return;
          setIsUserPano(usedFallback);
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
              // Leaflet map: no setStreetView
          };

          nextPano.setOptions({
              pano: newPanoId,
              pov: { heading, pitch: 0 },
              visible: true
          });

          scheduleSwapAfterOk(nextPano, nextIdx, doSwap);
      });
  }, [scheduleSwapAfterOk]);

  /**
   * 거리뷰 표시: 내부적으로 계산된 각도(heading)를 적용한 뒤 스왑하여 보여줌.
   * isUserPhoto: 사용자 제작 이미지 여부(배지 표시용).
   */
  const setPanoramaViewByPanoId = useCallback((panoId: string, heading: number, isUserPhoto?: boolean) => {
    setIsUserPano(!!isUserPhoto);
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
      // Leaflet map: no setStreetView
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
      cumDist[i] = cumDist[i - 1] + computeDistanceBetween(path[i - 1], path[i]);
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
        if (fallback?.data?.location?.pano) {
          const heading = computeHeading(pathPoint, pathNext);
          item = {
            pathIndex,
            panoId: fallback.data.location.pano,
            location: fallback.data.location.latLng,
            heading,
            isUserPhoto: fallback.usedFallback
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

  // 2초 후 맵 영역 노출 — 타일 로드 문제 방지를 위해 먼저 노출 후 맵 생성
  useEffect(() => {
    const t = window.setTimeout(() => setMapRevealed(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Leaflet 맵 생성: mapRevealed가 true가 된 뒤(컨테이너가 보일 때) 한 번만 생성
  useEffect(() => {
    if (!mapRevealed || !mapRef.current || leafletMapRef.current) return;
    let map: L.Map | null = null;
    const rafId = requestAnimationFrame(() => {
      if (!mapRef.current || leafletMapRef.current) return;
      try {
        map = L.map(mapRef.current).setView([37.5512, 126.9882], 14);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
          minZoom: 2,
        }).addTo(map);
        const coverageLayer = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &amp; <a href="https://github.com/cyclosm/cyclosm-cartocss-style">CyclOSM</a>',
          maxZoom: 19,
          minZoom: 2,
          opacity: 0.65,
        });
        leafletCoverageLayerRef.current = coverageLayer;
        if (showCoverage) coverageLayer.addTo(map);
        leafletMapRef.current = map;
        map.on('click', (e: L.LeafletMouseEvent) => {
          const lat = e.latlng.lat;
          const lng = e.latlng.lng;
          nominatim.reverse(lat, lng)
            .then((res) => {
              const location = typeof google !== 'undefined' && google.maps ? new google.maps.LatLng(lat, lng) : { lat: () => lat, lng: () => lng };
              setClickedLocation({ lat, lng, name: res.formatted_address, address: res.formatted_address, elevation: null, location });
            })
            .catch(() => {
              const location = typeof google !== 'undefined' && google.maps ? new google.maps.LatLng(lat, lng) : { lat: () => lat, lng: () => lng };
              setClickedLocation({ lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, elevation: null, location });
            });
        });
        setIsLeafletReady(true);
      } catch (err) {
        console.error('[Leaflet init]', err);
        setIsLeafletReady(true);
      }
    });
    return () => {
      cancelAnimationFrame(rafId);
      if (map) {
        map.remove();
        map = null;
      }
      leafletMapRef.current = null;
      leafletCoverageLayerRef.current = null;
      setIsLeafletReady(false);
    };
  }, [mapRevealed]);

  // Google script: Street View only (no Map, no Places, no Geometry, no Elevation)
  useEffect(() => {
    if ((window as any).google?.maps?.StreetViewPanorama) {
      setIsMapsApiLoaded(true);
      return;
    }
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;
    const callbackName = '__cycleSvApiReady';
    (window as any)[callbackName] = () => {
      (window as any)[callbackName] = null;
      setIsMapsApiLoaded(true);
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&callback=${callbackName}`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Street View init (Panorama + Service) when Google loaded and SV divs exist
  useEffect(() => {
    if (!isMapsApiLoaded || !svRef1.current || !svRef2.current || panorama1.current) return;
    const svOptions = { visible: true, enableCloseButton: false, disableDefaultUI: true, clickToGo: false, motionTracking: true, motionTrackingControl: true };
    panorama1.current = new google.maps.StreetViewPanorama(svRef1.current, svOptions);
    panorama2.current = new google.maps.StreetViewPanorama(svRef2.current, svOptions);
    svServiceRef.current = new google.maps.StreetViewService();
    const handleStatus = () => {
      const currentPano = activePanoRef.current === 0 ? panorama1.current : panorama2.current;
      if (currentPano) {
        setSvStatus(currentPano.getStatus());
        if (currentPano.getStatus() === 'OK') setShowSvWarning(false);
      }
    };
    panorama1.current.addListener('status_changed', handleStatus);
    panorama2.current.addListener('status_changed', handleStatus);
  }, [isMapsApiLoaded]);

  useEffect(() => {
    simulationActiveRef.current = simulation.isActive;
  }, [simulation.isActive]);

  // 주행 풀스크린 시 맵이 작은 미니맵으로 줄어들 때 Leaflet 타일이 검게 보이지 않도록 여러 번 갱신
  useEffect(() => {
    const t1 = setTimeout(() => {
      const m = leafletMapRef.current;
      if (m) {
        m.invalidateSize();
        const c = m.getCenter();
        m.setView([c.lat, c.lng], m.getZoom());
      }
      if (panorama1.current) google.maps.event.trigger(panorama1.current, 'resize');
      if (panorama2.current) google.maps.event.trigger(panorama2.current, 'resize');
    }, 550);
    const t2 = setTimeout(() => {
      const m = leafletMapRef.current;
      if (m) {
        m.invalidateSize();
        const c = m.getCenter();
        m.setView([c.lat, c.lng], m.getZoom());
      }
    }, 850);
    const t3 = setTimeout(() => leafletMapRef.current?.invalidateSize(), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isSvFullScreen]);

  // 맵이 보이기 시작할 때·영역 크기 변경 시 타일 재계산 (검은 화면 방지)
  useEffect(() => {
    if (!mapRevealed || !leafletMapRef.current) return;
    const t1 = window.setTimeout(() => {
      const m = leafletMapRef.current;
      if (m) {
        m.invalidateSize();
        const c = m.getCenter();
        m.setView([c.lat, c.lng], m.getZoom());
      }
    }, 150);
    const t2 = window.setTimeout(() => {
      leafletMapRef.current?.invalidateSize();
    }, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [mapRevealed]);

  // 주행(Street View) 켜질 때 맵 영역이 50%로 리사이즈되므로, 전환 끝난 뒤 크기 재계산
  useEffect(() => {
    if (!leafletMapRef.current) return;
    const t1 = window.setTimeout(() => leafletMapRef.current?.invalidateSize(), 550);
    const t2 = window.setTimeout(() => {
      const m = leafletMapRef.current;
      if (m) {
        m.invalidateSize();
        const c = m.getCenter();
        m.setView([c.lat, c.lng], m.getZoom());
      }
    }, 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isSvActive]);

  // Coverage 버튼: 노선 coverage 레이어(도로/자전거 노선)만 켜고 끔. 탐색된 경로(빨간선)는 항상 표시.
  useEffect(() => {
    const map = leafletMapRef.current;
    const coverageLayer = leafletCoverageLayerRef.current;
    if (!map || !coverageLayer) return;
    if (showCoverage) {
      if (!map.hasLayer(coverageLayer)) map.addLayer(coverageLayer);
      map.invalidateSize();
    } else {
      if (map.hasLayer(coverageLayer)) map.removeLayer(coverageLayer);
    }
  }, [showCoverage]);

  // 카운트다운 4초 (3 → 2 → 1 → Start! 각 1초) 후 콜백 실행
  useEffect(() => {
    if (countdown === null) return;
    const t = window.setTimeout(() => {
      if (countdown === 3) setCountdown(2);
      else if (countdown === 2) setCountdown(1);
      else if (countdown === 1) setCountdown('start');
      else if (countdown === 'start') {
        setCountdown(null);
        countdownDoneRef.current?.();
        countdownDoneRef.current = null;
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    let timer: number;
    if (simulation.isActive && route) {
      setAppPhase('RUNNING');
      if (tempMarker.current) { leafletMapRef.current?.removeLayer(tempMarker.current); tempMarker.current = null; }
      const currentIdx = simulation.currentIndex;
      if (currentIdx >= route.path.length - 1) {
          setSimulation(prev => ({ ...prev, isActive: false }));
          setAppPhase('IDLE');
          getRideEncouragement(route, { distance: route.distance, duration: route.duration }).then(speak);
          return;
      }
      const currentPos = route.path[currentIdx];
      
      // Update Simulation Marker
      const lat = typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat;
      const lng = typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng;
      if (!simulationMarker.current) {
          const icon = L.divIcon({
            className: 'sim-marker',
            html: '<div style="width:24px;height:24px;border-radius:50%;background:#3b82f6;border:2px solid #fff;"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          simulationMarker.current = L.marker([lat, lng], { icon }).addTo(leafletMapRef.current!);
      }
      const lookAheadIdx = Math.min(currentIdx + 10, route.path.length - 1);
      const targetPosForHeading = route.path[lookAheadIdx];
      simulationMarker.current.setLatLng([lat, lng]);

      // Street View 표시 인덱스: 진행 속도는 항상 60 km/h 상한. 80 km/h 초과 시 20m 간격 점프로 전환 횟수 감소
      const METERS_PER_PATH_POINT = 2;
      const MAX_SV_SPEED_M_PER_SEC = (60 * 1000) / 3600;
      if (currentIdx === 0) {
        svDisplayPathIndexRef.current = 0;
        lastSvDisplayUpdateRef.current = Date.now();
        lastDisplayedPanoPathIndexRef.current = -1;
      } else if (svDisplayPathIndexRef.current < currentIdx) {
        const elapsed = Date.now() - lastSvDisplayUpdateRef.current;
        const maxPoints = (MAX_SV_SPEED_M_PER_SEC * (elapsed / 1000)) / METERS_PER_PATH_POINT;
        const advance = Math.min(Math.max(1, Math.floor(maxPoints)), currentIdx - svDisplayPathIndexRef.current);
        if (advance >= 1) {
          svDisplayPathIndexRef.current += advance;
          lastSvDisplayUpdateRef.current = Date.now();
        }
      }
      const svDisplayIdx = svDisplayPathIndexRef.current;
      // 80 km/h 초과 시 20m(≈10 path points) 단위로만 파노 전환 — 같은 파노를 더 오래 보여 멈춤 감소
      const JUMP_POINTS_20M = 10;
      const svDisplayIdxForPano = speedKmH > 80
        ? Math.floor(svDisplayIdx / JUMP_POINTS_20M) * JUMP_POINTS_20M
        : svDisplayIdx;

      // ---- STREET VIEW: Progressive (panoData cache + on-demand segment fetch) or fallback (real-time API) ----
      if (isSvActive) {
        if (route.panoData?.length) {
          const panoItem = getPanoDataForIndex(route.panoData, svDisplayIdxForPano);
          // 전진만 허용: 이전보다 작은 pathIndex로 갱신하면 후진처럼 보이므로 생략
          if (panoItem && panoItem.pathIndex > lastDisplayedPanoPathIndexRef.current) {
            lastDisplayedPanoPathIndexRef.current = panoItem.pathIndex;
            setPanoramaViewByPanoId(panoItem.panoId, panoItem.heading, panoItem.isUserPhoto);
          }
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
              cumDist[i] = cumDist[i - 1] + computeDistanceBetween(path[i - 1], path[i]);
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
          const svDisplayPos = route.path[Math.min(svDisplayIdxForPano, route.path.length - 1)];
          const activePano = activePanoRef.current === 0 ? panorama1.current : panorama2.current;
          const currentPanoLoc = activePano?.getLocation()?.latLng;
          const distFromLastPano = currentPanoLoc ? computeDistanceBetween(svDisplayPos, currentPanoLoc) : Infinity;
          if (distFromLastPano > 15 || !currentPanoLoc) {
            isSvSearching.current = true;
            (async () => {
              const pathNext = route.path[Math.min(svDisplayIdxForPano + 10, route.path.length - 1)];
              let item: PanoDataItem | null = await findStreetViewInDirection(
                svServiceRef.current, svDisplayPos, pathNext, svDisplayIdxForPano, route.path, 30, 90
              );
              if (!item) {
                for (let i = 1; i <= 5; i++) {
                  const targetIdx = Math.min(svDisplayIdxForPano + i, route.path.length - 1);
                  const pt = route.path[targetIdx];
                  const pn = route.path[Math.min(targetIdx + 10, route.path.length - 1)];
                  item = await findStreetViewInDirection(svServiceRef.current, pt, pn, targetIdx, route.path, 30, 90);
                  if (item) break;
                }
              }
              if (!item) {
                const fallback = await findStreetView(svServiceRef.current, svDisplayPos, 100);
                if (fallback?.data?.location?.pano) {
                  const nextIdx = Math.min(svDisplayIdxForPano + 1, route.path.length - 1);
                  const finalHeading = computeHeading(svDisplayPos, route.path[nextIdx]);
                  setIsUserPano(fallback.usedFallback);
                  lastDisplayedPanoPathIndexRef.current = Math.max(lastDisplayedPanoPathIndexRef.current, svDisplayIdxForPano);
                  setPanoramaView(fallback.data.location.latLng, finalHeading);
                  setShowSvWarning(false);
                } else if (svErrorCount.current++ > 5) setShowSvWarning(true);
              } else {
                setRoute((prev) => prev ? { ...prev, panoData: [item!] } : null);
                lastDisplayedPanoPathIndexRef.current = Math.max(lastDisplayedPanoPathIndexRef.current, item!.pathIndex);
                setPanoramaViewByPanoId(item.panoId, item.heading, item.isUserPhoto);
                setShowSvWarning(false);
              }
              isSvSearching.current = false;
            })();
          }
        }
        if (isSvFullScreen && leafletMapRef.current) {
          const now = Date.now();
          if (now - lastPanToTime.current > 1000) {
            lastPanToTime.current = now;
            leafletMapRef.current.panTo([typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat, typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng]);
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
          const distMeters = computeDistanceBetween(currentPos, nextPos);
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
    if (simulation.isActive && musicOn) {
        if (audioRef.current && audioRef.current.paused) { playRandomMusic(); }
    } else {
        if (audioRef.current && !audioRef.current.paused) {
            fadeAudio(0, 2000, () => { audioRef.current?.pause(); });
        }
    }
  }, [simulation.isActive, musicOn]);

  const speak = (text: string) => {
    if (!coachingOn || !window.speechSynthesis) return;
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

  const createCustomMarker = (latLng: any, label: string, color: string): L.Marker => {
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${color};color:white;font-weight:bold;font-size:14px;border:2px solid #fff;">${label}</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    const marker = L.marker([lat, lng], { icon }).addTo(leafletMapRef.current!);
    leafletMarkersRef.current.push(marker);
    return marker;
  };

  const clearMapOverlays = () => {
    setAppPhase('IDLE');
    setPreparingProgress(null);
    if (leafletPolylineRef.current) { leafletMapRef.current?.removeLayer(leafletPolylineRef.current); leafletPolylineRef.current = null; }
    leafletMarkersRef.current.forEach(m => { leafletMapRef.current?.removeLayer(m); });
    leafletMarkersRef.current = [];
    if (simulationMarker.current) { leafletMapRef.current?.removeLayer(simulationMarker.current); simulationMarker.current = null; }
    startMarker.current = null;
    endMarker.current = null;
    waypointMarkers.current = [];
    if (searchMarkerRef.current) { leafletMapRef.current?.removeLayer(searchMarkerRef.current); searchMarkerRef.current = null; }
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
    setIsUserPano(false);
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
      const heading = computeHeading(startPos, nextPos);
      
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
    setIsSvFullScreen(false);
    setIsUserPano(false);
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
                 const heading = computeHeading(
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
    if (leafletPolylineRef.current) { leafletMapRef.current?.removeLayer(leafletPolylineRef.current); leafletPolylineRef.current = null; }
    // OSRM only (no Google Directions). Geocoding: Nominatim only.
    
    // PRIORITIZE COORDINATE REFS if they are set (and assume they match the current text intent)
    // If calculating from handleSetStart, originLocationRef was just set.
    // If calculating from manual input, refs should be null.
    const useOrigin = originLocationRef.current || finalOrigin;
    const useDest = destLocationRef.current || finalDestination;

    try {
    const getCoord = async (val: any, addr: string) => {
      if (val && typeof val.lat === 'function') return val;
      if (val && val.lat != null && val.lng != null) return new google.maps.LatLng(val.lat, val.lng);
      const res = await nominatim.addressToCoord(addr);
      return new google.maps.LatLng(res.lat, res.lng);
    };

    let path: any[] = [];
    let distText = '';
    let durText = '';
    try {
      const originLatLng = await getCoord(useOrigin, finalOrigin);
      const destLatLng = await getCoord(useDest, finalDestination);
      const wpLatLngs = activeWaypoints.map(wp => wp.location);
      const profile = activeMode === TravelMode.BICYCLING ? 'cycling' : 'foot';
      const coords = [originLatLng, ...wpLatLngs, destLatLng].map(p => `${p.lng()},${p.lat()}`).join(';');
      const url = `/api/osrm-route?profile=${encodeURIComponent(profile)}&coords=${encodeURIComponent(coords)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.code === 'Ok') {
        const decoded = decodePath(data.routes[0].geometry);
        path = decoded.map(([lat, lng]) => new google.maps.LatLng(lat, lng));
        distText = `${(data.routes[0].distance / 1000).toFixed(1)} km`;
        durText = formatDurationSimple(data.routes[0].duration);
        setRouteSource('OSRM');
        if (leafletMapRef.current && path.length) {
          const bounds = L.latLngBounds(path.map((p: any) => [p.lat(), p.lng()]));
          leafletMapRef.current.fitBounds(bounds);
        }
      }
    } catch (e) {
      console.error('[OSRM_ERROR]', e);
      setLoading(false);
      return;
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

        let elevationRes: { results: Array<{ location: any; elevation: number; resolution?: number }> };
        try {
          const openRes = await openElevation.getElevationAlongPath(path, 100);
          elevationRes = {
            results: openRes.results.map((r) => ({
              elevation: r.elevation,
              location: new google.maps.LatLng(r.latitude, r.longitude),
              resolution: 0
            }))
          };
        } catch {
          setLoading(false);
          return;
        }

        // Calculate physiological duration based on slope and user speed
        let calculatedSeconds = 0;
        const points = elevationRes.results;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const dist = computeDistanceBetween(p1.location, p2.location);
            
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
             const dist = computeDistanceBetween(p1, p2);
             if (dist > segmentLength) {
                 const stepCount = Math.floor(dist / segmentLength);
                 const heading = computeHeading(p1, p2);
                 for (let j = 1; j <= stepCount; j++) {
                     const nextPt = computeOffset(p1, j * segmentLength, heading);
                     densifiedPath.push(new google.maps.LatLng(nextPt.lat, nextPt.lng));
                 }
             }
        }
        densifiedPath.push(path[path.length - 1]);
        const oldMarkers = [startMarker.current, endMarker.current, ...waypointMarkers.current].filter(Boolean);
        oldMarkers.forEach(m => leafletMapRef.current?.removeLayer(m));
        leafletMarkersRef.current = leafletMarkersRef.current.filter(m => !oldMarkers.includes(m));
        startMarker.current = null;
        endMarker.current = null;
        waypointMarkers.current = [];
        if (leafletPolylineRef.current) { leafletMapRef.current?.removeLayer(leafletPolylineRef.current); leafletPolylineRef.current = null; }
        startMarker.current = createCustomMarker(densifiedPath[0], 'A', '#3b82f6');
        endMarker.current = createCustomMarker(densifiedPath[densifiedPath.length - 1], 'B', '#ef4444');
        activeWaypoints.forEach((wp, idx) => {
            waypointMarkers.current.push(createCustomMarker(wp.location, (idx + 1).toString(), '#f59e0b'));
        });
        const latlngs = densifiedPath.map((p: any) => [p.lat(), p.lng()] as [number, number]);
        leafletPolylineRef.current = L.polyline(latlngs, { color: '#ff3020', weight: 5 });
        if (leafletMapRef.current) leafletPolylineRef.current.addTo(leafletMapRef.current);
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
            countdownDoneRef.current = async () => {
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
              if (firstPano) setPanoramaViewByPanoId(firstPano.panoId, firstPano.heading, firstPano.isUserPhoto);
              else {
                const startPos = densifiedPath[0];
                const heading = computeHeading(startPos, densifiedPath.length > 1 ? densifiedPath[1] : startPos);
                setPanoramaView(startPos, heading);
              }
            };
            setCountdown(3);
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
    if (firstPano) setPanoramaViewByPanoId(firstPano.panoId, firstPano.heading, firstPano.isUserPhoto);
    else {
      const startPos = currentRoute.path[0];
      const heading = pathLen > 1
        ? computeHeading(startPos, currentRoute.path[1])
        : 0;
      setPanoramaView(startPos, heading);
    }
  }, [speedKmH, setPanoramaView, setPanoramaViewByPanoId]);

  const handleSetStart = () => {
    if (clickedLocation) {
      const newOrigin = clickedLocation.name || clickedLocation.address;
      setOrigin(newOrigin);
      originLocationRef.current = clickedLocation.location; // CAPTURE EXACT COORDINATES
      
      if (startMarker.current) { leafletMapRef.current?.removeLayer(startMarker.current); leafletMarkersRef.current = leafletMarkersRef.current.filter(m => m !== startMarker.current); }
      startMarker.current = createCustomMarker(clickedLocation.location, 'A', '#3b82f6');

      setClickedLocation(null);
    }
  };

  const handleSetEnd = () => {
    if (clickedLocation) {
      const newDest = clickedLocation.name || clickedLocation.address;
      setDestination(newDest);
      destLocationRef.current = clickedLocation.location; // CAPTURE EXACT COORDINATES

      if (endMarker.current) { leafletMapRef.current?.removeLayer(endMarker.current); leafletMarkersRef.current = leafletMarkersRef.current.filter(m => m !== endMarker.current); }
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
        leafletMapRef.current?.removeLayer(waypointMarkers.current[idx]);
        leafletMarkersRef.current = leafletMarkersRef.current.filter(m => m !== waypointMarkers.current[idx]);
        waypointMarkers.current.splice(idx, 1);
    }

  };

  const handleRemoveStart = () => {
    setOrigin('');
    originLocationRef.current = null;
    if (startMarker.current) {
      leafletMapRef.current?.removeLayer(startMarker.current);
      leafletMarkersRef.current = leafletMarkersRef.current.filter(m => m !== startMarker.current);
      startMarker.current = null;
    }
  };

  const handleRemoveEnd = () => {
    setDestination('');
    destLocationRef.current = null;
    if (endMarker.current) {
      leafletMapRef.current?.removeLayer(endMarker.current);
      leafletMarkersRef.current = leafletMarkersRef.current.filter(m => m !== endMarker.current);
      endMarker.current = null;
    }
  };
  
  const handlePlaceSearch = async (term?: string) => {
      const query = term || searchTerm;
      if (!query || !leafletMapRef.current) return;
      try {
          const res = await nominatim.search(query);
          const lat = res.lat;
          const lng = res.lng;
          const location = typeof google !== 'undefined' && google.maps ? new google.maps.LatLng(lat, lng) : { lat: () => lat, lng: () => lng };
          leafletMapRef.current.setView([lat, lng], 16);
          if (searchMarkerRef.current) {
              leafletMapRef.current.removeLayer(searchMarkerRef.current);
              leafletMarkersRef.current = leafletMarkersRef.current.filter(m => m !== searchMarkerRef.current);
          }
          searchMarkerRef.current = L.marker([lat, lng], {
              icon: L.divIcon({
                className: 'search-marker',
                html: '<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#22c55e;color:white;font-weight:bold;font-size:12px;border:2px solid #fff;">P</span>',
                iconSize: [28, 28],
                iconAnchor: [14, 14]
              })
          }).addTo(leafletMapRef.current);
          leafletMarkersRef.current.push(searchMarkerRef.current);
          setClickedLocation({ lat, lng, name: query, address: query, elevation: null, location });
          setRecentPlaceSearches(prev => {
              const filtered = prev.filter(item => item !== query);
              const updated = [query, ...filtered].slice(0, 5);
              localStorage.setItem('recent_places', JSON.stringify(updated));
              return updated;
          });
          setSearchTerm(query);
      } catch { /* ignore */ }
  };

  const handlePlaceHistoryClick = (term: string) => {
      setSearchTerm(term);
      handlePlaceSearch(term);
  };

  const handleClearSearch = () => {
      setSearchTerm('');
      setClickedLocation(null);
      if (searchMarkerRef.current && leafletMapRef.current) {
          leafletMapRef.current.removeLayer(searchMarkerRef.current);
          leafletMarkersRef.current = leafletMarkersRef.current.filter(m => m !== searchMarkerRef.current);
          searchMarkerRef.current = null;
      }
  };

  const handleToggleMapType = () => {
    setMapType(prev => prev === 'roadmap' ? 'hybrid' : 'roadmap');
    // Optional: swap Leaflet tile layer (e.g. OSM vs satellite); keep OSM only for now
  };

  const isSaved = isCurrentRouteSaved();

  return (
    <div className="fixed inset-0 bg-slate-900 overflow-hidden font-sans">
      {/* LCP용: 지도 로드 전 껍데기 — 대용량 아이콘 없이 텍스트만 (icon-512는 2048px로 4.5MB 유발) */}
      {!isLeafletReady && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-slate-900" aria-hidden="true">
          <p className="text-slate-400 text-2xl font-semibold">Cycle Simulator</p>
        </div>
      )}
      {/* Go 버튼 클릭 시 4초 카운트다운 오버레이 */}
      {countdown !== null && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="text-white text-[120px] font-black tracking-tighter drop-shadow-2xl animate-pulse">
            {countdown === 'start' ? 'Start!' : countdown}
          </div>
        </div>
      )}

      {/* Street View Container — overflow-hidden으로 하단 맵 영역이 가려지지 않도록 */}
      <div ref={svContainerRef} className={`bg-black transition-all duration-500 ease-in-out overflow-hidden ${isSvActive ? (isSvFullScreen ? 'absolute inset-0 z-40 opacity-100' : 'absolute top-0 left-0 right-0 h-[50%] z-20 opacity-100 border-b-2 border-slate-700') : 'absolute top-0 left-0 w-full h-0 opacity-0 pointer-events-none z-0'}`}>
         <div ref={svRef1} className={`absolute inset-0 transition-opacity duration-300 ${visiblePanoIdx === 0 ? 'z-20 opacity-100' : 'z-10'}`} />
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
      {isSvActive && isUserPano && (
        <div className={`absolute left-4 z-[45] flex items-center justify-start pointer-events-none ${isSvFullScreen ? 'bottom-32' : 'top-[42%]'}`}>
          <div className="bg-slate-700/90 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-xl">
             <span className="text-slate-200 font-medium text-[10px]">사용자 제작 이미지</span>
          </div>
        </div>
      )}
      <div
        ref={mapRef}
        className={`duration-500 ease-in-out ${isSvFullScreen ? "absolute top-4 left-4 w-40 h-40 z-50 rounded-3xl border-4 border-white shadow-2xl overflow-hidden" : (isSvActive ? "absolute bottom-0 left-0 right-0 h-[50%] z-[25]" : "absolute inset-0 z-10")} ${!mapRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{
          transitionProperty: isSvFullScreen ? 'top, left, border-radius, border-width' : 'top, left, right, bottom, width, height, border-radius',
          width: isSvFullScreen ? 160 : undefined,
          height: isSvFullScreen ? 160 : undefined,
        }}
        onTransitionEnd={() => {
          const m = leafletMapRef.current;
          if (m) {
            m.invalidateSize();
            const c = m.getCenter();
            m.setView([c.lat, c.lng], m.getZoom());
            requestAnimationFrame(() => {
              m.invalidateSize();
              m.setView([m.getCenter().lat, m.getCenter().lng], m.getZoom());
            });
            setTimeout(() => { m.invalidateSize(); }, 50);
            setTimeout(() => { m.invalidateSize(); }, 200);
          }
        }}
      />
      {simulation.isActive && coachingOn && coachData && (
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
        <button onClick={() => setShowCoverage(!showCoverage)} title={showCoverage ? "노선 coverage 끄기" : "노선 coverage 켜기 (경로 선택 대상 도로/노선 표시)"} className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${showCoverage ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}>
            <RouteIcon size={24} />
        </button>
        <button onClick={() => setIsSvActive(!isSvActive)} title={isSvActive ? "Hide Street View" : "Show Street View"} className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${isSvActive ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-400'}`}>
            <img src={STREETVIEW_ICON} alt="Street View" className="w-6 h-6 object-contain" />
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
                        <button onClick={() => { if (route && lastRouteRequestRef.current && inputsMatch(origin, destination, waypoints, mode, lastRouteRequestRef.current)) { countdownDoneRef.current = () => startSimulationOnly(route); setCountdown(3); } else { calculateRoute(mode, true); } }} title="Go" disabled={loading || !origin || !destination} className="w-20 bg-blue-700 text-white rounded-lg h-7 text-xs font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center shrink-0">{loading ? <Activity size={14} className="animate-spin" /> : 'Go'}</button>
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
                <div className="h-10 w-full flex items-stretch gap-1">
                  <div className="flex flex-col justify-center gap-1 shrink-0">
                    <button type="button" onClick={() => setCoachingOn(!coachingOn)} title={coachingOn ? "코칭 멘트 끄기" : "코칭 멘트 켜기"} className={`w-8 h-8 rounded-full flex items-center justify-center shadow transition-all active:scale-95 ${coachingOn ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-400'}`}>
                      <Mic size={16} />
                    </button>
                    <button type="button" onClick={() => setMusicOn(!musicOn)} title={musicOn ? "배경 음악 끄기" : "배경 음악 켜기"} className={`w-8 h-8 rounded-full flex items-center justify-center shadow transition-all active:scale-95 ${musicOn ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-400'}`}>
                      <Music size={16} />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0 bg-slate-900 rounded-xl p-1 relative overflow-hidden">
                    <Suspense fallback={<div className="h-full w-full bg-slate-800 rounded animate-pulse" />}>
                      <ElevationChartView data={route.elevation} currentIndex={simulation.currentIndex} pathLength={route.path.length} />
                    </Suspense>
                  </div>
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
