import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, Navigation, Play, Pause, RotateCcw, Trash2, X, MapPin, Target, User, Volume2, AreaChart as AreaChartIcon, ChevronRight, ChevronLeft, History, Info, Route as RouteIcon, Zap, Activity, ShieldAlert, Bike, Footprints, Car, Maximize2, Minimize2, Waypoints, ArrowUpDown } from 'lucide-react';
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
  const tempMarker = useRef<any>(null);
  const panorama = useRef<any>(null);
  const geocoder = useRef<any>(null);
  const placesService = useRef<any>(null);
  const elevationService = useRef<any>(null);
  const polylineOverlay = useRef<any>(null);
  const coverageLayer = useRef<any>(null);
  const svServiceRef = useRef<any>(null); // New: StreetViewService Ref for specific queries
  const svErrorCount = useRef(0);

  // Audio References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const simulationActiveRef = useRef(false); // To track state inside event listeners

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

  // Input States
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Script Loading State
  const [isMapsApiLoaded, setIsMapsApiLoaded] = useState(false);

  // History States
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent_searches'); // Route history
    return saved ? JSON.parse(saved) : [];
  });
  const [recentPlaceSearches, setRecentPlaceSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recent_places'); // Place search history
    return saved ? JSON.parse(saved) : [];
  });

  const [clickedLocation, setClickedLocation] = useState<{lat: number, lng: number, name?: string, address: string, elevation: number | null} | null>(null);

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  // Dynamic Script Loading
  useEffect(() => {
    // Prevent double loading
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

  // Update refs when state changes
  useEffect(() => {
    simulationActiveRef.current = simulation.isActive;
  }, [simulation.isActive]);

  // Trigger resize when SV fullscreen state changes (Animation Handling)
  useEffect(() => {
    setTimeout(() => {
      if (googleMap.current) google.maps.event.trigger(googleMap.current, 'resize');
      if (panorama.current) google.maps.event.trigger(panorama.current, 'resize');
    }, 550); // Matches the CSS transition duration
  }, [isSvFullScreen]);

  // --- INDEPENDENT CHART TIMER ---
  useEffect(() => {
    let interval: number;
    if (simulation.isActive && route) {
      interval = window.setInterval(() => {
        // Increment Time
        setElapsedTime(prev => prev + 1);
        
        // Increment Distance based on Speed (km/h -> m/s)
        const metersPerSecond = (speedKmH * 1000) / 3600;
        setCoveredDistance(prev => prev + metersPerSecond);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [simulation.isActive, route, speedKmH]);
  // ------------------------------

  // --- AUDIO LOGIC ---
  const fadeAudio = (targetVolume: number, duration: number = 2000, onComplete?: () => void) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    
    if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);

    const stepTime = 50;
    const steps = duration / stepTime;
    const volumeStep = (targetVolume - audio.volume) / steps;

    fadeIntervalRef.current = window.setInterval(() => {
      let newVolume = audio.volume + volumeStep;
      
      // Clamp
      if (volumeStep > 0 && newVolume >= targetVolume) newVolume = targetVolume;
      if (volumeStep < 0 && newVolume <= targetVolume) newVolume = targetVolume;

      // Ensure valid range
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
    
    // Pick a random track different from the current src if possible, but simple random is fine for now
    const track = PLAYLIST[Math.floor(Math.random() * PLAYLIST.length)];
    
    audioRef.current.src = track;
    audioRef.current.volume = 0; // Start at 0 for fade in
    audioRef.current.play().catch(e => console.log("Audio autoplay blocked or failed", e));
    fadeAudio(0.3); // Fade in to 30% volume
  };

  useEffect(() => {
    // Initialize Audio Object
    if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener('ended', () => {
            // Check ref because closure state might be stale
            if (simulationActiveRef.current) {
                playRandomMusic();
            }
        });
    }

    return () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, []);

  // Watch simulation active state to trigger music
  useEffect(() => {
    if (simulation.isActive) {
        // If music is paused, start playing random track
        if (audioRef.current && audioRef.current.paused) {
            playRandomMusic();
        }
    } else {
        // If simulation stops, fade out and pause
        if (audioRef.current && !audioRef.current.paused) {
            fadeAudio(0, 2000, () => {
                audioRef.current?.pause();
            });
        }
    }
  }, [simulation.isActive]);
  // -------------------

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Always use English
    utterance.lang = 'en-US'; 
    
    const voices = window.speechSynthesis.getVoices();
    // Prioritize English female/natural voices
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith('en') && 
      (voice.name.includes('Female') || voice.name.includes('Google US English') || voice.name.includes('Samantha'))
    );

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

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
    setRoute(null);
    setSimulation({ isActive: false, currentIndex: 0, speed: 100 });
    setCoachData(null);
    setRouteSource(null);
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

  const handleSwapEndpoints = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  useEffect(() => {
    if (!isMapsApiLoaded) return;

    if (mapRef.current && !googleMap.current) {
      googleMap.current = new google.maps.Map(mapRef.current, {
        center: { lat: 37.3422, lng: 127.9202 },
        zoom: 15,
        mapId: 'ef6d149e63d71cf93952c9bb',
        disableDefaultUI: true,
      });

      geocoder.current = new google.maps.Geocoder();
      elevationService.current = new google.maps.ElevationService();
      coverageLayer.current = new google.maps.StreetViewCoverageLayer();
      placesService.current = new google.maps.places.PlacesService(googleMap.current);
      svServiceRef.current = new google.maps.StreetViewService(); // Initialize SV Service

      directionsRenderer.current = new google.maps.DirectionsRenderer({
        map: googleMap.current,
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#ff3020', strokeWeight: 5, strokeOpacity: 0.8 }
      });

      panorama.current = new google.maps.StreetViewPanorama(svRef.current, {
        visible: false,
        addressControl: false,
        linksControl: false,
        enableCloseButton: false,
        zoomControl: false,
        fullscreenControl: false,
        // Remove clickToGo to prevent user accidental navigation into buildings
        clickToGo: false 
      });

      panorama.current.addListener('status_changed', () => {
        if (panorama.current) {
          const status = panorama.current.getStatus();
          setSvStatus(status);
          
          if (status === 'OK') {
            svErrorCount.current = 0;
            setShowSvWarning(false);
          } else {
            svErrorCount.current += 1;
            if (svErrorCount.current >= 5) {
              setShowSvWarning(true);
            }
          }
        }
      });

      panorama.current.addListener('visible_changed', () => {
        setIsSvActive(panorama.current.getVisible());
        setTimeout(() => { if (googleMap.current) google.maps.event.trigger(googleMap.current, 'resize'); }, 300);
      });

      googleMap.current.addListener('click', (e: any) => {
        // Check if the click was on a POI (Point of Interest)
        if (e.placeId) {
          e.stop(); // Prevent standard info window
          placesService.current.getDetails({ placeId: e.placeId }, (place: any, status: string) => {
            if (status === 'OK' && place.geometry && place.geometry.location) {
               const loc = place.geometry.location;
               if (tempMarker.current) tempMarker.current.setMap(null);
               tempMarker.current = new google.maps.Marker({
                  position: loc,
                  map: googleMap.current,
                  animation: google.maps.Animation.DROP,
                  icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#3b82f6', fillOpacity: 1, strokeWeight: 2, strokeColor: '#ffffff' }
               });

               elevationService.current.getElevationForLocations({ locations: [loc] }, (elevResults: any, elevStatus: string) => {
                  const elevation = (elevStatus === 'OK' && elevResults[0]) ? elevResults[0].elevation : null;
                  setClickedLocation({ 
                    lat: loc.lat(), 
                    lng: loc.lng(), 
                    name: place.name, 
                    address: place.formatted_address, 
                    elevation: elevation 
                  });
               });
               setRouteInputExpanded(true);
            }
          });
          return;
        }

        // Standard Click (Reverse Geocode)
        const latLng = e.latLng;
        geocoder.current.geocode({ location: latLng }, (results: any, status: string) => {
          if (status === 'OK' && results[0]) {
            if (tempMarker.current) tempMarker.current.setMap(null);
            tempMarker.current = new google.maps.Marker({
              position: latLng,
              map: googleMap.current,
              animation: google.maps.Animation.DROP,
              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#3b82f6', fillOpacity: 1, strokeWeight: 2, strokeColor: '#ffffff' }
            });

            elevationService.current.getElevationForLocations({ locations: [latLng] }, (elevResults: any, elevStatus: string) => {
              const elevation = (elevStatus === 'OK' && elevResults[0]) ? elevResults[0].elevation : null;
              setClickedLocation({ 
                lat: latLng.lat(), 
                lng: latLng.lng(), 
                name: results[0].formatted_address, // Use formatted address as name if no specific place name
                address: results[0].formatted_address, 
                elevation: elevation 
              });
            });
            setRouteInputExpanded(true);
          }
        });
      });
    }
  }, [isMapsApiLoaded]);

  useEffect(() => {
    if (googleMap.current && coverageLayer.current) {
      coverageLayer.current.setMap(showCoverage ? googleMap.current : null);
    }
  }, [showCoverage]);

  const handlePlaceSearch = (termToSearch?: string) => {
    const finalTerm = termToSearch || searchTerm;
    if (!finalTerm) return;

    const performSearch = (term: string) => {
         // Save to place history
         setRecentPlaceSearches(prev => {
            const filtered = prev.filter(item => item !== term);
            const updated = [term, ...filtered].slice(0, 3);
            localStorage.setItem('recent_places', JSON.stringify(updated));
            return updated;
         });

         // Use PlacesService to find a place by query (prioritizing names)
         if (placesService.current) {
            const request = {
                query: term,
                fields: ['name', 'geometry', 'formatted_address']
            };
            
            placesService.current.findPlaceFromQuery(request, (results: any, status: string) => {
                if (status === 'OK' && results && results.length > 0) {
                    const place = results[0];
                    const loc = place.geometry.location;
                    
                    googleMap.current.setCenter(loc);
                    googleMap.current.setZoom(17);
                    
                    if (tempMarker.current) tempMarker.current.setMap(null);
                    tempMarker.current = new google.maps.Marker({ position: loc, map: googleMap.current, animation: google.maps.Animation.DROP });

                    elevationService.current.getElevationForLocations({ locations: [loc] }, (elevResults: any, elevStatus: string) => {
                        const elevation = (elevStatus === 'OK' && elevResults[0]) ? elevResults[0].elevation : null;
                        setClickedLocation({ 
                            lat: loc.lat(), 
                            lng: loc.lng(), 
                            name: place.name, // Use the specific place name
                            address: place.formatted_address, 
                            elevation: elevation 
                        });
                    });
                    setSearchExpanded(false); 
                } else {
                    fallbackGeocode(term);
                }
            });
        } else {
            fallbackGeocode(term);
        }
    }

    performSearch(finalTerm);
  };

  const fallbackGeocode = (term: string) => {
    geocoder.current.geocode({ address: term }, (results: any, status: string) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        googleMap.current.setCenter(loc);
        googleMap.current.setZoom(17);
        if (tempMarker.current) tempMarker.current.setMap(null);
        tempMarker.current = new google.maps.Marker({ position: loc, map: googleMap.current, animation: google.maps.Animation.DROP });
        elevationService.current.getElevationForLocations({ locations: [loc] }, (elevResults: any, elevStatus: string) => {
          const elevation = (elevStatus === 'OK' && elevResults[0]) ? elevResults[0].elevation : null;
          setClickedLocation({ 
            lat: loc.lat(), 
            lng: loc.lng(), 
            name: results[0].formatted_address, 
            address: results[0].formatted_address, 
            elevation: elevation 
          });
        });
        setSearchExpanded(false);
      }
    });
  };

  const calculateRoute = useCallback(async (targetMode?: TravelMode, autoStart: boolean = false, customOrigin?: string, customDestination?: string) => {
    const activeMode = targetMode || mode;
    const finalOrigin = customOrigin || origin;
    const finalDestination = customDestination || destination;

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
        const result = await ds.route({ origin: finalOrigin, destination: finalDestination, travelMode: google.maps.TravelMode[activeMode] });
        if (result.routes[0]) {
          directionsRenderer.current?.setDirections(result);
          path = result.routes[0].overview_path;
          distText = result.routes[0].legs[0].distance?.text || '';
          durText = result.routes[0].legs[0].duration?.text || '';
          setRouteSource('GOOGLE');
        }
      } catch (e) {
        const originLatLng = await new Promise<any>((res) => geocoder.current.geocode({address: finalOrigin}, (r:any)=>res(r[0].geometry.location)));
        const destLatLng = await new Promise<any>((res) => geocoder.current.geocode({address: finalDestination}, (r:any)=>res(r[0].geometry.location)));
        const profile = activeMode === TravelMode.BICYCLING ? 'cycling' : 'foot';
        const url = `https://router.project-osrm.org/route/v1/${profile}/${originLatLng.lng()},${originLatLng.lat()};${destLatLng.lng()},${destLatLng.lat()}?overview=full&geometries=polyline`;
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
        // 1. Get Elevation using original path (avoiding 512 point limit issue of ElevationService)
        // Note: For OSRM paths > 512 points, this might still trim or fail, 
        // but typically Directions API path is safe.
        // We accept the original path for elevation sampling.
        const elevationRes = await es.getElevationAlongPath({ path, samples: 100 });

        // 2. Densify path for smooth simulation (2-meter segments)
        // This ensures the "continuous display" asked by user
        const densifiedPath = [];
        const segmentLength = 2; // meters

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
        
        // Update Markers & Polyline with Densified Path
        if (startMarker.current) startMarker.current.setMap(null);
        if (endMarker.current) endMarker.current.setMap(null);
        startMarker.current = createCustomMarker(densifiedPath[0], 'A', '#3b82f6');
        endMarker.current = createCustomMarker(densifiedPath[densifiedPath.length - 1], 'B', '#ef4444');
        
        // Use densified path for the red line (smoother visualization)
        polylineOverlay.current = new google.maps.Polyline({ 
            path: densifiedPath, 
            strokeColor: '#ff3020', 
            strokeWeight: 5, 
            map: googleMap.current 
        });

        // Use densified path for route state (simulation logic uses this)
        setRoute({ 
            origin: finalOrigin, 
            destination: finalDestination, 
            distance: distText, 
            duration: durText, 
            path: densifiedPath, 
            elevation: elevationRes.results 
        });
        
        // Save to history (Origin|Destination format)
        const historyItem = `${finalOrigin}|${finalDestination}`;
        setRecentSearches(prev => {
           // Remove duplicates and keep last 5
           const filtered = prev.filter(item => item !== historyItem);
           const updated = [historyItem, ...filtered].slice(0, 5);
           localStorage.setItem('recent_searches', JSON.stringify(updated));
           return updated;
        });

        if (autoStart) {
          setSimulation({ isActive: true, currentIndex: 0, speed: 100 });
          // Initial Coaching
          setIsCoachThinking(true);
          const firstCoach = await getAdvancedCoaching(elevationRes.results[0].elevation, elevationRes.results.slice(0, 10), speedKmH);
          setCoachData(firstCoach);
          
          // Start Announcement
          speak(`Starting the ride. Total distance ${distText}, speed ${speedKmH} km/h. Shall we start a fun ride today?`);
          
          setIsCoachThinking(false);
          lastCoachedIndex.current = 0;
        }
      }
    } catch (err) { alert("경로를 찾을 수 없습니다."); }
    finally { setLoading(false); }
  }, [origin, destination, mode, speedKmH]);

  const handleSetStart = () => {
    if (clickedLocation) {
      // Use name if available (POI name), otherwise fall back to address
      const newOrigin = clickedLocation.name || clickedLocation.address;
      setOrigin(newOrigin);
      setClickedLocation(null);
      if (destination) {
        calculateRoute(mode, false, newOrigin, destination);
      }
    }
  };

  const handleSetEnd = () => {
    if (clickedLocation) {
       // Use name if available (POI name), otherwise fall back to address
      const newDest = clickedLocation.name || clickedLocation.address;
      setDestination(newDest);
      setClickedLocation(null);
      if (origin) {
        calculateRoute(mode, false, origin, newDest);
      }
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

  const handlePlaceHistoryClick = (term: string) => {
      setSearchTerm(term);
      handlePlaceSearch(term);
  };

  const handleModeChange = (newMode: TravelMode) => {
    setMode(newMode);
    if (origin && destination && route) {
       // Optional: Auto recalculate or just set mode
       // calculateRoute(newMode); 
    }
  };

  useEffect(() => {
    let timer: number;
    // Main simulation loop
    if (simulation.isActive && route) {
      // Hide Temporary Marker if active
      if (tempMarker.current) {
        tempMarker.current.setMap(null);
      }

      // 1. Update Visuals Immediately (Marker, Map, SV, Coach)
      const currentIdx = simulation.currentIndex;
      
      // Check for finish condition
      if (currentIdx >= route.path.length - 1) {
          setSimulation(prev => ({ ...prev, isActive: false }));
          const youthPercent = 5; 
          speak(`Ride finished. Distance covered ${route.distance}, duration ${route.duration}. You have filled ${youthPercent}% of your daily youth.`);
          return;
      }

      const currentPos = route.path[currentIdx];

      if (!simulationMarker.current) {
          simulationMarker.current = new google.maps.Marker({ 
              position: currentPos, 
              map: googleMap.current, 
              // Bicycle Icon (Standard Material Design Path)
              icon: { 
                  path: "M15.5,5.5c1.1,0,2-0.9,2-2s-0.9-2-2-2s-2,0.9-2,2S14.4,5.5,15.5,5.5z M5,12c-2.8,0-5,2.2-5,5s2.2,5,5,5 s5-2.2,5-5S7.8,12,5,12z M5,20c-1.7,0-3-1.3-3-3s1.3-3,3-3s3,1.3,3,3S6.7,20,5,20z M19,12c-2.8,0-5,2.2-5,5s2.2,5,5,5s5-2.2,5-5 S21.8,12,19,12z M19,20c-1.7,0-3-1.3-3-3s1.3-3,3-3s3,1.3,3,3S20.7,20,19,20z M13,7h-2.8l-3.7,6.6C6.3,13.8,6.1,14,5.9,14.1 c-0.1,0-0.3,0-0.4,0l-1-0.2c-0.6-0.2-1.1,0.2-1.3,0.7c-0.2,0.6,0.2,1.1,0.7,1.3l1,0.2c0.7,0.1,1.4-0.1,1.9-0.6l3.3-6l2.1,0l2.3,4.4 c0.3,0.5,0.8,0.8,1.4,0.8h3.3c0.6,0,1-0.4,1-1s-0.4-1-1-1h-2.9L13,7z", 
                  scale: 1.5, 
                  fillColor: '#3b82f6', 
                  fillOpacity: 1, 
                  strokeWeight: 1, 
                  strokeColor: '#ffffff',
                  anchor: new google.maps.Point(12, 12)
              } 
          });
      }
      
      // Look-ahead Heading Logic (Fix for "Reverse/Jittery" Camera)
      // Look roughly 20 meters ahead (approx 10 points given 2m density)
      const lookAheadIdx = Math.min(currentIdx + 10, route.path.length - 1);
      const targetPosForHeading = route.path[lookAheadIdx];
      const heading = google.maps.geometry.spherical.computeHeading(currentPos, targetPosForHeading);
      
      simulationMarker.current.setPosition(currentPos);
      simulationMarker.current.setOptions({ rotation: heading });
      
      // Sync SV with STRICT OUTDOOR FILTER & THROTTLING
      if (panorama.current?.getVisible()) {
        // 1. Force Heading (Look Ahead)
        panorama.current.setPov({ heading, pitch: 0 }); // Flatten pitch to 0
        
        // 2. Smart Panorama Fetching
        // We do NOT use setPosition() directly because it snaps to indoor photos.
        // We use StreetViewService with source: OUTDOOR.
        // To save API quotas and reduce flickering, only fetch if we moved > 15m from the current pano.
        const currentPanoLoc = panorama.current.getLocation()?.latLng;
        const distFromLastPano = currentPanoLoc 
          ? google.maps.geometry.spherical.computeDistanceBetween(currentPos, currentPanoLoc) 
          : Infinity;

        if (distFromLastPano > 15 || !currentPanoLoc) {
            if (svServiceRef.current) {
                const request = {
                    location: currentPos,
                    radius: 20, // Reduced radius (default 50) to avoid jumping to wrong streets
                    source: google.maps.StreetViewSource.OUTDOOR, // STRICTLY OUTDOOR
                    preference: google.maps.StreetViewPreference.NEAREST
                };
                
                svServiceRef.current.getPanorama(request, (data: any, status: string) => {
                    if (status === 'OK') {
                        // Use setPano to jump to the specific Outdoor ID
                        panorama.current.setPano(data.location.pano);
                    } else {
                         // No outdoor image found close by.
                         // Optional: Fallback to setPosition(currentPos) if you want to allow indoor as fallback,
                         // but per instruction, we strictly avoid it. We simply don't update if no outdoor image exists.
                    }
                });
            }
        }
        
        // Auto-center MiniMap if in FullScreen mode
        if (isSvFullScreen && googleMap.current) {
            googleMap.current.panTo(currentPos);
        }
      }

      // Dynamic Coaching Trigger: Every 21 indices (reduced frequency to 80% of current)
      if (currentIdx > 0 && currentIdx % 21 === 0 && currentIdx !== lastCoachedIndex.current) {
          (async () => {
              const currentElev = route.elevation[Math.floor((currentIdx/route.path.length)*route.elevation.length)]?.elevation || 0;
              const upcoming = route.elevation.slice(
                Math.floor((currentIdx/route.path.length)*route.elevation.length), 
                Math.floor(((currentIdx+20)/route.path.length)*route.elevation.length)
              );
              
              setIsCoachThinking(true);
              const newCoaching = await getAdvancedCoaching(currentElev, upcoming, speedKmH, coachData?.gear);
              setCoachData(newCoaching);
              speak(newCoaching.tip);
              setIsCoachThinking(false);
          })();
          lastCoachedIndex.current = currentIdx;
      }

      // 2. Schedule Next Step
      // Calculate delay based on REAL distance and user speed
      let delay = 100; // Default minimum delay
      const nextPos = route.path[currentIdx + 1];
      
      if (nextPos) {
          const distMeters = google.maps.geometry.spherical.computeDistanceBetween(currentPos, nextPos);
          // Convert km/h to m/s -> m/ms
          const speedMetersPerSec = (speedKmH * 1000) / 3600;
          if (speedMetersPerSec > 0) {
              delay = (distMeters / speedMetersPerSec) * 1000;
          }
      }
      
      // Safety clamp: Prevent browser freeze if delay is too small
      if (delay < 50) delay = 50;

      timer = window.setTimeout(() => {
        setSimulation(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
      }, delay);
    }
    return () => clearTimeout(timer);
  }, [simulation.isActive, simulation.currentIndex, route, speedKmH, isSvFullScreen]); 

  const getIntensityColor = (intensity?: string) => {
    switch(intensity) {
      case 'MAX': return 'bg-red-600';
      case 'HIGH': return 'bg-orange-500';
      case 'MODERATE': return 'bg-yellow-500';
      default: return 'bg-emerald-500';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 overflow-hidden font-sans">
      {/* STREET VIEW SCREEN */}
      <div 
        ref={svRef} 
        className={`bg-black transition-all duration-500 ease-in-out ${
        isSvActive 
          ? (isSvFullScreen 
              ? 'absolute inset-0 z-40 opacity-100' 
              : 'absolute top-0 left-0 right-0 h-[50%] z-20 opacity-100 border-b-2 border-slate-700') 
          : 'absolute top-0 left-0 w-full h-0 opacity-0 pointer-events-none z-0'
      }`} />
      
      {/* NO STREET VIEW WARNING OVERLAY */}
      {isSvActive && showSvWarning && (
        <div className={`absolute left-4 z-[45] flex items-center justify-start pointer-events-none ${isSvFullScreen ? 'bottom-32' : 'top-[42%]'}`}>
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2 shadow-xl animate-in fade-in zoom-in duration-300">
             <ShieldAlert size={18} className="text-amber-500 animate-pulse" />
             <span className="text-white font-bold text-xs">거리뷰 이미지가 없는 구간입니다.</span>
          </div>
        </div>
      )}

      {/* 2D MAP SCREEN (Mini-Map Transformation) */}
      <div ref={mapRef} className={`transition-all duration-500 ease-in-out ${
          isSvFullScreen 
             ? "absolute top-[66px] left-4 w-40 h-40 z-50 rounded-3xl border-4 border-white shadow-2xl overflow-hidden" 
             : (isSvActive 
                 ? "absolute bottom-0 left-0 right-0 h-[50%] z-10"
                 : "absolute inset-0 z-10")
      }`} />

      {/* ADVANCED COACH HUD (Topmost, Overlaps with Search) */}
      {simulation.isActive && coachData && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[70] w-full max-w-[60%] pointer-events-none flex justify-center">
          <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2 shadow-2xl flex items-center justify-center animate-in fade-in slide-in-from-top-4 duration-500">
             <p className="text-white font-medium text-sm leading-snug text-center line-clamp-2">
                {coachData.tip}
             </p>
          </div>
        </div>
      )}

      {/* FLOATING TOOLS */}
      <div className="absolute right-4 top-4 z-50 flex flex-col gap-2">
        <div className="group relative flex items-center justify-end">
            <span className="absolute right-full mr-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg z-[90]">
                Toggle Street View
            </span>
            <button onClick={() => panorama.current?.setVisible(!isSvActive)} className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${isSvActive ? 'bg-yellow-400 text-slate-900' : 'bg-white text-slate-400'}`}>
                <User size={24} fill={isSvActive ? "currentColor" : "none"} />
            </button>
        </div>
        
        {isSvActive && (
            <div className="group relative flex items-center justify-end">
                <span className="absolute right-full mr-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg z-[90]">
                    {isSvFullScreen ? "Minimize Street View" : "Maximize Street View"}
                </span>
                <button onClick={() => setIsSvFullScreen(!isSvFullScreen)} className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center bg-white text-slate-900`}>
                    {isSvFullScreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
                </button>
            </div>
        )}

        <div className="group relative flex items-center justify-end">
            <span className="absolute right-full mr-2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg z-[90]">
                Toggle Route Coverage
            </span>
            <button onClick={() => setShowCoverage(!showCoverage)} className={`w-12 h-12 rounded-full shadow-2xl transition-all active:scale-95 flex items-center justify-center ${showCoverage ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}>
                <RouteIcon size={24} />
            </button>
        </div>
      </div>

      {/* SEARCH PANEL */}
      <div className={`absolute top-4 left-4 z-[80] flex flex-col items-start transition-all duration-300 ease-out bg-white/95 backdrop-blur-md shadow-2xl overflow-hidden ${searchExpanded ? 'w-[240px] rounded-2xl border border-slate-200' : 'w-12 h-12 rounded-full border-2 border-blue-600 group'}`}>
        {!searchExpanded && (
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg z-[90]">
                Search Places
            </span>
        )}
        <div className="flex items-center w-full h-12 pr-2 shrink-0">
          <button onClick={() => setSearchExpanded(!searchExpanded)} className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-slate-500 hover:text-blue-600">
            {searchExpanded ? <ChevronLeft size={20} /> : <Search size={20} />}
          </button>
          <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePlaceSearch()} className="flex-1 bg-transparent border-none outline-none text-slate-900 font-bold text-[12px] pr-2" />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 mr-[2px]">
                <X size={14} />
            </button>
          )}
        </div>
        {/* Recent Place History */}
        {searchExpanded && recentPlaceSearches.length > 0 && (
          <div className="w-full flex flex-col px-2 pb-2 gap-1 border-t border-slate-100">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-1 mt-1">Recent</span>
            {recentPlaceSearches.map((term, idx) => (
              <button key={idx} onClick={() => handlePlaceHistoryClick(term)} className="text-left w-full truncate text-[11px] text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded px-1 py-1 transition-colors flex items-center gap-2">
                 <History size={10} className="text-slate-400"/>
                 {term}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM CONTROL SHEETS (Redesigned Split View) */}
      <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-end transition-all duration-300 ease-out overflow-hidden ${routeInputExpanded ? 'w-[95%] max-w-[500px]' : 'w-12 h-12 left-4 translate-x-0 border-2 border-blue-600 rounded-full group'}`}>
        {!routeInputExpanded && (
             <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg z-[90]">
                Find Route
             </span>
        )}
        <div className={`bg-white/95 backdrop-blur-md rounded-[1.5rem] shadow-2xl flex flex-row w-full border border-slate-200 p-2 relative ${routeInputExpanded ? 'min-h-[140px]' : 'h-full'}`}>
          <button onClick={() => setRouteInputExpanded(!routeInputExpanded)} className={`absolute left-0 top-0 w-8 h-full flex items-center justify-center text-slate-400 hover:text-slate-600 z-10 ${!routeInputExpanded ? 'w-full' : ''}`}>
            {routeInputExpanded ? <ChevronLeft size={20} /> : <Waypoints size={20} className="text-blue-600" />}
          </button>
          
          {routeInputExpanded && (
            <div className="flex flex-row w-full pl-6 gap-3">
                {/* LEFT COLUMN: Inputs & Controls - COMPACT FIXED WIDTH */}
                <div className="w-40 flex-none flex flex-col justify-center gap-1.5">
                    {/* Inputs Wrapper for Swap Button positioning */}
                    <div className="relative flex flex-col gap-1.5">
                        {/* Swap Button */}
                        <button
                            onClick={handleSwapEndpoints}
                            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-md hover:bg-slate-50 active:scale-95 transition-transform"
                            title="Swap Origin and Destination"
                        >
                            <ArrowUpDown size={12} className="text-slate-600" />
                        </button>

                        {/* Start Input */}
                        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 h-7 bg-white shadow-sm pr-6">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                            <input 
                                className="flex-1 text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate"
                                placeholder="Start Point"
                                value={origin}
                                onChange={(e) => setOrigin(e.target.value)}
                            />
                        </div>
                        {/* Destination Input */}
                        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2 h-7 bg-white shadow-sm pr-6">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
                            <input 
                                className="flex-1 text-xs outline-none text-slate-700 font-medium placeholder:text-slate-400 bg-transparent truncate"
                                placeholder="Destination"
                                value={destination}
                                onChange={(e) => setDestination(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    {/* Speed Controls */}
                    <div className="flex items-center gap-1 w-full px-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Speed</span>
                         <input
                            type="number"
                            min="10"
                            max="100"
                            value={speedKmH}
                            onChange={(e) => setSpeedKmH(Number(e.target.value))}
                            className="w-8 h-5 text-[10px] font-bold text-center bg-slate-50 border border-slate-300 rounded text-slate-700 focus:outline-none focus:border-blue-500 p-0 shrink-0"
                         />
                         <input
                            type="range"
                            min="10"
                            max="100"
                            step="1"
                            value={speedKmH}
                            onChange={(e) => setSpeedKmH(Number(e.target.value))}
                            className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>

                     {/* Go Button & Distance Display (Bottom Row) */}
                    <div className="flex items-center gap-1 w-full">
                        <button
                            onClick={() => calculateRoute(mode, true)}
                            disabled={loading}
                            className="flex-1 bg-blue-700 text-white rounded-lg h-7 text-sm font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-1"
                        >
                            {loading ? <Activity size={16} className="animate-spin" /> : 'Go'}
                        </button>
                        <div className="flex-1 flex items-center justify-center bg-slate-100 border border-slate-200 rounded-lg h-7">
                            <span className="text-xs font-black text-slate-700 truncate">
                                {route ? route.distance : '0.0 km'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Recent History */}
                <div className="flex-1 border-l border-slate-200 pl-2 flex flex-col justify-center gap-0.5 overflow-hidden">
                    {recentSearches.length > 0 ? (
                        recentSearches.map((item, index) => {
                            const parts = item.split('|');
                            const label = parts.length === 2 ? `${parts[0]} ~ ${parts[1]}` : item;
                            return (
                                <button 
                                    key={index}
                                    onClick={() => handleHistoryClick(item)}
                                    className="text-left w-full truncate text-[10px] text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded px-1 py-0.5 transition-colors leading-tight"
                                >
                                    <span className="font-bold mr-1">{index + 1}.</span>
                                    {label}
                                </button>
                            );
                        })
                    ) : (
                        <div className="text-[10px] text-slate-400 text-center italic">No recent routes</div>
                    )}
                </div>
            </div>
          )}
        </div>
      </div>

      {/* ELEVATION PANEL */}
      {route && (
        <div className={`absolute bottom-4 right-4 z-[50] flex items-end justify-end transition-all duration-300 ease-out ${elevationExpanded ? 'w-[80%] max-w-md' : 'w-12 h-12 group'}`}>
          {!elevationExpanded && (
             <span className="absolute right-full mr-2 bottom-3 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg z-[90]">
                Show Elevation Profile
             </span>
          )}
          <div className="bg-white/95 backdrop-blur-md rounded-[2rem] shadow-2xl flex items-center w-full border border-slate-200 p-1 overflow-hidden">
            <button onClick={() => setElevationExpanded(!elevationExpanded)} className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-blue-600 order-last">
              {elevationExpanded ? <ChevronRight size={20} /> : <AreaChartIcon size={20} />}
            </button>
            {elevationExpanded && (
              <div className="flex-1 px-3 py-1 flex flex-col gap-1.5">
                <div className="flex justify-between items-center px-1">
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                         <h2 className="text-slate-900 font-black text-sm tracking-tighter">{route.distance}</h2>
                         {simulation.isActive && (
                             <span className="text-[10px] text-blue-600 font-bold animate-pulse">
                                run: {(coveredDistance / 1000).toFixed(1)}km / {formatTime(elapsedTime)}
                             </span>
                         )}
                    </div>
                    <p className="text-slate-400 text-[7px] font-black uppercase tracking-widest">{routeSource} ROUTE</p>
                  </div>
                  <div className="flex gap-1 items-center">
                    <button onClick={restartSimulation} className="w-8 h-8 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center hover:bg-slate-200">
                      <RotateCcw size={14} />
                    </button>
                    <button onClick={() => setSimulation(prev => ({ ...prev, isActive: !prev.isActive }))} className={`w-8 h-8 rounded-xl flex items-center justify-center ${simulation.isActive ? 'bg-amber-100 text-amber-600' : 'bg-blue-600 text-white'}`}>
                      {simulation.isActive ? <Pause size={12} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>
                    <button onClick={clearMapOverlays} className="w-8 h-8 bg-red-50 text-red-500 rounded-xl flex items-center justify-center"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="h-10 w-full bg-slate-900 rounded-xl p-1 relative overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={route.elevation} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                      <Area type="monotone" dataKey="elevation" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} isAnimationActive={false} />
                      <ReferenceLine x={Math.floor((simulation.currentIndex / route.path.length) * (route.elevation.length - 1))} stroke="#ffffff" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LOCATION POPUP */}
      {clickedLocation && (
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 z-50 w-[85%] max-w-[280px]">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-slate-200 relative">
            <button onClick={() => setClickedLocation(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1.5"><X size={10}/></button>
            <p className="text-slate-800 text-[12px] font-bold truncate">{clickedLocation.name}</p>
            {clickedLocation.name !== clickedLocation.address && (
              <p className="text-slate-500 text-[10px] mb-2 truncate">{clickedLocation.address}</p>
            )}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={handleSetStart} className="py-2 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-black">START (A)</button>
              <button onClick={handleSetEnd} className="py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black">END (B)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;