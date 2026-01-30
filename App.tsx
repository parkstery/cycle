import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, Navigation, Play, Pause, RotateCcw, Trash2, X, MapPin, Target, User, Volume2, AreaChart as AreaChartIcon, ChevronRight, ChevronLeft, History, Info, Route as RouteIcon, Zap, Activity, ShieldAlert, Bike, Footprints, Car, Maximize2, Minimize2, Waypoints, ArrowUpDown, Plus, CheckCircle2, Layers, Star } from 'lucide-react';
import { RouteInfo, TravelMode, SimulationState, CoachingData, SavedRoute } from './types';
import { getAdvancedCoaching } from './services/aiCoach';

// Declare google global
declare var google: any;

const PLAYLIST = [
  "https://www.dropbox.com/scl/fi/oq5lnyyc41rxso4kgm6en/1.mp3?rlkey=1j6uj6kxtu833jrljqz5qa0wx&st=ig1goyal&raw=1",
  "https://www.dropbox.com/scl/fi/qduirdh7mt24ucms1jn32/.mp3?rlkey=09o1232kpdahjlsns95ppbhrc&st=hsarn2s1&raw=1",
  "https://www.dropbox.com/scl/fi/8fbdd1t6v18z2m17ecidt/1.mp3?rlkey=sm15ow3aun8az4z6y2vseefy0&st=kbmlsn1m&raw=1",
  "https://www.dropbox.com/scl/fi/bvtw5s1pimhv42k3bgdxh/.mp3?rlkey=6ujd668vw7kzioe277gkqvsq7&st=cq1x65f8&raw=1",
  "https://www.dropbox.com/scl/fi/j1hzv2yx22uc0xl9redbj/1.mp3?rlkey=vjay2iyw06u84gygzxcoatz9w&st=9so3eh5n&raw=1",
  "https://www.dropbox.com/scl/fi/2avdaszs6csfvocofa9l9/.mp3?rlkey=ssqfzfmapfa3kkrqdifazbmoj&st=h4pfgwtr&raw=1"
];

const App: React.FC = () => {
  // Map & Service References
  const mapRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const googleMap = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const simulationMarker = useRef<any>(null);
  const startMarker = useRef<any>(null);
  const endMarker = useRef<any>(null);
  const waypointMarkers = useRef<any[]>([]);
  const tempMarker = useRef<any>(null);
  const panorama = useRef<any>(null);
  const geocoder = useRef<any>(null);
  const placesService = useRef<any>(null);
  const elevationService = useRef<any>(null);
  const polylineOverlay = useRef<any>(null);
  const coverageLayer = useRef<any>(null);
  const svServiceRef = useRef<any>(null); 
  const svErrorCount = useRef(0);

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

  // Favorites (My Routes) State
  const [favoriteRoutes, setFavoriteRoutes] = useState<SavedRoute[]>(() => {
    const saved = localStorage.getItem('favorite_routes');
    return saved ? JSON.parse(saved) : [];
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

  // Helper to check if current route is saved
  const isCurrentRouteSaved = useCallback(() => {
    if (!origin || !destination) return false;
    return favoriteRoutes.some(saved => 
        saved.origin === origin && 
        saved.destination === destination && 
        saved.waypoints.length === waypoints.length &&
        saved.waypoints.every((wp, i) => wp.name === saved.waypoints[i].name)
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
    
    const restoredWaypoints = saved.waypoints.map(wp => ({
        name: wp.name,
        location: new google.maps.LatLng(wp.lat, wp.lng)
    }));
    setWaypoints(restoredWaypoints);
    
    calculateRoute(mode, false, saved.origin, saved.destination, restoredWaypoints);
  };

  const handleDeleteFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavorites = favoriteRoutes.filter(r => r.id !== id);
    setFavoriteRoutes(newFavorites);
    localStorage.setItem('favorite_routes', JSON.stringify(newFavorites));
  };

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
            scaleControl: false,
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
            polylineOptions: { strokeColor: '#3b82f6', strokeOpacity: 0.6, strokeWeight: 5 }
        });

        geocoder.current = new google.maps.Geocoder();
        placesService.current = new google.maps.places.PlacesService(googleMap.current);
        elevationService.current = new google.maps.ElevationService();
        
        // Restore Coverage Layer
        coverageLayer.current = new google.maps.StreetViewCoverageLayer();

        panorama.current = new google.maps.StreetViewPanorama(svRef.current, {
             visible: false,
             enableCloseButton: false,
             disableDefaultUI: true,
             clickToGo: false,
             motionTracking: true, // Enable motion tracking (gyroscope)
             motionTrackingControl: true // Explicitly show the motion tracking button
        });
        googleMap.current.setStreetView(panorama.current);
        svServiceRef.current = new google.maps.StreetViewService();

        // Restore Street View Listeners
        panorama.current.addListener('status_changed', () => {
          if (panorama.current) {
            const status = panorama.current.getStatus();
            setSvStatus(status);
            if (status === 'OK') { svErrorCount.current = 0; setShowSvWarning(false); }
            else { svErrorCount.current += 1; if (svErrorCount.current >= 5) setShowSvWarning(true); }
          }
        });
        panorama.current.addListener('visible_changed', () => {
          if (panorama.current) {
             const visible = panorama.current.getVisible();
             setIsSvActive(visible);
             setTimeout(() => { 
                if (googleMap.current) google.maps.event.trigger(googleMap.current, 'resize'); 
             }, 300);
          }
        });

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
      if (panorama.current) google.maps.event.trigger(panorama.current, 'resize');
    }, 550);
  }, [isSvFullScreen]);

  useEffect(() => {
    let interval: number;
    if (simulation.isActive && route) {
      interval = window.setInterval(() => {
        setElapsedTime(prev => prev + 1);
        const metersPerSecond = (speedKmH * 1000) / 3600;
        setCoveredDistance(prev => prev + metersPerSecond);
      }, 1000);
    }
    return () => clearInterval(interval);
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
        if (audioRef