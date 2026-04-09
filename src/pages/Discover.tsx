import { fetchWithAuth } from '../utils/api';
import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Building2, MapPin, Wrench, ShoppingBag, Coffee, Beer, Users, Route, Flag, Settings, Shield, Star, Award, ChevronUp, ChevronDown, Search, Filter, Upload, X } from 'lucide-react';
import { renderToString } from 'react-dom/server';
import { useLanguage } from '../contexts/LanguageContext';
import RecommendButton from '../components/RecommendButton';
import ReviewModal from '../components/reviews/ReviewModal';
import MapRating from '../components/reviews/MapRating';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { parseGPX } from '../utils/GPXParser';
import { useNotification } from '../contexts/NotificationContext';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const categoryConfig: Record<string, { color: string, icon: any }> = {
  dealership: { color: '#3b82f6', icon: <Building2 className="w-4 h-4 text-white" /> },
  gear_shop: { color: '#10b981', icon: <ShoppingBag className="w-4 h-4 text-white" /> },
  parts_store: { color: '#eab308', icon: <Settings className="w-4 h-4 text-white" /> },
  repair: { color: '#f97316', icon: <Wrench className="w-4 h-4 text-white" /> },
  meeting_spot: { color: '#8b5cf6', icon: <Users className="w-4 h-4 text-white" /> },
  ride_spot: { color: '#ec4899', icon: <MapPin className="w-4 h-4 text-white" /> },
  biker_cafe: { color: '#a8a29e', icon: <Coffee className="w-4 h-4 text-white" /> },
  biker_bar: { color: '#ef4444', icon: <Beer className="w-4 h-4 text-white" /> },
  ride_stop: { color: '#14b8a6', icon: <Flag className="w-4 h-4 text-white" /> },
  motoclub: { color: '#52525b', icon: <Shield className="w-4 h-4 text-white" /> },
  barbershop: { color: '#f43f5e', icon: <Building2 className="w-4 h-4 text-white" /> },
  band: { color: '#8b5cf6', icon: <Users className="w-4 h-4 text-white" /> },
  other: { color: '#a8a29e', icon: <MapPin className="w-4 h-4 text-white" /> },
  ride_route: { color: '#06b6d4', icon: <Route className="w-4 h-4 text-white" /> },
  passport_stamp: { color: '#f59e0b', icon: <Award className="w-4 h-4 text-white" /> },
  ambassador: { color: '#8b5cf6', icon: <Star className="w-4 h-4 text-white" /> },
};

