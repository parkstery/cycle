
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Navigation, Play, Pause, RotateCcw, Trash2, X, MapPin, Target, Volume2, AreaChart as AreaChartIcon, ChevronRight, ChevronLeft, History, Info, Route as RouteIcon, Zap, Activity, ShieldAlert, Bike, Footprints, Car, Maximize2, Minimize2, Waypoints, ArrowUpDown, Plus, Minus, CheckCircle2, Layers, Star, Square, Mic, Music } from 'lucide-react';
import ElevationChartView from './ElevationChartView';
import About from './About';
import { RouteInfo, TravelMode, SimulationState, CoachingData, SavedRoute, PanoDataItem, AppPhase, CachedCoachingItem } from './types';
import { getAdvancedCoaching, getPredictiveCoaching, getCourseBriefing, getRideEncouragement } from './services/aiCoach';
import * as nominatim from './services/nominatim';
import type { SearchSuggestionItem } from './services/nominatim';
import * as openElevation from './services/openElevation';
import { decodePath, computeDistanceBetween, computeHeading, computeOffset } from './services/geoUtils';
declare var google: any;
// 자동배포문제..
// 거리뷰 버튼 아이콘 (Show Streetview Coverage) — base path 대응
const STREETVIEW_ICON = `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}cycle-road.png`;

const PLAYLIST = [
  "https://www.dropbox.com/scl/fi/nos19xptw7q0382wcnriw/1.mp3?rlkey=sp99hg4ts7ua84sx7pvhccdry&st=doi4yle7&raw=1",
  "https://www.dropbox.com/scl/fi/q3igovjmmbqbyiel5fokw/.mp3?rlkey=oq6rkatit6tkb3ytqj0ms741c&st=qosipdkd&raw=1",
  "https://www.dropbox.com/scl/fi/qduirdh7mt24ucms1jn32/.mp3?rlkey=09o1232kpdahjlsns95ppbhrc&st=0yoqhu3j&raw=1",
  "https://www.dropbox.com/scl/fi/n5e0qtpcvjld4wrzxc36d/.mp3?rlkey=phd4mfmn96cmuj3wpcfz1a335&st=n0b0ry7i&raw=1",
  "https://www.dropbox.com/scl/fi/s6fqpav6yuy8jt7i5kz9d/.mp3?rlkey=gtvqcypwwmltf1wfk6m5nwfht&st=frbfcugt&raw=1",
  "https://www.dropbox.com/scl/fi/j1hzv2yx22uc0xl9redbj/1.mp3?rlkey=vjay2iyw06u84gygzxcoatz9w&st=mwjojmqh&raw=1",
  "https://www.dropbox.com/scl/fi/2avdaszs6csfvocofa9l9/.mp3?rlkey=ssqfzfmapfa3kkrqdifazbmoj&st=e7jcjswl&raw=1",
  "https://www.dropbox.com/scl/fi/5rlpfefbfqz94zhqcahgn/1.mp3?rlkey=v393xy7ky2xq26ilyq37z7bks&st=cnbklsql&raw=1",
  "https://www.dropbox.com/scl/fi/y4hep3u8j0b3f9w9el5ww/.mp3?rlkey=6khecb5dsfie7n9snis93b7ir&st=c11jnyod&raw=1",
];

/** OVER_QUERY_LIMIT 시에만 DEFAULT 재시도 생략 (비용·무한 폴백 방지). ZERO_RESULTS는 GOOGLE에만 없을 수 있으므로 DEFAULT(사용자 파노라마) 폴백 시도 */
const UNRECOVERABLE_STATUS = ['OVER_QUERY_LIMIT'];

/** API 무응답 시 무한 대기 방지. 정상 로딩이 3초를 넘길 수 있으므로 6초로 설정 (과민 경고 방지) */
const SV_GET_PANORAMA_TIMEOUT_MS = 6000;

/** setPanoramaView / setPanoramaViewByPanoId 전체 대기 상한. getPano + status OK까지 6초 허용 */
const PANORAMA_VIEW_TIMEOUT_MS = 6000;

type SvResultReason = 'timeout' | 'no_pano';

/**
 * getPanorama with fallback: try GOOGLE first, then DEFAULT (includes user Photo Spheres).
 * Returns { data, usedFallback, reason? }. reason 'timeout' = 응답 지연, 'no_pano' = 실제 커버리지 없음.
 * 경고 메시지는 no_pano일 때만 표시하고, timeout은 표시하지 않음.
 */
const getPanoramaWithFallback = (
  service: any,
  opts: { location: any; radius: number; preference?: any }
): Promise<{ data: any; usedFallback: boolean; reason?: SvResultReason }> => {
  const apiPromise = new Promise<{ data: any; usedFallback: boolean; reason?: SvResultReason }>((resolve) => {
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
      if (UNRECOVERABLE_STATUS.includes(status)) {
        resolve({ data: null, usedFallback: false, reason: 'no_pano' });
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
          resolve({ data: null, usedFallback: false, reason: 'no_pano' });
        }
      });
    });
  });
  const timeoutPromise = new Promise<{ data: any; usedFallback: boolean; reason?: SvResultReason }>((resolve) => {
    setTimeout(() => {
      console.warn('[SV] getPanorama timeout — no callback within', SV_GET_PANORAMA_TIMEOUT_MS, 'ms');
      resolve({ data: null, usedFallback: false, reason: 'timeout' });
    }, SV_GET_PANORAMA_TIMEOUT_MS);
  });
  return Promise.race([apiPromise, timeoutPromise]);
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
  maxAngleDeg: number = 110
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
      isUserPhoto: usedFallback,
      description: data.location?.description ?? undefined
    };
  });
};

