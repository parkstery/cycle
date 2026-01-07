
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Search, Navigation, Play, Square, ChevronDown, Map as MapIcon, MessageSquare, X, Compass, MapPin, Target, User } from 'lucide-react';
import { RouteInfo, TravelMode, SimulationState } from './types';
import { getCyclingStrategy } from './services/aiCoach';

// Declare google global
declare var google: any;

const App: React.FC = () => {
  // Map & Service References
  const mapRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const googleMap = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const simulationMarker = useRef<any>(null);
  const tempMarker = useRef<any>(null); // For clicked location
  const panorama = useRef<any>(null);
  const geocoder = useRef<any>(null);

  // App Core State
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [simulation, setSimulation] = useState<SimulationState>({ isActive: false, currentIndex: 0, speed: 500 });
  const [panelOpen, setPanelOpen] = useState(true);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [mode, setMode] = useState<TravelMode>(TravelMode.BICYCLING);
  const [aiCoachMsg, setAiCoachMsg] = useState<string | null>(null);
  const [showAiCoach, setShowAiCoach] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isSvActive, setIsSvActive] = useState(false);
  
  // Interaction State
  const [clickedLocation, setClickedLocation] = useState<{lat: number, lng: number, address: string} | null>(null);
  const [hudInfo, setHudInfo] = useState({ street: 'Locating...', cardinal: 'N' });

  const getCardinal = (heading: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(heading / 45) % 8;
    return directions[index < 0 ? index + 8 : index];
  };

  // Clear Map Elements
  const clearMapOverlays = () => {
    if (directionsRenderer.current) {
      directionsRenderer.current.setDirections({ routes: [] });
    }
    if (simulationMarker.current) {
      simulationMarker.current.setMap(null);
      simulationMarker.current = null;
    }
    setRoute(null);
    setSimulation({ isActive: false, currentIndex: 0, speed: 500 });
  };

  const clearTempMarker = () => {
    if (tempMarker.current) {
      tempMarker.current.setMap(null);
      tempMarker.current = null;
    }
    setClickedLocation(null);
  };

  useEffect(() => {
    if (mapRef.current && !googleMap.current) {
      googleMap.current = new google.maps.Map(mapRef.current, {
        center: { lat: 37.5665, lng: 126.9780 },
        zoom: 15,
        mapId: 'ef6d149e63d71cf93952c9bb',
        disableDefaultUI: true,
      });

      geocoder.current = new google.maps.Geocoder();
      directionsRenderer.current = new google.maps.DirectionsRenderer({
        map: googleMap.current,
        suppressMarkers: false,
      });

      panorama.current = new google.maps.StreetViewPanorama(svRef.current, {
        visible: false,
        addressControl: false,
        linksControl: false,
        panControl: true,
        enableCloseButton: false, 
        zoomControl: false,
        fullscreenControl: false,
      });

      panorama.current.addListener('visible_changed', () => {
        setIsSvActive(panorama.current.getVisible());
        setTimeout(() => {
          if (googleMap.current) google.maps.event.trigger(googleMap.current, 'resize');
        }, 300);
      });

      panorama.current.addListener('position_changed', () => {
        const location = panorama.current.getLocation();
        if (location && location.description) {
          setHudInfo(prev => ({ ...prev, street: location.description }));
        }
      });

      panorama.current.addListener('pov_changed', () => {
        const pov = panorama.current.getPov();
        setHudInfo(prev => ({ ...prev, cardinal: getCardinal(pov.heading) }));
      });

      googleMap.current.addListener('click', (e: any) => {
        const latLng = e.latLng;
        geocoder.current.geocode({ location: latLng }, (results: any, status: string) => {
          if (status === 'OK' && results[0]) {
            // Remove previous temp marker
            if (tempMarker.current) tempMarker.current.setMap(null);
            
            // Create new temp marker
            tempMarker.current = new google.maps.Marker({
              position: latLng,
              map: googleMap.current,
              animation: google.maps.Animation.DROP,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#3b82f6',
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: '#ffffff'
              }
            });

            setClickedLocation({
              lat: latLng.lat(),
              lng: latLng.lng(),
              address: results[0].formatted_address
            });
          }
        });
      });
    }
  }, []);

  const handlePlaceSearch = () => {
    if (!searchTerm) return;
    geocoder.current.geocode({ address: searchTerm }, (results: any, status: string) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        googleMap.current.setCenter(loc);
        googleMap.current.setZoom(17);
        
        if (tempMarker.current) tempMarker.current.setMap(null);
        tempMarker.current = new google.maps.Marker({
          position: loc,
          map: googleMap.current,
          animation: google.maps.Animation.DROP
        });

        setClickedLocation({
          lat: loc.lat(),
          lng: loc.lng(),
          address: results[0].formatted_address
        });
      }
    });
  };

  useEffect(() => {
    let timer: number;
    if (simulation.isActive && route && simulation.currentIndex < route.path.length) {
      timer = window.setTimeout(() => {
        const currentPos = route.path[simulation.currentIndex];
        
        if (!simulationMarker.current) {
          simulationMarker.current = new google.maps.Marker({
            position: currentPos,
            map: googleMap.current,
            icon: {
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 4,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              strokeWeight: 1,
              rotation: 0
            }
          });
        }
        
        const nextPos = route.path[simulation.currentIndex + 1] || currentPos;
        const heading = google.maps.geometry.spherical.computeHeading(currentPos, nextPos);
        
        simulationMarker.current.setPosition(currentPos);
        simulationMarker.current.setOptions({ rotation: heading });
        
        if (panorama.current?.getVisible()) {
          panorama.current.setPosition(currentPos);
          const currentPov = panorama.current.getPov();
          panorama.current.setPov({ heading, pitch: currentPov.pitch });
        }

        setSimulation(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
      }, simulation.speed);
    } else if (simulation.currentIndex >= (route?.path.length || 0)) {
      setSimulation(prev => ({ ...prev, isActive: false }));
    }
    return () => clearTimeout(timer);
  }, [simulation, route]);

  const calculateRoute = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setAiCoachMsg(null);
    setShowAiCoach(true);
    clearTempMarker(); // Clear selection marker when routing starts
    const ds = new google.maps.DirectionsService();
    const es = new google.maps.ElevationService();
    try {
      const result = await ds.route({
        origin,
        destination,
        travelMode: google.maps.TravelMode[mode],
      });
      if (result.routes[0]) {
        directionsRenderer.current?.setDirections(result);
        const path = result.routes[0].overview_path;
        const elevationRes = await es.getElevationAlongPath({ path, samples: 100 });
        const newRoute: RouteInfo = {
          origin,
          destination,
          distance: result.routes[0].legs[0].distance?.text || '',
          duration: result.routes[0].legs[0].duration?.text || '',
          path,
          elevation: elevationRes.results,
        };
        setRoute(newRoute);
        setSimulation({ isActive: false, currentIndex: 0, speed: 500 });
        const tip = await getCyclingStrategy(elevationRes.results);
        setAiCoachMsg(tip);
      }
    } catch (err) {
      alert("Route error.");
    } finally {
      setLoading(false);
    }
  };

  const toggleStreetView = () => {
    if (panorama.current) {
      const isVisible = panorama.current.getVisible();
      if (!isVisible && route && route.path.length > 0) {
        const currentPos = route.path[simulation.currentIndex] || route.path[0];
        panorama.current.setPosition(currentPos);
      }
      panorama.current.setVisible(!isVisible);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden font-sans relative">
      
      {/* 1. STREET VIEW LAYER */}
      <div 
        ref={svRef} 
        className={`bg-black transition-all duration-500 ease-in-out relative ${isSvActive ? 'h-[60%] opacity-100 z-20 border-b-2 border-slate-700' : 'h-0 opacity-0 pointer-events-none z-0'}`} 
      />

      {/* 2. BASE MAP LAYER */}
      <div 
        ref={mapRef} 
        className={`flex-1 transition-all duration-500 ease-in-out relative z-10`} 
      />

      {/* PEGMAN TOGGLE */}
      <button 
        onClick={toggleStreetView}
        className={`absolute right-4 top-20 z-50 p-3 rounded-full shadow-2xl transition-all active:scale-95 ${isSvActive ? 'bg-yellow-400 text-slate-900 scale-110' : 'bg-white text-slate-400 hover:text-yellow-500'}`}
      >
        <User size={24} fill={isSvActive ? "currentColor" : "none"} />
      </button>

      {/* ADDRESS POPUP (When clicked on map) */}
      {clickedLocation && (
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 z-50 w-[85%] max-w-xs animate-in zoom-in-95 duration-200">
          <div className="bg-white rounded-2xl p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] border border-slate-100 relative">
            <button onClick={clearTempMarker} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1 shadow-lg"><X size={12}/></button>
            <div className="flex items-start gap-2 mb-2">
              <MapPin size={14} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-slate-800 text-[10px] font-bold line-clamp-2 leading-tight">{clickedLocation.address}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setOrigin(clickedLocation.address); clearTempMarker(); }} className="py-2 bg-blue-50 text-blue-700 rounded-lg text-[9px] font-black uppercase tracking-tight flex items-center justify-center gap-1">Start Point</button>
              <button onClick={() => { setDestination(clickedLocation.address); clearTempMarker(); }} className="py-2 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-tight flex items-center justify-center gap-1">End Point</button>
            </div>
          </div>
        </div>
      )}

      {/* STREET VIEW HUD */}
      {isSvActive && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 w-[80%] max-w-xs pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center justify-between border border-white/10">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-[7px] text-blue-400 font-bold tracking-widest uppercase">STREET HUD</span>
              <h2 className="text-white font-bold text-[9px] truncate">{hudInfo.street}</h2>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-lg shrink-0">
              <Compass size={10} className="text-blue-400" />
              <span className="text-[9px] font-black text-white">{hudInfo.cardinal}</span>
            </div>
          </div>
        </div>
      )}

      {/* COMPACT FLOATING HEADER */}
      {!isSvActive && (
        <div className="absolute top-2 left-2 right-2 z-40 flex flex-col gap-1.5 max-w-[220px]">
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-md p-1.5 border border-white/40">
            <div className="flex items-center px-1">
              <div className="p-1 bg-blue-600 rounded-lg text-white mr-2"><MapIcon size={12} /></div>
              <h1 className="text-slate-900 font-bold text-[9px] truncate flex-1 uppercase tracking-tighter">Fitness Pro</h1>
              <button onClick={() => setPanelOpen(!panelOpen)} className="p-1.5 bg-slate-100 rounded-lg text-slate-500">
                <ChevronDown size={10} className={panelOpen ? '' : 'rotate-180'} />
              </button>
            </div>
            {panelOpen && !route && (
              <div className="px-1 pt-1.5">
                <div className="relative flex items-center">
                  <input 
                    type="text" placeholder="Search..." value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePlaceSearch()}
                    className="w-full bg-slate-100 border-none rounded-lg py-1.5 pl-2.5 pr-8 text-slate-800 text-[9px] font-bold outline-none"
                  />
                  <button onClick={handlePlaceSearch} className="absolute right-1 p-1 bg-blue-600 rounded-md text-white"><Search size={8} /></button>
                </div>
              </div>
            )}
          </div>
          {aiCoachMsg && showAiCoach && (
            <div className="bg-blue-600/90 backdrop-blur-sm p-2 rounded-xl shadow-md border border-blue-400/20 flex gap-2 items-center w-max max-w-[90%] animate-bounce-subtle">
              <MessageSquare size={10} className="text-white shrink-0" />
              <p className="text-[9px] font-medium leading-tight text-white line-clamp-1">{aiCoachMsg}</p>
              <button onClick={() => setShowAiCoach(false)} className="p-0.5 bg-white/20 rounded-md text-white"><X size={8}/></button>
            </div>
          )}
        </div>
      )}

      {/* COMPACT BOTTOM SHEET (MAX 40%) */}
      {!isSvActive && (
        <div className={`absolute bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-out ${panelOpen ? 'translate-y-0' : 'translate-y-[calc(100%-35px)]'}`}>
          <div className="bg-white rounded-t-2xl shadow-[0_-15px_30px_rgba(0,0,0,0.1)] p-3 border-t border-slate-100 max-h-[40vh] overflow-y-auto">
            <div className="w-8 h-1 bg-slate-200 rounded-full mx-auto mb-3 cursor-pointer" onClick={() => setPanelOpen(!panelOpen)} />

            {!route ? (
              <div className="space-y-2.5">
                <div className="flex gap-2 items-center">
                  <div className="flex flex-1 gap-1 p-0.5 bg-slate-100 rounded-lg">
                    {Object.values(TravelMode).map((m) => (
                      <button key={m} onClick={() => setMode(m)} className={`flex-1 py-1.5 rounded-md text-[8px] font-black uppercase transition-all ${mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>{m}</button>
                    ))}
                  </div>
                  <button 
                    onClick={calculateRoute} 
                    disabled={loading || !origin || !destination} 
                    className="bg-blue-600 text-white font-black text-[9px] uppercase px-4 py-2.5 rounded-lg shadow-lg active:scale-95 disabled:bg-slate-200 flex items-center gap-1.5 shrink-0"
                  >
                    {loading ? '...' : <><Navigation size={12} /> Plan</>}
                  </button>
                </div>
                
                {/* ORIGIN INPUT */}
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input type="text" placeholder="Start Location..." value={origin} onChange={(e) => setOrigin(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg py-2 px-3 text-slate-900 font-bold text-[9px] outline-none" />
                    {origin && (
                      <button onClick={() => { setOrigin(''); clearMapOverlays(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 p-1"><X size={10}/></button>
                    )}
                  </div>
                  <button 
                    onClick={() => clickedLocation && setOrigin(clickedLocation.address)}
                    disabled={!clickedLocation}
                    className={`p-2 rounded-lg transition-all ${clickedLocation ? 'bg-blue-100 text-blue-600' : 'bg-slate-50 text-slate-200'}`}
                  >
                    <Target size={12} />
                  </button>
                </div>

                {/* DESTINATION INPUT */}
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input type="text" placeholder="End Location..." value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full bg-slate-50 border-none rounded-lg py-2 px-3 text-slate-900 font-bold text-[9px] outline-none" />
                    {destination && (
                      <button onClick={() => { setDestination(''); clearMapOverlays(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 p-1"><X size={10}/></button>
                    )}
                  </div>
                  <button 
                    onClick={() => clickedLocation && setDestination(clickedLocation.address)}
                    disabled={!clickedLocation}
                    className={`p-2 rounded-lg transition-all ${clickedLocation ? 'bg-blue-100 text-blue-600' : 'bg-slate-50 text-slate-200'}`}
                  >
                    <Target size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-slate-900 font-black text-lg tracking-tighter leading-none">{route.distance}</h2>
                    <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest">{route.duration} • {mode}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setSimulation(prev => ({ ...prev, isActive: !prev.isActive }))} className={`p-2.5 rounded-xl shadow-md ${simulation.isActive ? 'bg-amber-100 text-amber-600' : 'bg-blue-600 text-white'}`}>
                      {simulation.isActive ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                    </button>
                    <button onClick={clearMapOverlays} className="p-2.5 bg-slate-100 text-slate-400 rounded-xl"><X size={14} /></button>
                  </div>
                </div>

                {/* ELEVATION CHART */}
                <div className="h-16 w-full bg-slate-50 rounded-lg p-1 border border-slate-100 relative shadow-inner overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={route.elevation} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                      <Area type="monotone" dataKey="elevation" stroke="#3b82f6" strokeWidth={1.5} fill="#3b82f6" fillOpacity={0.1} isAnimationActive={false} />
                      <ReferenceLine x={Math.floor((simulation.currentIndex / route.path.length) * 100)} stroke="#ef4444" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100 text-center">
                    <p className="text-[7px] text-slate-400 font-bold uppercase">Slope</p>
                    <p className="text-slate-900 font-black text-[10px]">{simulation.currentIndex > 0 ? (Math.random() * 4).toFixed(1) + '%' : '0%'}</p>
                  </div>
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100 text-center">
                    <p className="text-[7px] text-slate-400 font-bold uppercase">Assist</p>
                    <p className="text-blue-600 font-black text-[10px]">E-PRO</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GLOBAL SV CLOSE */}
      {isSvActive && (
        <button onClick={() => panorama.current.setVisible(false)} className="absolute top-4 right-4 z-[100] p-3 bg-red-500 text-white rounded-xl shadow-xl active:scale-90">
          <X size={20} />
        </button>
      )}

      <style>{`
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 4s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default App;