const createCustomIcon = (category: string) => {
  const config = categoryConfig[category] || { color: '#f97316', icon: <MapPin className="w-4 h-4 text-white" /> };
  const iconHtml = renderToString(
    <div style={{ backgroundColor: config.color }} className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
      {config.icon}
    </div>
  );

  return L.divIcon({
    html: iconHtml,
    className: 'custom-leaflet-icon bg-transparent border-none',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

function MapUpdater({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

function MapEvents({ onMoveEnd }: { onMoveEnd: () => void }) {
  useMapEvents({
    moveend: () => {
      onMoveEnd();
    },
  });
  return null;
}

export default function MapView() {
  const { t } = useLanguage();

  const mapData = [
    { name: "Moto City", category: "dealership", lat: -19.8882, lng: -43.9521, city: "Belo Horizonte", details: t('discover.mock.motoCity') },
    { name: "Valence Yamaha Barão", category: "dealership", lat: -19.9760, lng: -43.9654, city: "Belo Horizonte", details: t('discover.mock.valence') },
    { name: "Savassi Moto Point", category: "meeting_spot", lat: -19.9366, lng: -43.9380, city: "Belo Horizonte", details: t('discover.mock.savassi') },
    { name: "BH Riders Café", category: "biker_cafe", lat: -19.9440, lng: -43.9398, city: "Belo Horizonte", details: t('discover.mock.cafe') },
    { name: "Iron Riders MC", category: "motoclub", lat: -19.9000, lng: -43.9500, city: "Belo Horizonte", details: t('discover.mock.ironRiders') },
    { name: "Estrada Real Rider Stop", category: "ride_stop", lat: -20.0200, lng: -43.8500, city: "Minas Gerais", details: t('discover.mock.estradaReal') },
    { name: "Passport Checkpoint 1", category: "passport_stamp", lat: -19.9500, lng: -43.9200, city: "Belo Horizonte", details: t('discover.mock.passport') },
    { name: "Ambassador Lounge", category: "ambassador", lat: -19.9300, lng: -43.9400, city: "Belo Horizonte", details: t('discover.mock.ambassador') },
  ];

  const mockRoutes = [
    {
      id: 'route_1',
      name: 'Serra do Rola Moça',
      category: 'ride_route',
      details: t('discover.mock.rolaMoca'),
      points: [
        [-20.045, -44.005],
        [-20.050, -44.010],
        [-20.060, -44.015],
        [-20.070, -44.010],
        [-20.080, -44.020],
        [-20.090, -44.025],
      ] as [number, number][],
      color: '#f97316' // Orange for curvy
    },
    {
      id: 'route_2',
      name: 'Estrada Real (Ouro Preto)',
      category: 'ride_route',
      details: t('discover.mock.estradaRealRoute'),
      points: [
        [-20.385, -43.505],
        [-20.380, -43.510],
        [-20.370, -43.520],
        [-20.360, -43.530],
        [-20.350, -43.525],
      ] as [number, number][],
      color: '#06b6d4' // Cyan for scenic
    }
  ];

  const filterGroupsPitStop = {
    'discover.groups.ecosystems': ['dealership', 'gear_shop', 'parts_store', 'repair', 'barbershop', 'other', 'meeting_spot', 'biker_cafe', 'biker_bar', 'band'],
    'discover.groups.community': ['motoclub', 'ambassador'],
    'discover.groups.events': ['passport_stamp']
  };

  const filterGroupsRide = {
    'discover.groups.routes': ['ride_route'],
    'discover.groups.spots': ['ride_spot', 'ride_stop']
  };

  const [searchParams] = useSearchParams();
  const placeIdFromUrl = searchParams.get('placeId');
  const [ecosystems, setEcosystems] = useState<any[]>([]);
  const [ambassadors, setAmbassadors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-19.9167, -43.9345]);
  const [mapZoom, setMapZoom] = useState(12);
  const [mapMode, setMapMode] = useState<'pit_stop' | 'ride'>('pit_stop');
  const [activeFilters, setActiveFilters] = useState<string[]>(Object.values(filterGroupsPitStop).flat());
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [isLocationsWindowOpen, setIsLocationsWindowOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedPlaceForReview, setSelectedPlaceForReview] = useState<any>(null);
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  const [showSmartSuggestion, setShowSmartSuggestion] = useState(false);
  const [uploadedRoutes, setUploadedRoutes] = useState<any[]>([]);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [externalPlaces, setExternalPlaces] = useState<any[]>([]);
  const [isSearchingArea, setIsSearchingArea] = useState(false);
  const [showSearchArea, setShowSearchArea] = useState(false);
  const { showNotification } = useNotification();
  const markerRefs = useRef<{[key: string]: L.Marker | null}>({});

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newRoutes: any[] = [];
    let hasError = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        showNotification('error', t('discover.import.sizeError').replace('{name}', file.name));
        continue;
      }

      try {
        const parsedRoute = await parseGPX(file);
        newRoutes.push({
          id: parsedRoute.route_id,
          name: parsedRoute.name,
          category: 'ride_route',
          details: `${t('category.ride_route')} • ${parsedRoute.distance_km}km`,
          points: parsedRoute.polyline,
          color: '#10b981' // Emerald for imported
        });
      } catch (error) {
        console.error(`Error parsing GPX ${file.name}:`, error);
        hasError = true;
      }
    }

    if (newRoutes.length > 0) {
      setUploadedRoutes(prev => [...newRoutes, ...prev]);
      setMapCenter([newRoutes[0].points[0][0], newRoutes[0].points[0][1]]);
      setMapZoom(12);
      showNotification('success', t('discover.import.success').replace('{count}', newRoutes.length.toString()));
    }

    if (hasError) {
      showNotification('error', t('discover.import.error'));
    }

    // Reset input
    event.target.value = '';
  };

  useEffect(() => {
    if (mapMode === 'pit_stop') {
      setActiveFilters(Object.values(filterGroupsPitStop).flat());
      setActiveGroup(null);
    } else {
      setActiveFilters(Object.values(filterGroupsRide).flat());
      setActiveGroup(null);
    }
  }, [mapMode]);

  useEffect(() => {
    if (mapMode === 'ride') {
      const timer = setTimeout(() => {
        setShowSmartSuggestion(true);
      }, 5000); // Show after 5 seconds in ride mode
      return () => clearTimeout(timer);
    } else {
      setShowSmartSuggestion(false);
    }
  }, [mapMode]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ecoRes, ambRes] = await Promise.all([
          fetchWithAuth('/api/ecosystems'),
          fetchWithAuth('/api/ambassadors')
        ]);
        
        const ecoData = await ecoRes.json();
        const ambData = await ambRes.json();
        
        const validEcosystems = ecoData.filter((e: any) => e.lat && e.lng);
        setEcosystems(validEcosystems);
        
        const validAmbassadors = ambData.filter((a: any) => a.lat && a.lng);
        setAmbassadors(validAmbassadors);
        
        if (placeIdFromUrl) {
          const eco = validEcosystems.find((e: any) => e.user_id.toString() === placeIdFromUrl || e.company_name === placeIdFromUrl);
          if (eco) {
            handlePlaceSelect(eco);
          } else {
            const staticPlace = mapData.find(p => p.name === placeIdFromUrl);
            if (staticPlace) handlePlaceSelect(staticPlace);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [placeIdFromUrl]);

  const handlePlaceSelect = (place: any) => {
    setMapCenter([place.lat, place.lng]);
    setMapZoom(16);
    setIsLocationsWindowOpen(false);
    setTimeout(() => {
      const id = place.user_id?.toString() || place.id || place.name;
      const marker = markerRefs.current[id];
      if (marker) marker.openPopup();
    }, 1500);
  };

  const getDirectionsUrl = (place: any) => {
    let destination = '';
    if (place.full_address) {
      destination = place.full_address;
    } else if (place.name && place.city) {
      destination = `${place.name}, ${place.city}`;
    } else if (place.name) {
      destination = place.name;
    } else {
      destination = `${place.lat},${place.lng}`;
    }
    
    let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    if (place.place_id) {
      url += `&destination_place_id=${place.place_id}`;
    }
    return url;
  };

  const searchThisArea = async () => {
    if (!mapInstance) return;
    setIsSearchingArea(true);
    try {
      const center = mapInstance.getCenter();
      const keywords = ['motorcycle store', 'motorcycle repair', 'motorcycle club'];
      
      const promises = keywords.map(keyword => 
        fetch(`/api/places/nearby?lat=${center.lat}&lng=${center.lng}&radius=25000&keyword=${encodeURIComponent(keyword)}`)
          .then(res => res.json())
      );
      
      const results = await Promise.all(promises);
      const allPlaces = results.flat().filter(p => p && p.place_id);
      
      const uniquePlaces = Array.from(new Map(allPlaces.map(p => [p.place_id, p])).values());
      
      const mappedPlaces = uniquePlaces.map((p: any) => {
        let category = 'other';
        const types = p.types || [];
        const name = p.name.toLowerCase();
        
        if (types.includes('car_repair') || name.includes('repair') || name.includes('mecanica') || name.includes('oficina')) {
          category = 'repair';
        } else if (types.includes('motorcycle_dealer') || name.includes('motos') || name.includes('motorcycle')) {
          category = 'dealership';
        } else if (name.includes('club') || name.includes('mc')) {
          category = 'motoclub';
        }

        return {
          id: `ext_${p.place_id}`,
          name: p.name,
          category,
          lat: p.geometry.location.lat,
          lng: p.geometry.location.lng,
          city: p.vicinity,
          details: p.vicinity,
          rating: p.rating,
          isExternal: true,
          place_id: p.place_id
        };
      });
      
      setExternalPlaces(mappedPlaces);
      setShowSearchArea(false);
      showNotification('success', t('discover.searchSuccess') || `Found ${mappedPlaces.length} places`);
    } catch (error) {
      console.error("Error fetching external places:", error);
      showNotification('error', t('discover.searchError') || 'Failed to fetch nearby places');
    } finally {
      setIsSearchingArea(false);
    }
  };

  const toggleFilter = (category: string) => {
    setActiveFilters(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category) 
        : [...prev, category]
    );
  };

  const toggleGroup = (group: string) => {
    if (activeGroup === group) {
      setActiveGroup(null);
    } else {
      setActiveGroup(group);
    }
  };

  const normalizeCategory = (cat: string) => {
    if (cat === 'parts') return 'parts_store';
    if (cat === 'workshop') return 'repair';
    if (cat === 'club') return 'motoclub';
    return cat;
  };

  const filteredPlaces = [
    ...ecosystems.map(e => ({ ...e, name: e.company_name, category: normalizeCategory(e.service_category), id: e.user_id.toString(), isInternal: true })),
    ...ambassadors.map(a => ({ ...a, name: a.display_name, category: 'ambassador', id: `amb_${a.user_id}`, isInternal: true })),
    ...mapData.map(d => ({ ...d, id: d.name, category: normalizeCategory(d.category), isInternal: true })),
    ...externalPlaces,
    ...(mapMode === 'ride' ? mockRoutes.map(r => ({ ...r, lat: r.points[0][0], lng: r.points[0][1] })) : []),
    ...(mapMode === 'ride' ? uploadedRoutes.map(r => ({ ...r, lat: r.points[0][0], lng: r.points[0][1] })) : [])
  ].filter(p => activeFilters.includes(p.category)).filter((p, index, self) => {
    if (!p.isExternal) return true;
    // Filter out external places if there's an internal place with a similar name nearby
    const isDuplicate = self.some(internal => 
      internal.isInternal && 
      internal.name.toLowerCase() === p.name.toLowerCase() &&
      Math.abs(internal.lat - p.lat) < 0.01 &&
      Math.abs(internal.lng - p.lng) < 0.01
    );
    return !isDuplicate;
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-asphalt">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full relative overflow-hidden flex flex-col">
      {/* Filters Header */}
      <div className="absolute top-4 left-0 right-0 z-[1000] px-4 pointer-events-none">
        <div className="flex flex-col gap-2 pointer-events-auto">
          {/* Group Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button
              onClick={() => {
                const all = Object.values(mapMode === 'pit_stop' ? filterGroupsPitStop : filterGroupsRide).flat();
                if (activeFilters.length === all.length) {
                  setActiveFilters([]);
                } else {
                  setActiveFilters(all);
                }
                setActiveGroup(null);
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              className={`
                px-4 py-2 rounded-full font-mono text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border
                ${activeFilters.length === Object.values(mapMode === 'pit_stop' ? filterGroupsPitStop : filterGroupsRide).flat().length && !activeGroup
                  ? 'bg-white text-black border-white shadow-lg shadow-white/20' 
                  : 'bg-carbon/80 backdrop-blur-md text-steel border-white/5 hover:border-white/10'}
              `}
            >
              {t('feed.category.all')}
            </button>
            {Object.keys(mapMode === 'pit_stop' ? filterGroupsPitStop : filterGroupsRide).map((group) => (
              <button
                key={group}
                onClick={() => toggleGroup(group)}
                className={`
                  px-4 py-2 rounded-full font-mono text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border
                  ${activeGroup === group 
                    ? 'bg-white text-black border-white shadow-lg shadow-white/20' 
                    : 'bg-carbon/80 backdrop-blur-md text-steel border-white/5 hover:border-white/10'}
                `}
              >
                {t(group)}
              </button>
            ))}
          </div>
          
          {/* Sub-filters (Cascade) */}
          <AnimatePresence>
            {activeGroup && (
              <motion.div 
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                className="flex gap-2 overflow-x-auto pb-2 no-scrollbar"
              >
                {(mapMode === 'pit_stop' ? filterGroupsPitStop : filterGroupsRide)[activeGroup as keyof typeof filterGroupsPitStop | keyof typeof filterGroupsRide].map((key) => {
                  const config = categoryConfig[key];
                  if (!config) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => toggleFilter(key)}
                      className={`
                        flex items-center gap-2 px-4 py-2 rounded-full font-mono text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border
                        ${activeFilters.includes(key) 
                          ? 'bg-primary text-asphalt border-primary shadow-lg shadow-primary/20' 
                          : 'bg-carbon/80 backdrop-blur-md text-steel border-white/5 hover:border-white/10'}
                      `}
                    >
                      <div className="w-4 h-4 flex items-center justify-center" style={{ color: activeFilters.includes(key) ? 'inherit' : config.color }}>
                        {config.icon}
                      </div>
                      {t('category.' + key)}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Smart Contextual Suggestion */}
      <AnimatePresence>
        {showSmartSuggestion && mapMode === 'ride' && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="absolute top-24 right-4 z-[1000] bg-carbon/90 backdrop-blur-xl border border-primary/30 p-3 rounded-2xl shadow-2xl shadow-primary/10 flex items-center gap-3 max-w-[250px] cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => {
              setMapMode('pit_stop');
              setMapCenter([-19.9440, -43.9398]); // BH Riders Café
              setMapZoom(16);
              setShowSmartSuggestion(false);
            }}
          >
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Coffee className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-black text-primary uppercase tracking-widest mb-0.5">{t('discover.smart.suggested')}</div>
              <div className="text-xs text-white font-light leading-tight">{t('discover.smart.desc')}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Container */}
      <div className="flex-1 relative z-0">
        {/* Search this area button */}
        {mapMode === 'pit_stop' && showSearchArea && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000]">
            <button
              onClick={searchThisArea}
              disabled={isSearchingArea}
              className="bg-carbon/90 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-full shadow-xl text-xs font-mono font-bold uppercase tracking-widest text-white hover:bg-primary hover:text-asphalt transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSearchingArea ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {t('discover.searchArea') || 'Search this area'}
            </button>
          </div>
        )}
        <MapContainer 
          center={mapCenter} 
          zoom={mapZoom} 
          className="h-full w-full"
          zoomControl={false}
          ref={setMapInstance}
        >
          <MapUpdater center={mapCenter} zoom={mapZoom} />
          <MapEvents onMoveEnd={() => setShowSearchArea(true)} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {filteredPlaces.filter(p => p.category !== 'ride_route').map((place) => (
            <Marker 
              key={place.id} 
              position={[place.lat, place.lng]} 
              icon={createCustomIcon(place.category)}
              ref={(r) => { markerRefs.current[place.id] = r; }}
            >
              <Popup className="custom-popup">
                <div className="p-2 min-w-[200px]">
                  <h3 className="font-display font-black uppercase italic text-asphalt leading-none tracking-tight mb-1">{place.name}</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono font-black text-primary uppercase tracking-widest">
                      {t('category.' + place.category)}
                    </span>
                    {place.isExternal ? (
                      <span className="text-[8px] font-mono font-bold bg-white/10 text-white px-1.5 py-0.5 rounded uppercase">Google</span>
                    ) : (
                      <span className="text-[8px] font-mono font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase">Verified</span>
                    )}
                  </div>
                  {place.isExternal ? (
                    <div className="flex items-center gap-1 mb-4">
                      <Star className="w-3 h-3 text-primary fill-primary" />
                      <span className="text-xs font-bold text-asphalt">{place.rating || 'N/A'}</span>
                    </div>
                  ) : (
                    <MapRating 
                      type="ecosystem_entity" 
                      id={place.id} 
                      refreshTrigger={mapRefreshKey}
                      onClick={() => {
                        setSelectedPlaceForReview(place);
                        setReviewModalOpen(true);
                      }} 
                    />
                  )}
                  <p className="text-[11px] text-steel mb-4 line-clamp-2 leading-relaxed font-light">{place.details || place.city}</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handlePlaceSelect(place)}
                        className="flex-1 text-center bg-asphalt text-white text-[10px] font-mono font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-primary hover:text-asphalt transition-all"
                      >
                        {t('discover.focus')}
                      </button>
                      <a 
                        href={getDirectionsUrl(place)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center bg-primary text-asphalt text-[10px] font-mono font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-white transition-all"
                      >
                        {t('discover.directions')}
                      </a>
                    </div>
                    {place.username && (
                      <Link 
                        to={`/profile/${place.username}`}
                        className="w-full text-center bg-white/10 text-white text-[10px] font-mono font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-white/20 transition-all"
                      >
                        {t('discover.viewProfile') || 'View Profile'}
                      </Link>
                    )}
                    {place.isExternal && (
                      <button 
                        onClick={() => showNotification('info', t('discover.suggestComingSoon'))}
                        className="w-full text-center bg-white/10 text-white text-[10px] font-mono font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-white/20 transition-all"
                      >
                        {t('discover.suggestEcosystem')}
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {mapMode === 'ride' && [...mockRoutes, ...uploadedRoutes].map(route => (
            <Polyline 
              key={route.id}
              positions={route.points}
              pathOptions={{ color: route.color, weight: 6, opacity: 0.8 }}
              eventHandlers={{
                click: () => handlePlaceSelect({ ...route, lat: route.points[0][0], lng: route.points[0][1] })
              }}
            >
              <Popup className="custom-popup">
                <div className="p-2 min-w-[200px]">
                  <h3 className="font-display font-black uppercase italic text-asphalt leading-none tracking-tight mb-1">{route.name}</h3>
                  <span className="text-[10px] font-mono font-black text-primary uppercase tracking-widest mb-2 block">
                    {t('category.' + route.category)}
                  </span>
                  <MapRating 
                    type="route" 
                    id={route.id} 
                    refreshTrigger={mapRefreshKey}
                    onClick={() => {
                      setSelectedPlaceForReview({ ...route, category: 'route' });
                      setReviewModalOpen(true);
                    }} 
                  />
                  <p className="text-[11px] text-steel mb-4 line-clamp-2 leading-relaxed font-light">{route.details}</p>
                  <button 
                    className="w-full text-center bg-primary text-asphalt text-[10px] font-mono font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-white transition-all"
                  >
                    {t('discover.startRide')}
                  </button>
                </div>
              </Popup>
            </Polyline>
          ))}
        </MapContainer>
      </div>

      {/* Mode Toggle */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 z-[1000] transition-all duration-300"
        style={{ 
          bottom: 'calc(5rem + 80px)' 
        }}
      >
        <div className="bg-carbon/90 backdrop-blur-xl border border-white/10 p-1.5 rounded-full flex items-center shadow-2xl">
          <button 
            onClick={() => {
              setMapMode('ride');
              if (navigator.vibrate) navigator.vibrate(50);
            }}
            className={`px-6 py-3 rounded-full font-display font-black uppercase italic tracking-widest text-xs flex items-center gap-2 transition-all ${mapMode === 'ride' ? 'bg-primary text-asphalt shadow-lg shadow-primary/20' : 'text-steel hover:text-white'}`}
          >
            <Route className="w-4 h-4" /> {t('discover.ride')}
          </button>
          <button 
            onClick={() => {
              setMapMode('pit_stop');
              if (navigator.vibrate) navigator.vibrate(50);
            }}
            className={`px-6 py-3 rounded-full font-display font-black uppercase italic tracking-widest text-xs flex items-center gap-2 transition-all ${mapMode === 'pit_stop' ? 'bg-primary text-asphalt shadow-lg shadow-primary/20' : 'text-steel hover:text-white'}`}
          >
            <Coffee className="w-4 h-4" /> {t('discover.pitstop')}
          </button>
        </div>
      </div>

      {/* FABs */}
      <div 
        className="absolute right-4 z-[1000] flex flex-col gap-3 transition-all duration-300"
        style={{ 
          bottom: 'calc(5rem + 20px)' 
        }}
      >
        <button 
          onClick={() => {
            setMapCenter([-19.9167, -43.9345]);
            setMapZoom(12);
          }}
          className="w-12 h-12 rounded-full bg-carbon/90 backdrop-blur-xl border border-white/10 flex items-center justify-center text-steel hover:text-white hover:border-white/30 transition-all shadow-xl"
        >
          <MapPin className="w-5 h-5" />
        </button>
        
        {mapMode === 'ride' ? (
          <>
            <label className="w-12 h-12 rounded-full bg-carbon/90 backdrop-blur-xl border border-white/10 flex items-center justify-center text-steel hover:text-white hover:border-white/30 transition-all shadow-xl cursor-pointer" title={t('discover.uploadGPX')}>
              <Upload className="w-5 h-5" />
              <input type="file" accept=".gpx" multiple className="hidden" onChange={handleFileUpload} />
            </label>
            <button 
              onClick={() => {
                const all = Object.values(filterGroupsRide).flat();
                if (activeFilters.length === all.length) {
                  setActiveFilters([]);
                } else {
                  setActiveFilters(all);
                }
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-xl ${
                activeFilters.length > 0 
                  ? 'bg-primary text-asphalt shadow-primary/20' 
                  : 'bg-carbon/90 border-white/10 text-steel hover:text-white'
              }`}
            >
              <Route className="w-5 h-5" />
            </button>
          </>
        ) : (
          <button 
            onClick={() => {
              const all = Object.values(filterGroupsPitStop).flat();
              if (activeFilters.length === all.length) {
                setActiveFilters([]);
              } else {
                setActiveFilters(all);
              }
              if (navigator.vibrate) navigator.vibrate(50);
            }}
            className={`w-12 h-12 rounded-full backdrop-blur-xl border flex items-center justify-center transition-all shadow-xl ${
              activeFilters.length > 0 
                ? 'bg-primary border-primary text-asphalt shadow-primary/20' 
                : 'bg-carbon/90 border-white/10 text-steel hover:text-white'
            }`}
          >
            <Filter className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Locations Nearby Floating Button */}
      <AnimatePresence>
        {!isLocationsWindowOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute left-1/2 -translate-x-1/2 z-[1000] transition-all duration-300"
            style={{ bottom: 'calc(5rem + 20px)' }}
          >
            <button
              onClick={() => setIsLocationsWindowOpen(true)}
              className="bg-carbon/90 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-full flex items-center gap-2 shadow-2xl hover:border-primary/50 transition-all group"
            >
              <MapPin className="w-5 h-5 text-primary" />
              <span className="font-display font-black uppercase italic tracking-widest text-xs text-white">
                {filteredPlaces.length} {t('discover.locationsNearby')}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Window for Locations Nearby */}
      <AnimatePresence>
        {isLocationsWindowOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-[5rem] left-4 right-4 top-24 z-[1001] bg-asphalt/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-carbon/50">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                <h3 className="font-display font-black uppercase italic tracking-widest text-sm text-white">
                  {filteredPlaces.length} {t('discover.locationsNearby')}
                </h3>
              </div>
              <button 
                onClick={() => setIsLocationsWindowOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-steel hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
              <div className="grid gap-4">
                {filteredPlaces.map((place) => (
                  <div
                    key={place.id}
                    className="glass-card p-4 flex items-center gap-4 text-left hover:border-primary/30 transition-all group"
                  >
                    <div 
                      onClick={() => {
                        handlePlaceSelect(place);
                        setIsLocationsWindowOpen(false);
                      }}
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg cursor-pointer"
                      style={{ backgroundColor: categoryConfig[place.category]?.color || '#f97316' }}
                    >
                      {categoryConfig[place.category]?.icon || <MapPin className="w-6 h-6 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0" onClick={() => {
                      handlePlaceSelect(place);
                      setIsLocationsWindowOpen(false);
                    }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <h4 className="font-display font-black uppercase italic tracking-tight text-white group-hover:text-primary transition-colors truncate cursor-pointer">
                            {place.name}
                          </h4>
                          {place.isExternal ? (
                            <span className="text-[8px] font-mono font-bold bg-white/10 text-white px-1.5 py-0.5 rounded uppercase shrink-0">Google</span>
                          ) : (
                            <span className="text-[8px] font-mono font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase shrink-0">Verified</span>
                          )}
                        </div>
                        {place.username && (
                          <Link 
                            to={`/profile/${place.username}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 bg-white/5 rounded-lg text-steel hover:text-primary hover:bg-primary/10 transition-all ml-2 shrink-0"
                            title={t('discover.viewProfile') || 'View Profile'}
                          >
                            <Users className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-steel uppercase tracking-widest mt-1">
                        <span>{t('category.' + place.category)}</span>
                        <span>•</span>
                        <span className="truncate">{place.city}</span>
                        {place.isExternal ? (
                          <div className="flex items-center gap-1 ml-auto shrink-0">
                            <Star className="w-3 h-3 text-primary fill-primary" />
                            <span className="text-xs font-bold text-asphalt">{place.rating || 'N/A'}</span>
                          </div>
                        ) : (
                          <div className="ml-auto shrink-0">
                            <MapRating 
                              type={place.category === 'route' || place.category === 'ride_route' || mapMode === 'ride' ? 'route' : 'ecosystem_entity'} 
                              id={place.id} 
                              refreshTrigger={mapRefreshKey}
                              onClick={() => {
                                setSelectedPlaceForReview({ ...place, category: place.category || (mapMode === 'ride' ? 'route' : 'ecosystem_entity') });
                                setReviewModalOpen(true);
                              }} 
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    <a 
                      href={getDirectionsUrl(place)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-carbon flex items-center justify-center text-steel hover:text-primary transition-colors"
                    >
                      <Route className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedPlaceForReview && (
        <ReviewModal
          isOpen={reviewModalOpen}
          onClose={() => {
            setReviewModalOpen(false);
            setSelectedPlaceForReview(null);
          }}
          target_type={selectedPlaceForReview.category === 'route' || selectedPlaceForReview.category === 'ride_route' ? 'route' : 'ecosystem_entity'}
          target_id={selectedPlaceForReview.id}
          target_name={selectedPlaceForReview.name}
          onReviewAdded={() => setMapRefreshKey(prev => prev + 1)}
        />
      )}
    </div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="9 5l7 7-7 7" />
    </svg>
  );
}