/** [Phase 2] Multi-pass 1단계: 반경(m), 주행 방향 ±각도(°). 시니어 권고 50m ±40° */
const SV_PASS1_RADIUS_M = 50;
const SV_PASS1_MAX_ANGLE_DEG = 40;
/** [Phase 2] Multi-pass 2단계: 반경(m), 방향 제한 없음. 시니어 권고 120m */
const SV_PASS2_RADIUS_M = 120;
/** [Phase 2] 점수 가중치: 거리 60%, 방향 40%. score = 0.6*(1-d/maxD) + 0.4*(1-diff/90) */
const SV_SCORE_DIST_WEIGHT = 0.6;
const SV_SCORE_ANGLE_WEIGHT = 0.4;
const SV_SCORE_ANGLE_DENOM_DEG = 90;
/** [Phase 4] 실내/상가 파노 제외용. description에 포함 시 후보에서 제외 (tilt는 getPanorama 응답에 없음) */
const SV_INDOOR_KEYWORDS = /Shop|Indoor|Business/i;
/** [Phase 5] coverage 미만이면 거리뷰 부족 안내 (Street View 비활성 또는 배지) */
const COVERAGE_MIN = 0.7;
/** [Phase 1 이후 미사용] 주행 중 실시간 검색 제거로 사용 안 함. */
const MAX_REALTIME_SV_ATTEMPTS = 3;

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

  const googleMapRef = useRef<google.maps.Map | null>(null);
  const googlePolylineRef = useRef<google.maps.Polyline | null>(null);
  const streetViewCoverageLayerRef = useRef<google.maps.StreetViewCoverageLayer | null>(null);
  const googleMarkersRef = useRef<google.maps.Marker[]>([]);
  const simulationMarker = useRef<google.maps.Marker | null>(null);
  const startMarker = useRef<google.maps.Marker | null>(null);
  const endMarker = useRef<google.maps.Marker | null>(null);
  const waypointMarkers = useRef<google.maps.Marker[]>([]);
  const tempMarker = useRef<google.maps.Marker | null>(null);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);
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
  /** Favorites 복원 함수 ref (handleLoadFavorite보다 나중에 정의되므로 ref로 호출) */
  const restoreRouteFromSavedGeometryRef = useRef<((saved: SavedRoute) => Promise<void>) | null>(null);

  // Audio References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const simulationActiveRef = useRef(false);
  /** 주행 마커 이미지 base64 (data URI). SVG 내부 참조용 — data URI SVG에서 외부 URL은 로드되지 않음 */
  const cyclingMarkerDataUrlRef = useRef<string | null>(null);
  /** 맵/경로 클릭 시 위치 선택 (주소·표고 조회 후 인포윈도우). ref로 두어 폴리라인 생성 시에도 동일 로직 사용 */
  const handleLocationClickRef = useRef<(lat: number, lng: number) => void>(() => { });

  // App Core State
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [simulation, setSimulation] = useState<SimulationState>({ isActive: false, currentIndex: 0, speed: 100 });
  const [speedKmH, setSpeedKmH] = useState(20);
  const [mode, setMode] = useState<TravelMode>(TravelMode.DRIVING);
  const [loading, setLoading] = useState(false);
  const [isSvActive, setIsSvActive] = useState(false);
  const [isSvFullScreen, setIsSvFullScreen] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [svStatus, setSvStatus] = useState<string>('');
  const [showSvWarning, setShowSvWarning] = useState(false);
  const [isUserPano, setIsUserPano] = useState(false); // true when showing user-contributed panorama (fallback)
  const [routeSource, setRouteSource] = useState<'GOOGLE' | 'OSRM' | null>(null);
  const [mapType, setMapType] = useState<string>('roadmap');
  const [showAbout, setShowAbout] = useState(false);

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
  const [routeSettingsPanelExpanded, setRouteSettingsPanelExpanded] = useState(true); // 왼쪽 '경로설정' 패널만 접기/펼치기
  const [elevationExpanded, setElevationExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [coachingOn, setCoachingOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);

  // Input States
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState<{ name: string, location: any }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  /** 출발/도착 입력란 자동완성 추천 목록 */
  const [originSuggestions, setOriginSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<SearchSuggestionItem[]>([]);
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  /** 추천 목록 키보드 포커스 인덱스 (-1: 없음) */
  const [originHighlightIndex, setOriginHighlightIndex] = useState(-1);
  const [destinationHighlightIndex, setDestinationHighlightIndex] = useState(-1);
  const originSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destSuggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originSuggestReqIdRef = useRef(0);
  const destSuggestReqIdRef = useRef(0);
  const closeOriginSuggestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeDestSuggestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeInputContainerRef = useRef<HTMLDivElement | null>(null);
  const originSuggestionItemRef = useRef<HTMLButtonElement | null>(null);
  const destSuggestionItemRef = useRef<HTMLButtonElement | null>(null);
  /** 항목 선택 직후에는 추천 목록을 다시 열지 않음 */
  const originJustSelectedRef = useRef(false);
  const destJustSelectedRef = useRef(false);
  /** 맵 클릭으로 출발/도착이 설정된 경우 해당 턴에서는 추천 목록을 표시하지 않음 */
  const originSetFromMapClickRef = useRef(false);
  const destSetFromMapClickRef = useRef(false);

  const [isMapReady, setIsMapReady] = useState(false);
  const [isMapsApiLoaded, setIsMapsApiLoaded] = useState(false);
  const [mapRevealed, setMapRevealed] = useState(false);
  /** 브라우저 Geolocation API로 얻은 사용자 현재 위치 (지도 초기 중심용) */
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

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
        id: "def-roma1",
        origin: "Jaeger-LeCoultre, 92, Piazza di Spagna, Campo Marzio, Municipio Roma I, Roma, Roma Capitale, Lazio, 00187, Italia",
        destination: "Piazza del Colosseo, Celio, Municipio Roma I, Roma, Roma Capitale, Lazio, 00184, Italia",
        waypoints: [],
        timestamp: Date.now()
      },
      {
        id: "def-seoul",
        origin: "고덕로, 암사2동, 강동구, 서울특별시, 05241, 대한민국",
        destination: "올림픽대로, 본동, 노량진1동, 동작구, 서울특별시, 06904, 대한민국",
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
        id: "def-roma2",
        origin: "Via Claudia, Celio, Municipio Roma I, Roma, Roma Capitale, Lazio, 00184, Italia",
        destination: "10, Piazza Pio Dodicesimo, Borgo, Municipio Roma I, Roma, Roma Capitale, Lazio, 00193, Italia",
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

  const [clickedLocation, setClickedLocation] = useState<{ lat: number, lng: number, name?: string, address: string, elevation: number | null, location: any } | null>(null);

  /** 이중화 테스트: URL ?elevation_provider=opentopodata 또는 ?elevation_provider=open-elevation */
  const elevationProvider = typeof window !== 'undefined' ? (() => {
    const p = new URLSearchParams(window.location.search).get('elevation_provider');
    return (p === 'opentopodata' || p === 'open-elevation') ? p : undefined;
  })() : undefined;

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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

      // Serialize waypoints (정밀도 유지)
      const newWaypoints = waypoints.map(wp => {
        const lat = typeof wp.location.lat === 'function' ? wp.location.lat() : wp.location.lat;
        const lng = typeof wp.location.lng === 'function' ? wp.location.lng() : wp.location.lng;
        return {
          name: wp.name,
          lat: Number(Number(lat).toFixed(8)),
          lng: Number(Number(lng).toFixed(8))
        };
      });

      // OSRM 경로가 있으면 fullGeometry 저장 → 불러올 때 재호출 없이 복원(위치 변동 방지)
      let routePayload: SavedRoute['routePayload'] = undefined;
      if (route && routeSource === 'OSRM' && route.path?.length > 0) {
        const fullGeometry: [number, number][] = route.path.map((p: any) => {
          const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
          const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
          return [Number(Number(lat).toFixed(8)), Number(Number(lng).toFixed(8))] as [number, number];
        });
        const profile = mode === TravelMode.DRIVING ? 'driving' : mode === TravelMode.BICYCLING ? 'cycling' : 'foot';
        routePayload = {
          provider: 'osrm',
          profile,
          distance: route.distance,
          duration: route.duration,
          fullGeometry
        };
      }

      const newRoute: SavedRoute = {
        id: Date.now().toString(),
        origin,
        destination,
        waypoints: newWaypoints,
        timestamp: Date.now(),
        ...(routePayload && { routePayload })
      };

      const newFavorites = [newRoute, ...favoriteRoutes];
      setFavoriteRoutes(newFavorites);
      localStorage.setItem('favorite_routes', JSON.stringify(newFavorites));
    }
  };

  const handleLoadFavorite = async (saved: SavedRoute) => {
    setOrigin(saved.origin);
    setDestination(saved.destination);
    originLocationRef.current = null;
    destLocationRef.current = null;
    const restoredWaypoints = saved.waypoints.map(wp => ({
      name: wp.name,
      location: { lat: wp.lat, lng: wp.lng },
    }));
    setWaypoints(restoredWaypoints);
    if (saved.routePayload?.fullGeometry?.length) {
      await restoreRouteFromSavedGeometryRef.current?.(saved);
    }
  };

  const handleDeleteFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = favoriteRoutes.filter(r => r.id !== id);
    setFavoriteRoutes(newFavorites);
    localStorage.setItem('favorite_routes', JSON.stringify(newFavorites));
  };

  // Helper: swap only after nextPano is OK + 150ms delay (방안 A: 검은 화면 방지). onSwapDone 호출 시 스왑 완료(첫 거리뷰 디스플레이 보장용).
  const scheduleSwapAfterOk = useCallback((nextPano: any, _nextIdx: number, doSwap: () => void, onSwapDone?: () => void) => {
    const runSwap = () => {
      doSwap();
      onSwapDone?.();
    };
    if (pendingSwapFallbackRef.current) {
      clearTimeout(pendingSwapFallbackRef.current);
      pendingSwapFallbackRef.current = null;
    }
    const doSwapWithDelay = () => {
      pendingSwapTimeoutRef.current = null;
      runSwap();
    };
    const FALLBACK_MS = 1500;
    const DELAY_AFTER_OK_MS = 150;
    let listener: any = null;
    pendingSwapFallbackRef.current = setTimeout(() => {
      pendingSwapFallbackRef.current = null;
      if (listener) google.maps.event.removeListener(listener);
      runSwap();
    }, FALLBACK_MS);
    listener = nextPano.addListener('status_changed', () => {
      if (nextPano.getStatus() !== 'OK') return;
      if (listener) { google.maps.event.removeListener(listener); listener = null; }
      if (pendingSwapFallbackRef.current) { clearTimeout(pendingSwapFallbackRef.current); pendingSwapFallbackRef.current = null; }
      pendingSwapTimeoutRef.current = setTimeout(doSwapWithDelay, DELAY_AFTER_OK_MS);
    });
  }, []);

  // Helper function to update panorama atomically (Hybrid Double Buffer). 스왑 완료 시 resolve하여 변경된 경로 거리뷰 디스플레이 보장.
  // 무한 대기 방지: PANORAMA_VIEW_TIMEOUT_MS 초과 시 resolve하여 주행이 반드시 시작되도록 함.
  const setPanoramaView = useCallback((location: any, heading: number): Promise<void> => {
    const inner = new Promise<void>((resolve) => {
      if (!svServiceRef.current) { resolve(); return; }
      if (pendingSwapTimeoutRef.current) {
        clearTimeout(pendingSwapTimeoutRef.current);
        pendingSwapTimeoutRef.current = null;
      }
      if (pendingSwapFallbackRef.current) {
        clearTimeout(pendingSwapFallbackRef.current);
        pendingSwapFallbackRef.current = null;
      }
      getPanoramaWithFallback(svServiceRef.current, { location, radius: 50 }).then(({ data, usedFallback, reason }) => {
        if (!data?.location) {
          // timeout은 응답 지연일 뿐이므로 경고 표시 안 함. no_pano일 때만 "No street view" 표시
          if (reason === 'no_pano') setShowSvWarning(true);
          resolve();
          return;
        }
        setIsUserPano(usedFallback);
        const currentIdx = activePanoRef.current;
        const nextIdx = currentIdx === 0 ? 1 : 0;
        const currentPano = currentIdx === 0 ? panorama1.current : panorama2.current;
        const nextPano = nextIdx === 0 ? panorama1.current : panorama2.current;

        if (!currentPano || !nextPano) { resolve(); return; }

        const newPanoId = data.location.pano;
        const currentPanoId = currentPano.getPano();

        const doSwap = () => {
          pendingSwapTimeoutRef.current = null;
          activePanoRef.current = nextIdx;
          setVisiblePanoIdx(nextIdx);
        };

        nextPano.setOptions({
          pano: newPanoId,
          pov: { heading, pitch: 0, zoom: 0 },
          visible: true
        });

        scheduleSwapAfterOk(nextPano, nextIdx, doSwap, () => resolve());
      }).catch(() => resolve());
    });
    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn('[SV] setPanoramaView timeout — proceeding without street view');
        // timeout은 로딩 지연이므로 경고 표시하지 않음. OK 수신 시 status_changed에서 해제됨
        resolve();
      }, PANORAMA_VIEW_TIMEOUT_MS);
    });
    return Promise.race([inner, timeout]);
  }, [scheduleSwapAfterOk]);

  /**
   * 거리뷰 표시: 내부적으로 계산된 각도(heading)를 적용한 뒤 스왑하여 보여줌.
   * isUserPhoto: 사용자 제작 이미지 여부(배지 표시용).
   * 스왑 완료 시 resolve하여 변경된 경로 거리뷰 디스플레이 보장.
   * 무한 대기 방지: PANORAMA_VIEW_TIMEOUT_MS 초과 시 resolve하여 주행이 반드시 시작되도록 함.
   */
  const setPanoramaViewByPanoId = useCallback((panoId: string, heading: number, isUserPhoto?: boolean): Promise<void> => {
    const inner = new Promise<void>((resolve) => {
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
      if (!currentPano || !nextPano) { resolve(); return; }
      const currentPanoId = currentPano.getPano();

      const doSwap = () => {
        pendingSwapTimeoutRef.current = null;
        activePanoRef.current = nextIdx;
        setVisiblePanoIdx(nextIdx);
      };

      // 같은 파노라마: heading 차이 1.5° 미만이면 무시, 1.5° 이상이면 POV만 갱신(스왑 없이) → 멈춤 감소
      if (currentPanoId === panoId) {
        const currentPov = currentPano.getPov?.();
        const curH = currentPov?.heading ?? 0;
        const diff = Math.abs(normalizeAngleDiff(curH - heading));
        if (diff < 1.5) { resolve(); return; }
        currentPano.setPov({ heading, pitch: 0, zoom: 0 });
        resolve();
        return;
      }

      nextPano.setOptions({ pano: panoId, pov: { heading, pitch: 0, zoom: 0 }, visible: true });
      scheduleSwapAfterOk(nextPano, nextIdx, doSwap, () => resolve());
    });
    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn('[SV] setPanoramaViewByPanoId timeout — proceeding without street view');
        // timeout은 로딩 지연이므로 경고 표시하지 않음. OK 수신 시 status_changed에서 해제됨
        resolve();
      }, PANORAMA_VIEW_TIMEOUT_MS);
    });
    return Promise.race([inner, timeout]);
  }, [scheduleSwapAfterOk]);

  /** [Phase 2] Pre-fetch: Multi-pass(50m ±40° → 120m 제한없음) 후 후보 수집, 점수로 1개 선택. [Phase 5] sampleCount 반환. */
  const preFetchStreetViewData = useCallback(async (
    path: any[],
    onProgress: (k: number, n: number) => void,
    options?: { fromDistanceM?: number; maxDistanceM?: number; intervalM?: number }
  ): Promise<{ panoData: PanoDataItem[]; sampleCount: number }> => {
    if (!svServiceRef.current || !path.length) return { panoData: [], sampleCount: 0 };
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
      const driveHeading = computeHeading(pathPoint, pathNext);
      const candidates: { item: PanoDataItem; maxD: number }[] = [];

      const pass1 = await findStreetViewInDirection(
        svServiceRef.current,
        pathPoint,
        pathNext,
        pathIndex,
        path,
        SV_PASS1_RADIUS_M,
        SV_PASS1_MAX_ANGLE_DEG
      );
      if (pass1) candidates.push({ item: pass1, maxD: SV_PASS1_RADIUS_M });

      if (candidates.length === 0) {
        const pass2 = await findStreetView(svServiceRef.current, pathPoint, SV_PASS2_RADIUS_M);
        if (pass2?.data?.location?.pano) {
          const desc = pass2.data.location?.description ?? '';
          if (!SV_INDOOR_KEYWORDS.test(desc)) {
            const heading = computeHeading(pathPoint, pathNext);
            candidates.push({
              item: {
                pathIndex,
                panoId: pass2.data.location.pano,
                location: pass2.data.location.latLng,
                heading,
                isUserPhoto: pass2.usedFallback,
                description: desc || undefined
              },
              maxD: SV_PASS2_RADIUS_M
            });
          }
        }
      }

      const filtered = candidates.filter(c => !c.item.description || !SV_INDOOR_KEYWORDS.test(c.item.description));
      let best: PanoDataItem | null = null;
      let bestScore = -1;
      for (const { item, maxD } of filtered) {
        const d = computeDistanceBetween(pathPoint, item.location);
        const bearingToPano = computeHeading(pathPoint, item.location);
        const diff = Math.abs(normalizeAngleDiff(bearingToPano - driveHeading));
        const score =
          SV_SCORE_DIST_WEIGHT * (1 - Math.min(d, maxD) / maxD) +
          SV_SCORE_ANGLE_WEIGHT * (1 - Math.min(diff, SV_SCORE_ANGLE_DENOM_DEG) / SV_SCORE_ANGLE_DENOM_DEG);
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
      if (best) panoData.push(best);
      onProgress(k + 1, n);
      if (k < n - 1) await new Promise(r => setTimeout(r, 80));
    }
    return { panoData, sampleCount: n };
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

  // 사용자 현재 위치 조회 (Geolocation API) — 지도 노출 전에 요청해 초기 중심에 반영
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* 거부/오류 시 기본(서울) 유지 */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // 2초 후 맵 영역 노출 — 타일 로드 문제 방지를 위해 먼저 노출 후 맵 생성
  useEffect(() => {
    const t = window.setTimeout(() => setMapRevealed(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Google Map 베이스맵 생성: Maps API 로드 + mapRevealed 후 한 번만 생성
  useEffect(() => {
    if (!isMapsApiLoaded || !mapRevealed || !mapRef.current || googleMapRef.current) return;
    try {
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: 37.5512, lng: 126.9882 },
        zoom: 14,
        mapTypeId: mapType,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: false,
        cameraControl: false,
        scaleControl: true,
        scaleControlOptions: { position: google.maps.ControlPosition.BOTTOM_CENTER },
        rotateControl: false,
        tiltControl: false,
        clickableIcons: false, // 상점·POI 이름은 보이기만 하고 클릭 시 구글맵으로 연결되지 않음
      });
      googleMapRef.current = map;
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) handleLocationClickRef.current(e.latLng.lat(), e.latLng.lng());
      });
      setIsMapReady(true);
    } catch (err) {
      console.error('[Google Map init]', err);
      setIsMapReady(true);
    }
    return () => {
      googleMapRef.current = null;
      setIsMapReady(false);
    };
  }, [mapRevealed, isMapsApiLoaded]);

  // 사용자 위치를 받으면 지도 중심을 해당 위치로 이동
  useEffect(() => {
    if (!isMapReady || !userLocation || !googleMapRef.current) return;
    googleMapRef.current.panTo(userLocation);
    googleMapRef.current.setZoom(14);
  }, [isMapReady, userLocation]);

  // 출발지 입력 디바운스 → Nominatim 추천 목록 (맵 클릭으로 설정된 경우 추천 목록 표시 안 함)
  useEffect(() => {
    if (originSetFromMapClickRef.current) {
      originSetFromMapClickRef.current = false;
      setOriginSuggestions([]);
      setShowOriginSuggestions(false);
      setOriginHighlightIndex(-1);
      return;
    }
    const q = origin.trim();
    if (q.length < 2) {
      setOriginSuggestions([]);
      setShowOriginSuggestions(false);
      return;
    }
    if (originSuggestDebounceRef.current) clearTimeout(originSuggestDebounceRef.current);
    originSuggestDebounceRef.current = window.setTimeout(() => {
      const reqId = ++originSuggestReqIdRef.current;
      nominatim.searchSuggestions(q, 5).then((list) => {
        if (reqId !== originSuggestReqIdRef.current) return;
        setOriginSuggestions(list);
        if (!originJustSelectedRef.current) setShowOriginSuggestions(list.length > 0);
        originJustSelectedRef.current = false;
        setOriginHighlightIndex(-1);
      }).catch(() => {
        if (reqId === originSuggestReqIdRef.current) setOriginSuggestions([]);
      });
    }, 0);
    return () => {
      if (originSuggestDebounceRef.current) clearTimeout(originSuggestDebounceRef.current);
    };
  }, [origin]);

  // 도착지 입력 디바운스 → Nominatim 추천 목록 (맵 클릭으로 설정된 경우 추천 목록 표시 안 함)
  useEffect(() => {
    if (destSetFromMapClickRef.current) {
      destSetFromMapClickRef.current = false;
      setDestinationSuggestions([]);
      setShowDestinationSuggestions(false);
      setDestinationHighlightIndex(-1);
      return;
    }
    const q = destination.trim();
    if (q.length < 2) {
      setDestinationSuggestions([]);
      setShowDestinationSuggestions(false);
      return;
    }
    if (destSuggestDebounceRef.current) clearTimeout(destSuggestDebounceRef.current);
    destSuggestDebounceRef.current = window.setTimeout(() => {
      const reqId = ++destSuggestReqIdRef.current;
      nominatim.searchSuggestions(q, 5).then((list) => {
        if (reqId !== destSuggestReqIdRef.current) return;
        setDestinationSuggestions(list);
        if (!destJustSelectedRef.current) setShowDestinationSuggestions(list.length > 0);
        destJustSelectedRef.current = false;
        setDestinationHighlightIndex(-1);
      }).catch(() => {
        if (reqId === destSuggestReqIdRef.current) setDestinationSuggestions([]);
      });
    }, 0);
    return () => {
      if (destSuggestDebounceRef.current) clearTimeout(destSuggestDebounceRef.current);
    };
  }, [destination]);

  // 맵·다른 콘트롤 클릭 시 추천 목록 닫기
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const el = routeInputContainerRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setShowOriginSuggestions(false);
        setShowDestinationSuggestions(false);
        setOriginHighlightIndex(-1);
        setDestinationHighlightIndex(-1);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // 좌측 하단 "Google 지도에서 이 지역 열기" 링크 비활성화 (클릭해도 외부로 열리지 않도록)
  useEffect(() => {
    const container = mapRef.current;
    if (!container || !isMapReady) return;
    const disableGoogleMapsLink = () => {
      const anchors = container.querySelectorAll<HTMLAnchorElement>(
        'a[href*="google.com/maps"], a[href*="maps.google.com"], a[title*="이 지역 열기"], a[title*="Open this area"]'
      );
      anchors.forEach((a: HTMLAnchorElement) => {
        a.addEventListener('click', (e: MouseEvent) => e.preventDefault(), { capture: true });
        a.style.pointerEvents = 'none';
        a.style.cursor = 'default';
      });
    };
    disableGoogleMapsLink();
    const t1 = window.setTimeout(disableGoogleMapsLink, 500);
    const t2 = window.setTimeout(disableGoogleMapsLink, 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isMapReady]);

  // 맵 컨테이너 리사이즈 시(상/하 전환·미니맵) Google Map resize 이벤트
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !googleMapRef.current) return;
    const ro = new ResizeObserver(() => {
      google.maps.event.trigger(googleMapRef.current!, 'resize');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapRevealed, isMapReady]);

  // 클릭한 위치(맵/경로) → 즉시 인포윈도우 표시 후, 주소·표고 비동기 채우기 (지연 개선)
  useEffect(() => {
    if (typeof (window as any).google === 'undefined' || !(window as any).google.maps?.LatLng) return;
    const g = (window as any).google;
    handleLocationClickRef.current = (lat: number, lng: number) => {
      const location = new g.maps.LatLng(lat, lng);
      const fallbackLabel = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      // 1) 즉시 팝업 표시 (체감 지연 제거)
      setClickedLocation({
        lat,
        lng,
        name: 'Loading...',
        address: fallbackLabel,
        elevation: null,
        location,
      });
      // 2) 주소 조회 → 도착 시 해당 클릭이 현재 표시 중일 때만 갱신
      nominatim
        .reverse(lat, lng)
        .catch(() => ({ formatted_address: fallbackLabel }))
        .then((rev) => {
          const name = rev.formatted_address;
          setClickedLocation((prev) => {
            if (!prev || prev.lat !== lat || prev.lng !== lng) return prev;
            return { ...prev, name, address: name };
          });
        });
      // 3) 표고 조회 → 도착 시 해당 클릭이 현재 표시 중일 때만 갱신
      openElevation
        .getElevationAlongPath([{ lat, lng }], 1, elevationProvider ? { provider: elevationProvider } : undefined)
        .then((r) => r.results[0]?.elevation ?? null)
        .catch(() => null)
        .then((elevation) => {
          setClickedLocation((prev) => {
            if (!prev || prev.lat !== lat || prev.lng !== lng) return prev;
            return { ...prev, elevation };
          });
        });
    };
  }, [isMapsApiLoaded, elevationProvider]);

  // Google Maps API: Map(베이스맵) + Street View
  useEffect(() => {
    if ((window as any).google?.maps?.Map) {
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

  // 주행 마커 이미지 프리로드 → base64 data URL (SVG 내부 참조용, data URI SVG는 외부 URL 로드 불가)
  useEffect(() => {
    if (cyclingMarkerDataUrlRef.current) return;
    fetch('/cycling-position-marker.png')
      .then((r) => r.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => { cyclingMarkerDataUrlRef.current = reader.result as string; };
        reader.readAsDataURL(blob);
      })
      .catch(() => { });
  }, []);

  // Street View init (Panorama + Service) when Google loaded and SV divs exist
  useEffect(() => {
    if (!isMapsApiLoaded || !svRef1.current || !svRef2.current || panorama1.current) return;
    const svOptions = { visible: true, enableCloseButton: false, disableDefaultUI: true, clickToGo: false, motionTracking: true, motionTrackingControl: true, pov: { heading: 0, pitch: 0, zoom: 0 } };
    panorama1.current = new google.maps.StreetViewPanorama(svRef1.current, svOptions);
    panorama2.current = new google.maps.StreetViewPanorama(svRef2.current, svOptions);
    svServiceRef.current = new google.maps.StreetViewService();
    const handleStatus = () => {
      const currentPano = activePanoRef.current === 0 ? panorama1.current : panorama2.current;
      if (currentPano) setSvStatus(currentPano.getStatus());
      // OK 수신 시 경고 즉시 해제. 양쪽 파노라마 모두 확인(스왑 직전에 로드된 쪽이 OK여도 해제)
      if (panorama1.current?.getStatus() === 'OK' || panorama2.current?.getStatus() === 'OK') {
        setShowSvWarning(false);
      }
    };
    panorama1.current.addListener('status_changed', handleStatus);
    panorama2.current.addListener('status_changed', handleStatus);
  }, [isMapsApiLoaded]);

  useEffect(() => {
    simulationActiveRef.current = simulation.isActive;
  }, [simulation.isActive]);

  // 주행 시작→미니맵 전환 시 Google Map 크기 갱신
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map || !isSvFullScreen) return;
    const t1 = setTimeout(() => google.maps.event.trigger(map, 'resize'), 100);
    const t2 = setTimeout(() => google.maps.event.trigger(map, 'resize'), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isSvFullScreen]);

  // 도로(Road)는 항상 표시. 켜고 끄는 대상이 아님.
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map) return;
    map.setOptions({ styles: null });
  }, [isMapReady]);

  // Show Streetview Coverage: 거리뷰 가능한 전체 도로 레이어(Google StreetViewCoverageLayer) 표시/숨김.
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map) {
      if (streetViewCoverageLayerRef.current) streetViewCoverageLayerRef.current.setMap(null);
      return;
    }
    if (!streetViewCoverageLayerRef.current) {
      streetViewCoverageLayerRef.current = new google.maps.StreetViewCoverageLayer();
    }
    streetViewCoverageLayerRef.current.setMap(showCoverage ? map : null);
  }, [showCoverage, isMapReady]);

  // 탐색된 경로(폴리라인)는 showCoverage와 무관하게 항상 동일 스타일로 표시.
  useEffect(() => {
    const poly = googlePolylineRef.current;
    if (!poly) return;
    poly.setOptions({
      strokeColor: '#ff3020',
      strokeWeight: 5,
      strokeOpacity: 1,
    });
  }, [route]);

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
      if (tempMarker.current) { tempMarker.current.setMap(null); tempMarker.current = null; }
      const currentIdx = simulation.currentIndex;
      if (currentIdx >= route.path.length - 1) {
        setSimulation(prev => ({ ...prev, isActive: false }));
        setAppPhase('IDLE');
        getRideEncouragement(route, { distance: route.distance, duration: route.duration }).then(speak);
        return;
      }
      const currentPos = route.path[currentIdx];
      const lookAheadIdx = Math.min(currentIdx + 10, route.path.length - 1);
      const targetPosForHeading = route.path[lookAheadIdx];

      // Update Simulation Marker
      const lat = typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat;
      const lng = typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng;
      const map = googleMapRef.current;
      // 주행 방향: 좌우(수평)만 반전. 상하 회전 없음. 기본 아이콘=동쪽(오른쪽), 서쪽(왼쪽)일 때 수평 반전.
      let flipHorizontal = false;
      if (lookAheadIdx > currentIdx) {
        const heading = computeHeading(currentPos, targetPosForHeading);
        flipHorizontal = heading > 180; // 180~360° = 서쪽 방향 → 좌우 반전
      }
      const dataUrl = cyclingMarkerDataUrlRef.current;
      const cyclingIcon = (() => {
        if (dataUrl) {
          const flip = flipHorizontal ? ' translate(20,20) scale(-1,1) translate(-20,-20)' : '';
          const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><g transform="' + flip + '"><image href="' + dataUrl.replace(/"/g, "'") + '" x="0" y="0" width="40" height="40" preserveAspectRatio="xMidYMid meet"/></g></svg>';
          return { url: 'data:image/svg+xml,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) };
        }
        return { url: '/cycling-position-marker.png', scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) };
      })();

      if (!simulationMarker.current && map) {
        simulationMarker.current = new google.maps.Marker({
          position: { lat, lng },
          map,
          icon: cyclingIcon,
        });
      } else if (simulationMarker.current) {
        simulationMarker.current.setPosition({ lat, lng });
        simulationMarker.current.setIcon(cyclingIcon);
      }

      // Street View 표시 인덱스: 진행 속도는 항상 60 km/h 상한 (주행 스피드 10~70과 독립)
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
      const svDisplayIdxForPano = svDisplayIdx;

      // ---- STREET VIEW: 캐시만 사용 (주행 중 API 0). 없으면 끄기/안내. [Phase 1] ----
      if (isSvActive) {
        if (route.panoData?.length) {
          const panoItem = getPanoDataForIndex(route.panoData, svDisplayIdxForPano);
          const lastPano = route.panoData[route.panoData.length - 1];
          const inGap = lastPano && svDisplayIdxForPano > lastPano.pathIndex + 30;
          if (inGap) {
            setShowSvWarning(true);
          } else if (panoItem && panoItem.pathIndex > lastDisplayedPanoPathIndexRef.current) {
            lastDisplayedPanoPathIndexRef.current = panoItem.pathIndex;
            setPanoramaViewByPanoId(panoItem.panoId, panoItem.heading, panoItem.isUserPhoto);
            setShowSvWarning(false);
          }
          // 슬라이딩 prefetch: 캐시 끝 근처 또는 현재 위치 기준으로 다음 구간 prefetch (갭 구간 지난 뒤에도 재개되도록)
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
            const distAtCurrent = cumDist[Math.min(currentIdx, path.length - 1)];
            // 마지막 pano 기준과 현재 주행 위치 중 더 앞선 쪽부터 prefetch → 갭 이후 구간도 수집
            const fromM = Math.max(distAtLast + 10, distAtCurrent);
            const toM = Math.min(fromM + 400, totalM);
            if (fromM < toM) {
              preFetchStreetViewData(path, () => { }, { fromDistanceM: fromM, maxDistanceM: toM, intervalM: 10 })
                .then(({ panoData: nextPanos }) => {
                  if (nextPanos.length) {
                    setRoute((prev) => prev ? { ...prev, panoData: [...(prev.panoData || []), ...nextPanos] } : null);
                  }
                })
                .finally(() => { isSegmentFetchingRef.current = false; });
            } else {
              isSegmentFetchingRef.current = false;
            }
          }
        } else {
          setShowSvWarning(true);
        }
        if (isSvFullScreen && googleMapRef.current) {
          const now = Date.now();
          if (now - lastPanToTime.current > 1000) {
            lastPanToTime.current = now;
            const plat = typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat;
            const plng = typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng;
            googleMapRef.current.panTo({ lat: plat, lng: plng });
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

  const createCustomMarker = (latLng: any, label: string, color: string): google.maps.Marker => {
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
    const map = googleMapRef.current;
    if (!map) throw new Error('Map not ready');
    const marker = new google.maps.Marker({
      position: { lat, lng },
      map,
      label: { text: label, color: 'white', fontWeight: 'bold', fontSize: '14px' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
    });
    googleMarkersRef.current.push(marker);
    return marker;
  };

  /** 저장된 fullGeometry로 경로 복원(OSRM 재호출 없음 → 출발/도착 위치 변동 방지) */
  const restoreRouteFromSavedGeometry = useCallback(async (saved: SavedRoute) => {
    const payload = saved.routePayload;
    if (!payload?.fullGeometry?.length) return;
    setLoading(true);
    try {
      const path = payload.fullGeometry.map(([lat, lng]) => new google.maps.LatLng(lat, lng));
      const openRes = await openElevation.getElevationAlongPath(path, 100, elevationProvider ? { provider: elevationProvider } : undefined);
      const elevationRes = {
        results: openRes.results.map((r) => ({
          elevation: r.elevation,
          location: new google.maps.LatLng(r.latitude, r.longitude),
          resolution: 0
        }))
      };
      const oldMarkers = [startMarker.current, endMarker.current, ...waypointMarkers.current].filter(Boolean);
      oldMarkers.forEach(m => m?.setMap(null));
      googleMarkersRef.current = googleMarkersRef.current.filter(m => !oldMarkers.includes(m));
      startMarker.current = null;
      endMarker.current = null;
      waypointMarkers.current = [];
      if (googlePolylineRef.current) {
        googlePolylineRef.current.setMap(null);
        googlePolylineRef.current = null;
      }
      startMarker.current = createCustomMarker(path[0], 'A', '#3b82f6');
      endMarker.current = createCustomMarker(path[path.length - 1], 'B', '#ef4444');
      saved.waypoints.forEach((wp, idx) => {
        waypointMarkers.current.push(createCustomMarker({ lat: wp.lat, lng: wp.lng }, (idx + 1).toString(), '#f59e0b'));
      });
      const gmap = googleMapRef.current;
      if (gmap) {
        const pathForPoly = path.map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
        googlePolylineRef.current = new google.maps.Polyline({ path: pathForPoly, strokeColor: '#ff3020', strokeWeight: 5, clickable: true });
        googlePolylineRef.current.setMap(gmap);
        googlePolylineRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) handleLocationClickRef.current(e.latLng.lat(), e.latLng.lng());
        });
      }
      const modeFromProfile = payload.profile === 'driving' ? TravelMode.DRIVING : payload.profile === 'cycling' ? TravelMode.BICYCLING : TravelMode.WALKING;
      setMode(modeFromProfile);
      setRoute({
        origin: saved.origin,
        destination: saved.destination,
        distance: payload.distance,
        duration: payload.duration,
        path,
        elevation: elevationRes.results
      });
      lastRouteRequestRef.current = {
        origin: saved.origin.trim(),
        destination: saved.destination.trim(),
        waypointNames: saved.waypoints.map(w => (w.name || '').trim()),
        mode: modeFromProfile
      };
      setRouteSource('OSRM');
      setSimulation({ isActive: false, currentIndex: 0, speed: 100 });
      setAppPhase('IDLE');
      svDisplayPathIndexRef.current = 0;
      lastDisplayedPanoPathIndexRef.current = -1;
      lastCoachedIndex.current = -1;
      originLocationRef.current = path[0];
      destLocationRef.current = path[path.length - 1];
      if (path.length > 0) {
        const startPos = path[0];
        const heading = path.length > 1 ? computeHeading(startPos, path[1]) : 0;
        setPanoramaView(startPos, heading);
      }
      setAppPhase('PREPARING');
      setPreparingProgress({ k: 0, n: 1 });
      const { panoData, sampleCount } = await preFetchStreetViewData(path, (k, n) => setPreparingProgress({ k, n }), { maxDistanceM: 300, intervalM: 10 });
      setPreparingProgress(null);
      const coverage = sampleCount > 0 ? panoData.length / sampleCount : 0;
      setRoute((prev) => (prev ? { ...prev, panoData, streetViewCoverage: coverage, streetViewDisabled: coverage < COVERAGE_MIN } : null));
      setAppPhase('IDLE');
      if (googleMapRef.current && path.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        path.forEach((p: any) => bounds.extend(p));
        googleMapRef.current.fitBounds(bounds);
      }
    } finally {
      setLoading(false);
    }
  }, [elevationProvider, setPanoramaView, preFetchStreetViewData]);

  useEffect(() => {
    restoreRouteFromSavedGeometryRef.current = restoreRouteFromSavedGeometry;
  }, [restoreRouteFromSavedGeometry]);

  const clearMapOverlays = () => {
    setAppPhase('IDLE');
    setPreparingProgress(null);
    if (googlePolylineRef.current) { googlePolylineRef.current.setMap(null); googlePolylineRef.current = null; }
    googleMarkersRef.current.forEach(m => m.setMap(null));
    googleMarkersRef.current = [];
    if (simulationMarker.current) { simulationMarker.current.setMap(null); simulationMarker.current = null; }
    startMarker.current = null;
    endMarker.current = null;
    waypointMarkers.current = [];
    if (searchMarkerRef.current) { searchMarkerRef.current.setMap(null); searchMarkerRef.current = null; }
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
    customWaypoints?: { name: string, location: any }[]
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
    if (googlePolylineRef.current) { googlePolylineRef.current.setMap(null); googlePolylineRef.current = null; }
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
      const toLatLng = (p: any) => {
        if (!p) return null;
        if (typeof p.lat === 'function' && typeof p.lng === 'function') return p;
        const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
        const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
        if (lat != null && lng != null && typeof google !== 'undefined' && google.maps?.LatLng) return new google.maps.LatLng(lat, lng);
        return null;
      };

      let path: any[] = [];
      let distText = '';
      let durText = '';
      try {
        const originLatLng = await getCoord(useOrigin, finalOrigin);
        const destLatLng = await getCoord(useDest, finalDestination);
        const wpLatLngs = activeWaypoints.map(wp => toLatLng(wp.location)).filter(Boolean) as any[];
        const profile = activeMode === TravelMode.DRIVING ? 'driving' : activeMode === TravelMode.BICYCLING ? 'cycling' : 'foot';
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
          if (googleMapRef.current && path.length) {
            const bounds = new google.maps.LatLngBounds();
            path.forEach((p: any) => bounds.extend(p));
            googleMapRef.current.fitBounds(bounds);
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
          const openRes = await openElevation.getElevationAlongPath(path, 100, elevationProvider ? { provider: elevationProvider } : undefined);
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

        // Duration: Car, Bike, Foot 모두 선택 속도(speedKmH) + 경사 보정으로 동일 계산 (실내 사이클 사용자 경로 선택 일관성)
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
        const segmentLength = 10;
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
        oldMarkers.forEach(m => m.setMap(null));
        googleMarkersRef.current = googleMarkersRef.current.filter(m => !oldMarkers.includes(m));
        startMarker.current = null;
        endMarker.current = null;
        waypointMarkers.current = [];
        if (googlePolylineRef.current) { googlePolylineRef.current.setMap(null); googlePolylineRef.current = null; }
        startMarker.current = createCustomMarker(densifiedPath[0], 'A', '#3b82f6');
        endMarker.current = createCustomMarker(densifiedPath[densifiedPath.length - 1], 'B', '#ef4444');
        activeWaypoints.forEach((wp, idx) => {
          waypointMarkers.current.push(createCustomMarker(wp.location, (idx + 1).toString(), '#f59e0b'));
        });
        const gmap = googleMapRef.current;
        if (gmap) {
          const pathForPoly = densifiedPath.map((p: any) => ({ lat: p.lat(), lng: p.lng() }));
          googlePolylineRef.current = new google.maps.Polyline({ path: pathForPoly, strokeColor: '#ff3020', strokeWeight: 5, clickable: true });
          googlePolylineRef.current.setMap(gmap);
          googlePolylineRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng) handleLocationClickRef.current(e.latLng.lat(), e.latLng.lng());
          });
        }
        setRoute({ origin: finalOrigin, destination: finalDestination, distance: distText, duration: durText, path: densifiedPath, elevation: elevationRes.results });
        lastRouteRequestRef.current = { origin: String(finalOrigin).trim(), destination: String(finalDestination).trim(), waypointNames: activeWaypoints.map(w => (w.name || '').trim()), mode: activeMode };

        // [경로 전환 시 거리뷰 멈춤 방지] 새 path 설정 직후 시뮬레이션·거리뷰 ref 리셋 (방안 1·3)
        setSimulation({ isActive: false, currentIndex: 0, speed: 100 });
        setAppPhase('IDLE');
        svDisplayPathIndexRef.current = 0;
        lastDisplayedPanoPathIndexRef.current = -1;
        lastSvDisplayUpdateRef.current = 0;
        lastCoachedIndex.current = -1;
        // (방안 2) 새 경로 시작점으로 거리뷰 즉시 이동 — 이전 경로 화면에 멈춰 보이는 시간 제거
        if (densifiedPath.length > 0) {
          const startPos = densifiedPath[0];
          const heading = densifiedPath.length > 1 ? computeHeading(startPos, densifiedPath[1]) : 0;
          setPanoramaView(startPos, heading);
        }

        // Progressive loading: pre-fetch first 200m (10m interval) for continuous display; rest loaded on-demand
        (async () => {
          setAppPhase('PREPARING');
          setPreparingProgress({ k: 0, n: 1 });
          const { panoData, sampleCount } = await preFetchStreetViewData(
            densifiedPath,
            (k, n) => setPreparingProgress({ k, n }),
            { maxDistanceM: 300, intervalM: 10 }
          );
          setPreparingProgress(null);
          const coverage = sampleCount > 0 ? panoData.length / sampleCount : 0;
          setRoute((prev) => (prev ? { ...prev, panoData, streetViewCoverage: coverage, streetViewDisabled: coverage < COVERAGE_MIN } : null));
          setAppPhase('IDLE');

          if (autoStart) {
            countdownDoneRef.current = async () => {
              // [시니어 방안] 변경된 경로의 첫 거리뷰가 디스플레이된 뒤에만 주행 시작. 무한 대기 방지로 타임아웃 시에도 주행은 시작됨.
              const firstPano = panoData.length > 0 ? panoData[0] : null;
              if (firstPano) {
                await setPanoramaViewByPanoId(firstPano.panoId, firstPano.heading, firstPano.isUserPhoto);
              } else {
                // 출발지 주변에 거리뷰 없음 → 지도 기반 주행. 사전 안내 표시 후 setPanoramaView(타임아웃 보장) 호출.
                setShowSvWarning(true);
                const startPos = densifiedPath[0];
                const heading = computeHeading(startPos, densifiedPath.length > 1 ? densifiedPath[1] : startPos);
                await setPanoramaView(startPos, heading);
              }
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
    const pathLen = currentRoute.path.length;
    // [시니어 방안] 변경된 경로의 첫 거리뷰가 디스플레이된 뒤에만 주행 시작. 무한 대기 방지로 타임아웃 시에도 주행은 시작됨.
    const firstPano = currentRoute.panoData && currentRoute.panoData.length > 0 ? currentRoute.panoData[0] : null;
    if (firstPano) {
      await setPanoramaViewByPanoId(firstPano.panoId, firstPano.heading, firstPano.isUserPhoto);
    } else if (pathLen > 0) {
      setShowSvWarning(true);
      const startPos = currentRoute.path[0];
      const heading = pathLen > 1 ? computeHeading(startPos, currentRoute.path[1]) : 0;
      await setPanoramaView(startPos, heading);
    }
    setSimulation({ isActive: true, currentIndex: 0, speed: 100 });
    setAppPhase('RUNNING');
    setIsSvFullScreen(true);
    setIsSvActive(true);
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
  }, [speedKmH, setPanoramaView, setPanoramaViewByPanoId]);

  const handleSetStart = () => {
    if (clickedLocation) {
      const newOrigin = clickedLocation.name || clickedLocation.address;
      originJustSelectedRef.current = true;
      originSetFromMapClickRef.current = true;
      setOrigin(newOrigin);
      setOriginSuggestions([]);
      setShowOriginSuggestions(false);
      setOriginHighlightIndex(-1);
      originLocationRef.current = clickedLocation.location; // CAPTURE EXACT COORDINATES

      if (startMarker.current) { startMarker.current.setMap(null); googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== startMarker.current); }
      startMarker.current = createCustomMarker(clickedLocation.location, 'A', '#3b82f6');

      setClickedLocation(null);
    }
  };

  const handleSetEnd = () => {
    if (clickedLocation) {
      const newDest = clickedLocation.name || clickedLocation.address;
      destJustSelectedRef.current = true;
      destSetFromMapClickRef.current = true;
      setDestination(newDest);
      setDestinationSuggestions([]);
      setShowDestinationSuggestions(false);
      setDestinationHighlightIndex(-1);
      destLocationRef.current = clickedLocation.location; // CAPTURE EXACT COORDINATES

      if (endMarker.current) { endMarker.current.setMap(null); googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== endMarker.current); }
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

    if (waypointMarkers.current[idx]) {
      waypointMarkers.current[idx].setMap(null);
      googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== waypointMarkers.current[idx]);
      waypointMarkers.current.splice(idx, 1);
      // 남은 웨이포인트 마커 라벨을 1, 2, … 로 재정렬
      waypointMarkers.current.forEach((m, i) => {
        m.setOptions({ label: { text: (i + 1).toString(), color: 'white', fontWeight: 'bold', fontSize: '14px' } });
      });
    }
  };

  const handleSelectOriginSuggestion = (item: SearchSuggestionItem) => {
    originJustSelectedRef.current = true;
    setOrigin(item.display_name);
    originLocationRef.current = { lat: item.lat, lng: item.lng };
    setOriginSuggestions([]);
    setShowOriginSuggestions(false);
    setOriginHighlightIndex(-1);
  };

  const handleSelectDestinationSuggestion = (item: SearchSuggestionItem) => {
    destJustSelectedRef.current = true;
    setDestination(item.display_name);
    destLocationRef.current = { lat: item.lat, lng: item.lng };
    setDestinationSuggestions([]);
    setShowDestinationSuggestions(false);
    setDestinationHighlightIndex(-1);
  };

  const handleRemoveStart = () => {
    setOrigin('');
    originLocationRef.current = null;
    setOriginSuggestions([]);
    setShowOriginSuggestions(false);
    if (startMarker.current) {
      startMarker.current?.setMap(null);
      googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== startMarker.current);
      startMarker.current = null;
    }
  };

  const handleRemoveEnd = () => {
    setDestination('');
    destLocationRef.current = null;
    setDestinationSuggestions([]);
    setShowDestinationSuggestions(false);
    if (endMarker.current) {
      endMarker.current?.setMap(null);
      googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== endMarker.current);
      endMarker.current = null;
    }
  };

  const handlePlaceSearch = async (term?: string) => {
    const query = term || searchTerm;
    if (!query || !googleMapRef.current) return;
    try {
      const res = await nominatim.search(query);
      const lat = res.lat;
      const lng = res.lng;
      const location = new google.maps.LatLng(lat, lng);
      const map = googleMapRef.current;
      map.setCenter({ lat, lng });
      map.setZoom(16);
      if (searchMarkerRef.current) {
        searchMarkerRef.current.setMap(null);
        googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== searchMarkerRef.current);
      }
      searchMarkerRef.current = new google.maps.Marker({
        position: { lat, lng },
        map,
        label: { text: 'P', color: 'white', fontWeight: 'bold', fontSize: '12px' },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      });
      googleMarkersRef.current.push(searchMarkerRef.current);
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
    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null);
      googleMarkersRef.current = googleMarkersRef.current.filter(m => m !== searchMarkerRef.current);
      searchMarkerRef.current = null;
    }
  };

  const handleToggleMapType = () => {
    const next = mapType === 'roadmap' ? 'hybrid' : 'roadmap';
    setMapType(next);
    if (googleMapRef.current) googleMapRef.current.setMapTypeId(next);
  };

  const isSaved = isCurrentRouteSaved();

  return (
    <div className="fixed inset-0 bg-slate-900 overflow-hidden font-sans">
      {/* LCP용: 지도 로드 전 껍데기 — 대용량 아이콘 없이 텍스트만 (icon-512는 2048px로 4.5MB 유발) */}
      {!isMapReady && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center bg-slate-900" aria-hidden="true">
          <p className="text-slate-400 text-2xl font-semibold">Cycle Simulator</p>
          <p className="absolute bottom-0 left-0 right-0 text-[10px] text-slate-500 text-center pb-2" style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
            Map data © OpenStreetMap contributors
          </p>
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

      {/* Street View Container — 주행 시 항상 표시(기본 기능). 전환 유지. */}
      <div ref={svContainerRef} className={`bg-black transition-all duration-500 ease-in-out overflow-hidden ${isSvActive ? (isSvFullScreen ? 'absolute inset-0 z-40 opacity-100' : 'absolute top-0 left-0 right-0 h-[50%] z-20 opacity-100 border-b-2 border-slate-700') : 'absolute top-0 left-0 w-full h-0 opacity-0 pointer-events-none z-0'}`}>
        <div ref={svRef1} className={`absolute inset-0 transition-opacity duration-300 ${visiblePanoIdx === 0 ? 'z-20 opacity-100' : 'z-10'}`} />
        <div ref={svRef2} className={`absolute inset-0 transition-opacity duration-300 ${visiblePanoIdx === 1 ? 'z-20 opacity-100' : 'z-10'}`} />
      </div>

      {loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[75] pointer-events-none">
          <div className="bg-slate-800/90 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl shadow-xl">
            <span className="route-search-blink text-white font-bold text-sm">Searching for route...</span>
          </div>
        </div>
      )}
      {appPhase === 'PREPARING' && preparingProgress && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[75] pointer-events-none">
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
      {/* 맵: 불투명 배경(bg-slate-900)으로 거리뷰 비침 방지, 전환 후 invalidateSize. */}
      <div
        ref={mapRef}
        className={`duration-500 ease-in-out bg-slate-900 ${!isSvActive ? 'absolute inset-0 z-10' : isSvFullScreen ? "absolute top-4 left-4 w-40 h-40 z-50 rounded-3xl border-4 border-white shadow-2xl overflow-hidden" : "absolute bottom-0 left-0 right-0 h-[50%] z-[25] overflow-hidden"} ${!mapRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{
          transitionProperty: (isSvActive && isSvFullScreen) ? 'top, left, border-radius, border-width' : 'top, left, right, bottom, width, height, border-radius',
          width: (isSvActive && isSvFullScreen) ? 160 : undefined,
          height: (isSvActive && isSvFullScreen) ? 160 : undefined,
        }}
        onTransitionEnd={() => {
          const map = googleMapRef.current;
          if (map) google.maps.event.trigger(map, 'resize');
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
        <button onClick={() => setShowCoverage(!showCoverage)} title={showCoverage ? "Hide Streetview Coverage" : "Show Streetview Coverage"} className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${showCoverage ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}>
          <RouteIcon size={24} aria-label={showCoverage ? "Hide Streetview Coverage" : "Show Streetview Coverage"} />
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
              <button key={idx} onClick={() => handlePlaceHistoryClick(term)} className="text-left w-full truncate text-[11px] text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded px-1 py-1 transition-colors flex items-center gap-2"><History size={10} className="text-slate-400" />{term}</button>
            ))}
          </div>
        )}
      </div>
      <div className={`absolute bottom-4 left-4 z-[60] flex items-end transition-all duration-300 ease-out overflow-hidden ${routeInputExpanded ? (historyExpanded ? (routeSettingsPanelExpanded ? 'w-[598px] min-w-[598px] max-w-[598px]' : 'w-[370px] min-w-[370px] max-w-[370px]') : (routeSettingsPanelExpanded ? 'w-[300px] min-w-[300px] max-w-[300px]' : 'w-[96px] min-w-[96px] max-w-[96px]')) : 'w-12 h-12 border-2 border-blue-600 rounded-full group'}`}>
        <div className={`bg-white/95 backdrop-blur-md rounded-[1.5rem] shadow-2xl flex flex-row w-full border border-slate-200 p-2 relative ${routeInputExpanded ? 'min-h-[140px]' : 'h-full'}`}>
          <div className={`flex flex-col items-center justify-center shrink-0 z-10 ${routeInputExpanded ? 'w-8 gap-0.5' : 'w-full h-full'}`}>
            <button onClick={() => setRouteInputExpanded(!routeInputExpanded)} title="Route Settings" className={`flex items-center justify-center text-slate-400 hover:text-slate-600 ${routeInputExpanded ? 'w-8 h-8' : 'w-full h-full'}`}>{routeInputExpanded ? <ChevronLeft size={20} /> : <Waypoints size={20} className="text-blue-600" />}</button>
            {routeInputExpanded && (
              <button onClick={() => setRouteSettingsPanelExpanded(!routeSettingsPanelExpanded)} title={routeSettingsPanelExpanded ? "Collapse Route Details" : "Expand Route Details"} className="w-8 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100" aria-label={routeSettingsPanelExpanded ? "Collapse Route Details" : "Expand Route Details"}>
                {routeSettingsPanelExpanded ? <ChevronLeft size={16} className="opacity-80" /> : <ChevronRight size={16} className="opacity-80" />}
              </button>
            )}
          </div>
          {routeInputExpanded && (
            <div className="flex flex-row w-full pl-1 gap-3">
              {routeSettingsPanelExpanded && (
              <div ref={routeInputContainerRef} className="flex-none w-[232px] flex flex-col justify-center gap-1.5">
                <div className="relative flex flex-col gap-1.5">
                  <div className="relative">
                    <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 h-7 bg-white shadow-sm w-full">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                      <input
                        className="flex-1 w-full text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate min-w-0"
                        placeholder="Start (지명·주소 입력)"
                        value={origin}
                        onChange={(e) => { setOrigin(e.target.value); originLocationRef.current = null; }}
                        onFocus={() => originSuggestions.length > 0 && setShowOriginSuggestions(true)}
                        onBlur={() => {
                          if (closeOriginSuggestRef.current) clearTimeout(closeOriginSuggestRef.current);
                          closeOriginSuggestRef.current = window.setTimeout(() => setShowOriginSuggestions(false), 180);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (originSuggestions.length === 0) return;
                            setShowOriginSuggestions(true);
                            setOriginHighlightIndex((i) => (i < originSuggestions.length - 1 ? i + 1 : i));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setOriginHighlightIndex((i) => (i <= 0 ? -1 : i - 1));
                            return;
                          }
                          if (e.key === 'Enter') {
                            if (originHighlightIndex >= 0 && originSuggestions[originHighlightIndex]) {
                              e.preventDefault();
                              handleSelectOriginSuggestion(originSuggestions[originHighlightIndex]);
                            }
                            return;
                          }
                          if (e.key === 'Escape') {
                            setShowOriginSuggestions(false);
                            setOriginHighlightIndex(-1);
                          }
                        }}
                      />
                      <button onClick={handleRemoveStart} title="Remove Start" className="text-slate-400 hover:text-red-500 shrink-0">
                        <X size={10} />
                      </button>
                    </div>
                    {showOriginSuggestions && originSuggestions.length > 0 && (
                      <ul className="absolute top-full left-0 right-0 mt-0.5 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[70] max-h-40 overflow-y-auto" role="listbox" aria-activedescendant={originHighlightIndex >= 0 ? `origin-suggestion-${originHighlightIndex}` : undefined}>
                        {originSuggestions.map((item, idx) => (
                          <li key={idx} id={`origin-suggestion-${idx}`} role="option" aria-selected={originHighlightIndex === idx}>
                            <button ref={idx === originHighlightIndex ? (el) => { originSuggestionItemRef.current = el; el?.scrollIntoView({ block: 'nearest' }); } : undefined} type="button" className={`w-full text-left px-2 py-1.5 text-[11px] truncate ${originHighlightIndex === idx ? 'bg-blue-100 text-blue-900' : 'text-slate-700 hover:bg-blue-50'}`} onMouseDown={(e) => { e.preventDefault(); handleSelectOriginSuggestion(item); }} onMouseEnter={() => setOriginHighlightIndex(idx)}>
                              {item.display_name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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
                  <div className="relative">
                    <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 h-7 bg-white shadow-sm w-full">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
                      <input
                        className="flex-1 w-full text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate min-w-0"
                        placeholder="End (지명·주소 입력)"
                        value={destination}
                        onChange={(e) => { setDestination(e.target.value); destLocationRef.current = null; }}
                        onFocus={() => destinationSuggestions.length > 0 && setShowDestinationSuggestions(true)}
                        onBlur={() => {
                          if (closeDestSuggestRef.current) clearTimeout(closeDestSuggestRef.current);
                          closeDestSuggestRef.current = window.setTimeout(() => setShowDestinationSuggestions(false), 180);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (destinationSuggestions.length === 0) return;
                            setShowDestinationSuggestions(true);
                            setDestinationHighlightIndex((i) => (i < destinationSuggestions.length - 1 ? i + 1 : i));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setDestinationHighlightIndex((i) => (i <= 0 ? -1 : i - 1));
                            return;
                          }
                          if (e.key === 'Enter') {
                            if (destinationHighlightIndex >= 0 && destinationSuggestions[destinationHighlightIndex]) {
                              e.preventDefault();
                              handleSelectDestinationSuggestion(destinationSuggestions[destinationHighlightIndex]);
                            }
                            return;
                          }
                          if (e.key === 'Escape') {
                            setShowDestinationSuggestions(false);
                            setDestinationHighlightIndex(-1);
                          }
                        }}
                      />
                      <button onClick={handleRemoveEnd} title="Remove End" className="text-slate-400 hover:text-red-500 shrink-0">
                        <X size={10} />
                      </button>
                    </div>
                    {showDestinationSuggestions && destinationSuggestions.length > 0 && (
                      <ul className="absolute top-full left-0 right-0 mt-0.5 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[70] max-h-40 overflow-y-auto" role="listbox" aria-activedescendant={destinationHighlightIndex >= 0 ? `dest-suggestion-${destinationHighlightIndex}` : undefined}>
                        {destinationSuggestions.map((item, idx) => (
                          <li key={idx} id={`dest-suggestion-${idx}`} role="option" aria-selected={destinationHighlightIndex === idx}>
                            <button ref={idx === destinationHighlightIndex ? (el) => { destSuggestionItemRef.current = el; el?.scrollIntoView({ block: 'nearest' }); } : undefined} type="button" className={`w-full text-left px-2 py-1.5 text-[11px] truncate ${destinationHighlightIndex === idx ? 'bg-red-100 text-red-900' : 'text-slate-700 hover:bg-red-50'}`} onMouseDown={(e) => { e.preventDefault(); handleSelectDestinationSuggestion(item); }} onMouseEnter={() => setDestinationHighlightIndex(idx)}>
                              {item.display_name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 w-full px-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Speed</span>
                  <input type="number" min={10} max={70} value={speedKmH} onChange={(e) => setSpeedKmH(Number(e.target.value) || 0)} onBlur={(e) => { const v = Number(e.target.value) || 10; setSpeedKmH(Math.min(70, Math.max(10, v))); }} className="speed-input-no-spinner w-6 h-5 text-[10px] font-bold text-center bg-slate-50 border border-slate-300 rounded text-slate-700 focus:outline-none focus:border-blue-500 p-0 shrink-0" />
                  <button type="button" onClick={() => setSpeedKmH((prev) => Math.max(10, prev - 1))} title="속도 1 km/h 감소" className="w-[14.4px] h-[19.2px] flex items-center justify-center rounded bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 active:scale-95 transition-transform shrink-0 disabled:opacity-50" disabled={speedKmH <= 10} aria-label="속도 감소"><Minus size={10} /></button>
                  <input type="range" min={10} max={70} step={1} value={speedKmH} onChange={(e) => setSpeedKmH(Number(e.target.value))} className="w-[51.2px] h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                  <button type="button" onClick={() => setSpeedKmH((prev) => Math.min(70, prev + 1))} title="속도 1 km/h 증가" className="w-[14.4px] h-[19.2px] flex items-center justify-center rounded bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 active:scale-95 transition-transform shrink-0 disabled:opacity-50" disabled={speedKmH >= 70} aria-label="속도 증가"><Plus size={10} /></button>
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
                  <button onClick={() => { setMode(TravelMode.DRIVING); calculateRoute(TravelMode.DRIVING, false); }} title="Car" disabled={loading || !origin || !destination} className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 active:scale-95 transition-transform ${mode === TravelMode.DRIVING ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'}`}>
                    <Car size={14} />
                  </button>
                  <button onClick={() => { setMode(TravelMode.BICYCLING); calculateRoute(TravelMode.BICYCLING, false); }} title="Bike" disabled={loading || !origin || !destination} className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 active:scale-95 transition-transform ${mode === TravelMode.BICYCLING ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'}`}>
                    <Bike size={14} />
                  </button>
                  <button onClick={() => { setMode(TravelMode.WALKING); calculateRoute(TravelMode.WALKING, false); }} title="Foot" disabled={loading || !origin || !destination} className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 active:scale-95 transition-transform ${mode === TravelMode.WALKING ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'}`}>
                    <Footprints size={14} />
                  </button>
                  <button onClick={() => { if (route && lastRouteRequestRef.current && inputsMatch(origin, destination, waypoints, mode, lastRouteRequestRef.current)) { countdownDoneRef.current = () => startSimulationOnly(route); setCountdown(3); } else { calculateRoute(mode, true); } }} title="Go" disabled={loading || !origin || !destination || !route} className="ml-auto w-7 bg-blue-700 text-white rounded-lg h-7 text-xs font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? <Activity size={14} className="animate-spin" /> : 'Go'}</button>
                </div>
              </div>
              )}

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
                    <ElevationChartView data={route.elevation} currentIndex={simulation.currentIndex} pathLength={route.path.length} />
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
            <button onClick={() => setClickedLocation(null)} title="Close" className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1.5"><X size={10} /></button>
            <p className="text-slate-800 text-[12px] font-bold truncate">{clickedLocation.name}</p>
            <p className="text-slate-500 text-[10px] mb-2">
              {clickedLocation.lat.toFixed(4)}, {clickedLocation.lng.toFixed(4)}
              {clickedLocation.elevation != null
                ? ` · Elevation ${Math.round(clickedLocation.elevation)}m`
                : ' · Elevation —'}
            </p>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              <button onClick={handleSetStart} title="Set as Start" className="py-2 bg-blue-50 text-blue-700 rounded-xl text-[9px] font-black tracking-tighter uppercase">START (A)</button>
              <button onClick={handleAddWaypoint} disabled={waypoints.length >= 3} title="Add Waypoint" className={`py-2 rounded-xl text-[9px] font-black tracking-tighter uppercase flex items-center justify-center gap-0.5 ${waypoints.length >= 3 ? 'bg-slate-100 text-slate-400' : 'bg-amber-50 text-amber-700'}`}>
                <Plus size={10} /> WAYPOINT ({waypoints.length}/3)
              </button>
              <button onClick={handleSetEnd} title="Set as Destination" className="py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black tracking-tighter uppercase">END (B)</button>
            </div>
          </div>
        </div>
      )}

      {/* About Page */}
      {showAbout && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <About onClose={() => setShowAbout(false)} />
        </div>
      )}
      {/* About Info - (i) circle, top-right; opens modal (no page navigation, state preserved) */}
      <button
        type="button"
        onClick={() => setShowAbout(true)}
        title="About Info"
        className="fixed z-[9999] flex items-center justify-center rounded-full border border-slate-400 text-slate-600 bg-white/90 hover:bg-slate-100 touch-manipulation"
        style={{
          top: 0,
          right: 0,
          width: '20px',
          height: '20px',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          zIndex: 9999,
        }}
        aria-label="About Information"
        id="debug-about-btn"
      >
        <Info size={10} strokeWidth={2} />
      </button>

    </div>
  );
};

export default App;
