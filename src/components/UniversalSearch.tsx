import { fetchWithAuth } from '../utils/api';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Navigation, MapPin, Calendar, Users, Shield, Route, X, Clock, CloudRain, Sun, Zap, ChevronRight, Crosshair, TrendingUp, Wrench, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import PremiumBadge from './PremiumBadge';

export default function UniversalSearch() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isFocused, setIsFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any>({
    routes: [],
    events: [],
    clubs: [],
    riders: [],
    locations: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dynamic placeholder based on time of day
  const getPlaceholder = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Where are we riding today?";
    if (hour >= 12 && hour < 17) return "Find biker cafes near you...";
    if (hour >= 17 && hour < 22) return "Search night rides & meetups...";
    return "Search routes, clubs, or riders...";
  };

  const [placeholder, setPlaceholder] = useState(getPlaceholder());

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholder(getPlaceholder());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults({ routes: [], events: [], clubs: [], riders: [], locations: [] });
      return;
    }

    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const res = await fetchWithAuth(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(fetchResults, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleSelect = (type: string, item: any) => {
    setIsFocused(false);
    setSearchQuery('');
    
    // Trigger haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    switch (type) {
      case 'route':
        navigate(`/roads?routeId=${item.id}`);
        break;
      case 'event':
        navigate(`/events/${item.id}`);
        break;
      case 'club':
        navigate(`/profile/${item.username}`);
        break;
      case 'rider':
        navigate(`/profile/${item.username}`);
        break;
      case 'location':
        if (item.username) {
          navigate(`/profile/${item.username}`);
        } else {
          navigate(`/map?placeId=${item.id}`);
        }
        break;
    }
  };

  return (
    <div className={`transition-all duration-300 ${isFocused ? 'fixed left-4 right-4 top-4 sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:top-4 sm:w-full sm:max-w-2xl z-[100]' : 'w-full max-w-md relative z-[100]'}`}>
      {/* Backdrop Blur when focused */}
      <AnimatePresence>
        {isFocused && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-engine/60 backdrop-blur-md"
            style={{ zIndex: -1 }}
            onClick={() => setIsFocused(false)}
          />
        )}
      </AnimatePresence>

      <motion.div 
        layout
        className={`relative w-full transition-all duration-300 ${isFocused ? 'bg-oil border-primary/50 shadow-[0_0_30px_rgba(255,85,0,0.15)]' : 'bg-oil/70 border-inverse/10 backdrop-blur-xl'} border rounded-2xl overflow-hidden`}
      >
        <form 
          onSubmit={(e) => { e.preventDefault(); inputRef.current?.blur(); }}
          className="flex items-center px-4 py-3"
        >
          {isFocused ? (
            <button 
              type="button" 
              onClick={() => { setIsFocused(false); setSearchQuery(''); }}
              className="p-1 -ml-1 text-steel hover:text-chrome lg:hidden"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
          ) : (
            <Crosshair className="w-5 h-5 text-steel" />
          )}
          <Crosshair className={`w-5 h-5 transition-colors hidden lg:block ${isFocused ? 'text-primary' : 'text-steel'}`} />
          
          <input
            ref={inputRef}
            type="text"
            value={searchQuery || ''}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            placeholder={placeholder}
            className="w-full bg-transparent border-none text-chrome placeholder:text-steel focus:outline-none focus:ring-0 ml-3 font-mono text-sm"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="p-1 text-steel hover:text-chrome">
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        <AnimatePresence>
          {isFocused && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-inverse/5 max-h-[70vh] overflow-y-auto custom-scrollbar bg-oil"
            >
              {!searchQuery.trim() ? (
                <div className="p-4 space-y-6">
                  {/* Smart Discovery (Zero-State) */}
                  <div>
                    <h3 className="text-xs font-mono font-bold text-steel uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Wrench className="w-3 h-3" /> {t('partsAndService.title')}
                    </h3>
                    <button 
                      onClick={() => {
                        setIsFocused(false);
                        navigate('/parts-and-service');
                      }} 
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors group border border-primary/20"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                          <Wrench className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <span className="text-sm text-primary font-bold block">{t('partsAndService.title')}</span>
                          <span className="text-xs text-primary/70">{t('partsAndService.subtitle')}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-primary" />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-xs font-mono font-bold text-steel uppercase tracking-widest mb-3 flex items-center gap-2">
                      <TrendingUp className="w-3 h-3" /> Trending Twisties
                    </h3>
                    <div className="space-y-2">
                      {['Tail of the Dragon', 'Pacific Coast Highway', 'Angeles Crest'].map((route, i) => (
                        <button key={i} onClick={() => setSearchQuery(route)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-inverse/5 transition-colors group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                              <Route className="w-4 h-4" />
                            </div>
                            <span className="text-sm text-chrome font-medium group-hover:text-primary transition-colors">{route}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-steel opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-mono font-bold text-steel uppercase tracking-widest mb-3 flex items-center gap-2">
                      <MapPin className="w-3 h-3" /> Pit Stops Near You
                    </h3>
                    <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                      {['Ace Cafe', 'Deus Ex Machina', 'Iron Horse Saloon'].map((stop, i) => (
                        <button key={i} onClick={() => setSearchQuery(stop)} className="shrink-0 w-32 p-3 rounded-xl bg-inverse/5 hover:bg-inverse/10 transition-colors text-left border border-inverse/5">
                          <div className="w-full h-20 rounded-lg bg-engine mb-2 flex items-center justify-center">
                            <MapPin className="w-6 h-6 text-steel" />
                          </div>
                          <span className="text-xs text-chrome font-medium block truncate">{stop}</span>
                          <span className="text-[10px] text-steel">Biker Cafe</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {/* Search Results */}
                  {isLoading ? (
                    <div className="p-8 flex justify-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      {results.routes?.length > 0 && (
                        <div className="mb-4">
                          <h4 className="px-3 py-2 text-[10px] font-mono font-bold text-steel uppercase tracking-widest">Roads & Routes</h4>
                          {results.routes.map((route: any) => (
                            <button key={route.id} onClick={() => handleSelect('route', route)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-inverse/5 transition-colors text-left">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Route className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h5 className="text-sm font-medium text-chrome truncate">{route.name}</h5>
                                <p className="text-xs text-steel truncate">{route.distance_km}km • {route.difficulty}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {results.events?.length > 0 && (
                        <div className="mb-4">
                          <h4 className="px-3 py-2 text-[10px] font-mono font-bold text-steel uppercase tracking-widest">Events</h4>
                          {results.events.map((event: any) => (
                            <button key={event.id} onClick={() => handleSelect('event', event)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-inverse/5 transition-colors text-left">
                              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
                                <Calendar className="w-5 h-5 text-info" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h5 className="text-sm font-medium text-chrome truncate">{event.title}</h5>
                                <p className="text-xs text-steel truncate">{new Date(event.date).toLocaleDateString()}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {results.clubs?.length > 0 && (
                        <div className="mb-4">
                          <h4 className="px-3 py-2 text-[10px] font-mono font-bold text-steel uppercase tracking-widest">Clubs</h4>
                          {results.clubs.map((club: any) => (
                            <button key={club.id} onClick={() => handleSelect('club', club)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-inverse/5 transition-colors text-left">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <Shield className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h5 className="text-sm font-medium text-chrome truncate flex items-center gap-1.5">
                                  {club.company_name || club.username}
                                  {club.plan === 'premium' && <PremiumBadge size={10} />}
                                </h5>
                                <p className="text-xs text-steel truncate">{club.full_address || 'Motorcycle Club'}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {results.riders?.length > 0 && (
                        <div className="mb-4">
                          <h4 className="px-3 py-2 text-[10px] font-mono font-bold text-steel uppercase tracking-widest">Riders</h4>
                          {results.riders.map((rider: any) => (
                            <button key={rider.id} onClick={() => handleSelect('rider', rider)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-inverse/5 transition-colors text-left">
                              <img src={rider.profile_picture_url || `https://ui-avatars.com/api/?name=${rider.username}&background=random`} alt={rider.username} className="w-10 h-10 rounded-full object-cover shrink-0" />
                              <div className="flex-1 min-w-0">
                                <h5 className="text-sm font-medium text-chrome truncate flex items-center gap-1.5">
                                  @{rider.username}
                                  {rider.plan === 'premium' && <PremiumBadge size={10} />}
                                </h5>
                                <p className="text-xs text-steel truncate">{rider.rider_name || 'Rider'}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {results.locations?.length > 0 && (
                        <div className="mb-4">
                          <h4 className="px-3 py-2 text-[10px] font-mono font-bold text-steel uppercase tracking-widest">Locations</h4>
                          {results.locations.map((loc: any) => (
                            <button key={loc.id} onClick={() => handleSelect('location', loc)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-inverse/5 transition-colors text-left">
                              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                                <MapPin className="w-5 h-5 text-success" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h5 className="text-sm font-medium text-chrome truncate">{loc.company_name || loc.username}</h5>
                                <p className="text-xs text-steel truncate">{loc.service_category || 'Pit Stop'}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {(!results.routes?.length && !results.events?.length && !results.clubs?.length && !results.riders?.length && !results.locations?.length) && (
                        <div className="p-8 text-center text-steel">
                          <p>No results found for "{searchQuery}"</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
