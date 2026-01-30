import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, Navigation, Play, Pause, RotateCcw, Trash2, X, MapPin, Target, User, Volume2, AreaChart as AreaChartIcon, ChevronRight, ChevronLeft, History, Info, Route as RouteIcon, Zap, Activity, ShieldAlert, Bike, Footprints, Car, Maximize2, Minimize2, Waypoints, ArrowUpDown, Plus, CheckCircle2, Layers } from 'lucide-react';
import { RouteInfo, TravelMode, SimulationState, CoachingData } from './types';
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

  // History States
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent_searches');
    return saved ? JSON.parse(saved) : [];
  });
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
    if (directionsRenderer.current) directionsRenderer.current.setDirections({ routes: [] });
    if (polylineOverlay.current) { polylineOverlay.current.setMap(null); polylineOverlay.current = null; }
    if (simulationMarker.current) { simulationMarker.current.setMap(null); simulationMarker.current = null; }
    if (startMarker.current) { startMarker.current.setMap(null); startMarker.current = null; }
    if (endMarker.current) { endMarker.current.setMap(null); endMarker.current = null; }
    waypointMarkers.current.forEach(m => m.setMap(null));
    waypointMarkers.current = [];
    setRoute(null);
    setSimulation({ isActive: false, currentIndex: 0, speed: 100 });
    setCoachData(null);
    setRouteSource(null);
    setWaypoints([]);
    
    // Explicitly clear start and end inputs
    setOrigin('');
    setDestination('');

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
      speak(`Starting the ride. Total distance ${route.distance}, speed ${speedKmH} km/h. Shall we start a fun ride today?`);
    }
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
    setLoading(true);
    setCoachData(null);
    setRouteSource(null);
    setElapsedTime(0);
    setCoveredDistance(0);
    lastCoachedIndex.current = -1;
    if (polylineOverlay.current) { polylineOverlay.current.setMap(null); polylineOverlay.current = null; }
    const ds = new google.maps.DirectionsService();
    const es = new google.maps.ElevationService();
    try {
      let path: any[] = [];
      let distText = '', durText = '';
      try {
        const result = await ds.route({ 
          origin: finalOrigin, 
          destination: finalDestination, 
          waypoints: activeWaypoints.map(wp => ({ location: wp.location, stopover: true })),
          optimizeWaypoints: true,
          travelMode: google.maps.TravelMode[activeMode] 
        });
        if (result.routes[0]) {
          directionsRenderer.current?.setDirections(result);
          path = result.routes[0].overview_path;
          let totalMeters = 0;
          result.routes[0].legs.forEach((leg: any) => { totalMeters += leg.distance.value; });
          distText = totalMeters >= 1000 ? `${(totalMeters/1000).toFixed(1)} km` : `${totalMeters} m`;
          let totalSecs = 0;
          result.routes[0].legs.forEach((leg: any) => { totalSecs += leg.duration.value; });
          durText = totalSecs >= 3600 ? `${Math.floor(totalSecs/3600)} h ${Math.round((totalSecs%3600)/60)} min` : `${Math.round(totalSecs/60)} min`;
          setRouteSource('GOOGLE');
        }
      } catch (e) {
        // Safe geocoding with Promises and Error Handling
        const geocodePromise = (addr: string) => new Promise<any>((resolve, reject) => {
            geocoder.current.geocode({address: addr}, (results: any, status: any) => {
                if (status === 'OK' && results && results[0]) {
                    resolve(results[0].geometry.location);
                } else {
                    reject(status);
                }
            });
        });

        const originLatLng = await geocodePromise(finalOrigin);
        const destLatLng = await geocodePromise(finalDestination);
        const wpLatLngs = await Promise.all(activeWaypoints.map(wp => geocodePromise(wp.name).catch(() => null))); // Ignore failed waypoints for OSRM

        const profile = activeMode === TravelMode.BICYCLING ? 'cycling' : 'foot';
        // Filter out null waypoints
        const validWps = wpLatLngs.filter(p => p !== null);
        
        const coords = [originLatLng, ...validWps, destLatLng].map(p => `${p.lng()},${p.lat()}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=polyline`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.code === 'Ok') {
          path = google.maps.geometry.encoding.decodePath(data.routes[0].geometry);
          distText = `${(data.routes[0].distance / 1000).toFixed(1)} km`;
          durText = `${Math.round(data.routes[0].duration / 60)} min`;
          setRouteSource('OSRM');
          const b = new google.maps.LatLngBounds(); path.forEach(p => b.extend(p)); googleMap.current.fitBounds(b);
        }
      }
      if (path.length > 0) {
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
        
        const h = Math.floor(calculatedSeconds / 3600);
        const m = Math.round((calculatedSeconds % 3600) / 60);
        durText = h > 0 ? `${h} h ${m} min` : `${m} min`;

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
        const historyItem = `${finalOrigin}|${finalDestination}`;
        setRecentSearches(prev => {
           const filtered = prev.filter(item => item !== historyItem);
           const updated = [historyItem, ...filtered].slice(0, 5);
           localStorage.setItem('recent_searches', JSON.stringify(updated));
           return updated;
        });
        if (autoStart) {
          setSimulation({ isActive: true, currentIndex: 0, speed: 100 });
          setIsCoachThinking(true);
          const firstCoach = await getAdvancedCoaching(elevationRes.results[0].elevation, elevationRes.results.slice(0, 10), speedKmH);
          setCoachData(firstCoach);
          speak(`Starting the ride. Total distance ${distText}, speed ${speedKmH} km/h. Shall we start a fun ride today?`);
          setIsCoachThinking(false);
          lastCoachedIndex.current = 0;
        }
      }
    } catch (err) { alert("경로를 찾을 수 없습니다."); }
    finally { setLoading(false); }
  }, [origin, destination, waypoints, mode, speedKmH]);

  const handleSetStart = () => {
    if (clickedLocation) {
      const newOrigin = clickedLocation.name || clickedLocation.address;
      setOrigin(newOrigin);
      
      if (startMarker.current) startMarker.current.setMap(null);
      startMarker.current = createCustomMarker(clickedLocation.location, 'A', '#3b82f6');

      setClickedLocation(null);
      if (destination) { calculateRoute(mode, false, newOrigin, destination); }
    }
  };

  const handleSetEnd = () => {
    if (clickedLocation) {
      const newDest = clickedLocation.name || clickedLocation.address;
      setDestination(newDest);

      if (endMarker.current) endMarker.current.setMap(null);
      endMarker.current = createCustomMarker(clickedLocation.location, 'B', '#ef4444');

      setClickedLocation(null);
      if (origin) { calculateRoute(mode, false, origin, newDest); }
    }
  };

  const handleSwapEndpoints = () => {
    const tempOrigin = origin;
    const newOrigin = destination;
    const newDestination = tempOrigin;
    const newWaypoints = [...waypoints].reverse();

    setOrigin(newOrigin);
    setDestination(newDestination);
    setWaypoints(newWaypoints);
    
    // Trigger recalculation immediately with new values
    if (newOrigin && newDestination) {
        calculateRoute(mode, false, newOrigin, newDestination, newWaypoints);
    }
  };

  const handleAddWaypoint = () => {
    if (clickedLocation && waypoints.length < 3) {
      const wpName = clickedLocation.name || clickedLocation.address;
      const newWaypoints = [...waypoints, { name: wpName, location: clickedLocation.location }];
      setWaypoints(newWaypoints);

      const m = createCustomMarker(clickedLocation.location, (waypoints.length + 1).toString(), '#f59e0b');
      waypointMarkers.current.push(m);

      setClickedLocation(null);
      // Recalculate if we have full set
      if (origin && destination) { calculateRoute(mode, false, origin, destination, newWaypoints); }
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

    // Recalculate after removal if routing is active
    if (origin && destination) {
       calculateRoute(mode, false, origin, destination, newWaypoints);
    }
  };

  const handleHistoryClick = (historyItem: string) => {
      const parts = historyItem.split('|');
      if (parts.length === 2) {
          setOrigin(parts[0]);
          setDestination(parts[1]);
          calculateRoute(mode, false, parts[0], parts[1]);
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
  
  const handleToggleMapType = () => {
    if (googleMap.current) {
        const currentType = googleMap.current.getMapTypeId();
        const newType = currentType === 'roadmap' ? 'hybrid' : 'roadmap';
        googleMap.current.setMapTypeId(newType);
        setMapType(newType);
    }
  };

  useEffect(() => {
    let timer: number;
    if (simulation.isActive && route) {
      if (tempMarker.current) { tempMarker.current.setMap(null); }
      const currentIdx = simulation.currentIndex;
      if (currentIdx >= route.path.length - 1) {
          setSimulation(prev => ({ ...prev, isActive: false }));
          speak(`Ride finished. Distance covered ${route.distance}, duration ${route.duration}.`);
          return;
      }
      const currentPos = route.path[currentIdx];
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
      if (panorama.current?.getVisible()) {
        panorama.current.setPov({ heading, pitch: 0 });
        const currentPanoLoc = panorama.current.getLocation()?.latLng;
        const distFromLastPano = currentPanoLoc ? google.maps.geometry.spherical.computeDistanceBetween(currentPos, currentPanoLoc) : Infinity;
        
        // Revised Update Logic: Use Link Traversal or Fallback to reduced threshold
        if (distFromLastPano > 10 || !currentPanoLoc) {
            let foundLink = false;
            
            // 1. Link Traversal: Check links from current panorama
            if (currentPanoLoc) {
                const links = panorama.current.getLinks();
                if (links && links.length > 0) {
                    let bestLink = null;
                    let minDiff = 360;
                    
                    for (const link of links) {
                        const diff = Math.abs(link.heading - heading);
                        const trueDiff = Math.min(diff, 360 - diff); // Account for 360 wrap
                        if (trueDiff < minDiff) {
                            minDiff = trueDiff;
                            bestLink = link;
                        }
                    }
                    
                    // If a link is reasonably aligned (e.g. within 60 degrees), use it directly
                    if (bestLink && minDiff < 60) {
                        panorama.current.setPano(bestLink.pano);
                        foundLink = true;
                    }
                }
            }

            // 2. Fallback: Radius Search (Existing method)
            if (!foundLink && svServiceRef.current) {
                svServiceRef.current.getPanorama({
                    location: currentPos, radius: 20, source: google.maps.StreetViewSource.OUTDOOR, preference: google.maps.StreetViewPreference.NEAREST
                }, (data: any, status: string) => {
                    if (status === 'OK') { panorama.current.setPano(data.location.pano); }
                });
            }
        }
        if (isSvFullScreen && googleMap.current) { googleMap.current.panTo(currentPos); }
      }
      if (currentIdx > 0 && currentIdx % 21 === 0 && currentIdx !== lastCoachedIndex.current) {
          (async () => {
              const currentElev = route.elevation[Math.floor((currentIdx/route.path.length)*route.elevation.length)]?.elevation || 0;
              const upcoming = route.elevation.slice(Math.floor((currentIdx/route.path.length)*route.elevation.length), Math.floor(((currentIdx+20)/route.path.length)*route.elevation.length));
              setIsCoachThinking(true);
              const newCoaching = await getAdvancedCoaching(currentElev, upcoming, speedKmH, coachData?.gear);
              setCoachData(newCoaching); speak(newCoaching.tip); setIsCoachThinking(false);
          })();
          lastCoachedIndex.current = currentIdx;
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
  }, [simulation.isActive, simulation.currentIndex, route, speedKmH, isSvFullScreen]); 

  return (
    <div className="fixed inset-0 bg-slate-900 overflow-hidden font-sans">
      <div ref={svRef} className={`bg-black transition-all duration-500 ease-in-out ${isSvActive ? (isSvFullScreen ? 'absolute inset-0 z-40 opacity-100' : 'absolute top-0 left-0 right-0 h-[50%] z-20 opacity-100 border-b-2 border-slate-700') : 'absolute top-0 left-0 w-full h-0 opacity-0 pointer-events-none z-0'}`} />
      {isSvActive && showSvWarning && (
        <div className={`absolute left-4 z-[45] flex items-center justify-start pointer-events-none ${isSvFullScreen ? 'bottom-32' : 'top-[42%]'}`}>
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2 shadow-xl animate-in fade-in zoom-in duration-300">
             <ShieldAlert size={18} className="text-amber-500 animate-pulse" />
             <span className="text-white font-bold text-xs">거리뷰 이미지가 없는 구간입니다.</span>
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
      <div className="absolute right-4 top-4 z-50 flex flex-col gap-2">
        <button onClick={handleToggleMapType} title="Change Map Style" className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${mapType === 'hybrid' ? 'bg-slate-800 text-white' : 'bg-white text-slate-400'}`}>
            <Layers size={24} />
        </button>
        <button onClick={() => setShowCoverage(!showCoverage)} title="Toggle Route Coverage" className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${showCoverage ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}>
            <RouteIcon size={24} />
        </button>
        <button onClick={() => panorama.current?.setVisible(!isSvActive)} title="Toggle Street View" className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${isSvActive ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-400'}`}>
            <User size={24} fill={isSvActive ? "currentColor" : "none"} />
        </button>
        {isSvActive && (
            <button onClick={() => setIsSvFullScreen(!isSvFullScreen)} title="Toggle Fullscreen" className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center bg-white text-slate-900`}>
                {isSvFullScreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
            </button>
        )}
      </div>

      <div className={`absolute top-4 left-4 z-[80] flex flex-col items-start transition-all duration-300 ease-out bg-white/95 backdrop-blur-md shadow-2xl overflow-hidden ${searchExpanded ? 'w-[300px] max-w-[calc(100vw-32px)] rounded-2xl border border-slate-200' : 'w-12 h-12 rounded-full border-2 border-blue-600 group'}`}>
        <div className="flex items-center w-full h-12 pr-5 shrink-0">
          <button onClick={() => setSearchExpanded(!searchExpanded)} title="Search Places" className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-slate-500 hover:text-blue-600">{searchExpanded ? <ChevronLeft size={20} /> : <Search size={20} />}</button>
          <input type="text" placeholder="Search place..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePlaceSearch()} className="flex-1 bg-transparent border-none outline-none text-slate-900 font-bold text-[12px] pr-2" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} title="Clear Search" className="flex-shrink-0 w-8 h-full flex items-center justify-center text-slate-400 hover:text-red-500">
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
      <div className={`absolute bottom-4 left-4 z-[60] flex items-end transition-all duration-300 ease-out overflow-hidden ${routeInputExpanded ? (historyExpanded ? 'w-[95%] max-w-[500px]' : 'w-[95%] max-w-[290px]') : 'w-12 h-12 border-2 border-blue-600 rounded-full group'}`}>
        <div className={`bg-white/95 backdrop-blur-md rounded-[1.5rem] shadow-2xl flex flex-row w-full border border-slate-200 p-2 relative ${routeInputExpanded ? 'min-h-[140px]' : 'h-full'}`}>
          <button onClick={() => setRouteInputExpanded(!routeInputExpanded)} title="Route Settings" className={`absolute left-0 top-0 w-8 h-full flex items-center justify-center text-slate-400 hover:text-slate-600 z-10 ${!routeInputExpanded ? 'w-full' : ''}`}>{routeInputExpanded ? <ChevronLeft size={20} /> : <Waypoints size={20} className="text-blue-600" />}</button>
          {routeInputExpanded && (
            <div className="flex flex-row w-full pl-6 gap-3">
                <div className="w-56 flex-none flex flex-col justify-center gap-1.5">
                    <div className="relative flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 h-7 bg-white shadow-sm w-full">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                            <input className="flex-1 w-full text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate min-w-0" placeholder="Start" value={origin} onChange={(e) => setOrigin(e.target.value)} />
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
                            <input className="flex-1 w-full text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate min-w-0" placeholder="End" value={destination} onChange={(e) => setDestination(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex items-center gap-1 w-full px-0.5">
                         <span className="text-[9px] font-bold text-slate-400 uppercase">Speed</span>
                         <input type="number" min="10" max="100" value={speedKmH} onChange={(e) => setSpeedKmH(Number(e.target.value))} className="w-8 h-5 text-[10px] font-bold text-center bg-slate-50 border border-slate-300 rounded text-slate-700 focus:outline-none focus:border-blue-500 p-0 shrink-0" />
                         <input type="range" min="10" max="100" step="1" value={speedKmH} onChange={(e) => setSpeedKmH(Number(e.target.value))} className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                         <div className="flex items-center gap-1 ml-auto shrink-0">
                             <button onClick={handleSwapEndpoints} title="Swap Origin & Destination" className="w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-95 transition-transform"><ArrowUpDown size={12} className="text-slate-600" /></button>
                             <button onClick={clearMapOverlays} title="Clear Route" className="w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-95 transition-transform"><Trash2 size={12} className="text-slate-600" /></button>
                         </div>
                    </div>
                    <div className="flex items-center gap-1 w-full">
                        <div className="flex-1 flex items-center justify-center gap-2 bg-slate-100 border border-slate-200 rounded-lg h-7 px-1 overflow-hidden">
                            <span className="text-[10px] font-black text-slate-700 truncate">{route ? route.distance : '0.0 km'}</span>
                            <div className="h-3 w-px bg-slate-300 shrink-0"></div>
                            <span className="text-[10px] font-bold text-slate-500 truncate">{route ? route.duration : '0 min'}</span>
                        </div>
                        <button onClick={() => calculateRoute(mode, true)} title="Calculate Route" disabled={loading} className="w-20 bg-blue-700 text-white rounded-lg h-7 text-xs font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center shrink-0">{loading ? <Activity size={14} className="animate-spin" /> : 'Go'}</button>
                    </div>
                </div>
                
                <button 
                  onClick={() => setHistoryExpanded(!historyExpanded)}
                  title={historyExpanded ? "Collapse History" : "Expand History"}
                  className="w-4 flex items-center justify-center text-slate-300 hover:text-slate-500 transition-colors"
                >
                  {historyExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>

                <div className={`flex-1 border-l border-slate-200 pl-2 flex flex-col justify-center gap-0.5 overflow-hidden transition-all duration-300 ease-in-out ${historyExpanded ? 'opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-2 pointer-events-none p-0 border-none'}`}>
                    {recentSearches.length > 0 ? recentSearches.map((item, index) => {
                            const parts = item.split('|');
                            const label = parts.length === 2 ? `${parts[0]} ~ ${parts[1]}` : item;
                            return (<button key={index} onClick={() => handleHistoryClick(item)} title={label} className="text-left w-full truncate text-[10px] text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded px-1 py-0.5 transition-colors leading-tight"><span className="font-bold mr-1">{index + 1}.</span>{label}</button>);
                        }) : (<div className="text-[10px] text-slate-400 text-center italic">No recent routes</div>)}
                </div>
            </div>
          )}
        </div>
      </div>
      {route && (
        <div className={`absolute bottom-4 right-4 z-[50] flex items-end justify-end transition-all duration-300 ease-out ${elevationExpanded ? 'w-[80%] max-w-[288px]' : 'w-12 h-12 group'}`}>
          <div className="bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl flex items-center w-full border border-slate-200 p-1 overflow-hidden">
            <button onClick={() => setElevationExpanded(!elevationExpanded)} title="Elevation Profile" className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-blue-600 order-last">{elevationExpanded ? <ChevronRight size={20} /> : <AreaChartIcon size={20} />}</button>
            {elevationExpanded && (
              <div className="flex-1 px-3 py-1 flex flex-col gap-1.5">
                <div className="flex justify-between items-center px-1">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                         <h2 className="text-slate-900 font-black text-sm tracking-tighter">{route.distance}</h2>
                         {simulation.isActive && (<div className="flex flex-col justify-center items-start leading-none ml-1"><span className="text-[10px] text-blue-600 font-bold animate-pulse">{(coveredDistance / 1000).toFixed(1)}km</span><span className="text-[10px] text-blue-600 font-bold animate-pulse">{formatTime(elapsedTime)}</span></div>)}
                    </div>
                    <p className="text-slate-400 text-[7px] font-black uppercase tracking-widest">{routeSource} ROUTE</p>
                  </div>
                  <div className="flex gap-1 items-center">
                    <button onClick={restartSimulation} title="Restart Simulation" className="w-8 h-8 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-slate-200"><RotateCcw size={14} /></button>
                    <button onClick={() => setSimulation(prev => ({ ...prev, isActive: !prev.isActive }))} title={simulation.isActive ? "Pause Simulation" : "Start Simulation"} className={`w-8 h-8 rounded-xl flex items-center justify-center ${simulation.isActive ? 'bg-amber-100 text-amber-600' : 'bg-blue-600 text-white'}`}>{simulation.isActive ? <Pause size={12} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
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