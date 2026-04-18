import { fetchWithAuth } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { Calendar, MapPin, Clock, Users, Plus, Star, ShieldCheck, Search, Filter, X, Bike, LayoutGrid, List } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { useNotification } from '../contexts/NotificationContext';
import PremiumBadge from '../components/PremiumBadge';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import LocationAutocomplete from '../components/LocationAutocomplete';

export default function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [myEvents, setMyEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all');
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const { canAccess } = useFeatureAccess();
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [eventCategory, setEventCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eventData, setEventData] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    location: '',
    image_url: '',
    category: 'road_trip',
    participation_stamp_id: null as number | null,
  });
  const [stamps, setStamps] = useState<any[]>([]);
  const [stampSearchTerm, setStampSearchTerm] = useState('');
  const [isStampSelectorOpen, setIsStampSelectorOpen] = useState(false);

  const fetchStamps = async () => {
    try {
      const res = await fetchWithAuth('/api/stamps');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setStamps(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stamps:', err);
    }
  };

  useEffect(() => {
    fetchStamps();
  }, []);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';

  const fetchEvents = async () => {
    try {
      const storedUser = localStorage.getItem('user');
      let username = '';
      if (storedUser) {
        const user = JSON.parse(storedUser);
        username = user.username;
        
        // Fetch My Events if logged in
        const profileRes = await fetchWithAuth(`/api/profile/${encodeURIComponent(username)}`);
        const profileData = await profileRes.json();
        
        const hosted = (profileData.events || []).map((e: any) => ({ 
          ...e, 
          type: 'hosted',
          has_rsvpd: profileData.rsvpd_events?.some((re: any) => re.id === e.id)
        }));
        
        const attending = (profileData.rsvpd_events || []).map((e: any) => ({ 
          ...e, 
          type: 'attending',
          has_rsvpd: true 
        }));

        const combinedMyEvents = [...hosted, ...attending].sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setMyEvents(combinedMyEvents);
      }
      
      const res = await fetchWithAuth(`/api/events?username=${username}`);
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async (eventId: number) => {
    if (!currentUser) {
      showNotification('error', t('events.loginToRSVP'));
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username }),
      });
      if (res.ok) {
        fetchEvents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...eventData,
          username: currentUser.username,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        setEventData({ title: '', description: '', date: '', time: '', location: '', image_url: '', category: 'road_trip', participation_stamp_id: null });
        setStampSearchTerm('');
        setIsStampSelectorOpen(false);
        fetchEvents();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetchWithAuth('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setEventData(prev => ({ ...prev, image_url: data.url }));
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handlePromote = async (eventId: number, currentStatus: number) => {
    try {
      const res = await fetchWithAuth(`/api/admin/events/${eventId}/promote`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser?.role || 'user'
        },
        body: JSON.stringify({ is_promoted: !currentStatus }),
      });

      if (res.ok) {
        fetchEvents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredEvents = (activeTab === 'all' ? events : myEvents).filter(event => {
    const matchesQuery = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         event.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDate = searchDate ? event.date.includes(searchDate) : true;
    const matchesCategory = eventCategory === 'all' ? true : event.category === eventCategory;
    return matchesQuery && matchesDate && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-5rem)] py-12 pb-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-display font-black uppercase italic tracking-tighter mb-2 text-primary">{t('events.title')}</h1>
          </div>
          <p className="text-steel font-light">{t('events.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {currentUser && (
            <button 
              onClick={() => {
                if (canAccess('create_event', currentUser.plan, currentUser.role, currentUser.type)) {
                  setShowModal(true);
                } else {
                  showNotification(t('admin.featureAccess.allowedPlan'), 'error');
                }
              }}
              className="btn-primary"
            >
              <Plus className="w-5 h-5 mr-2 inline" />
              {t('events.create')}
            </button>
          )}
        </div>
      </div>

      {currentUser && (
        <div className="flex items-center gap-2 mb-10 bg-engine p-1.5 rounded-2xl border border-inverse/5 w-fit">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
              activeTab === 'all' ? 'bg-primary text-inverse shadow-lg shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            {t('nav.events')}
          </button>
          <button
            onClick={() => setActiveTab('my')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
              activeTab === 'my' ? 'bg-primary text-inverse shadow-lg shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            {t('nav.myEvents')}
          </button>
        </div>
      )}

      <div className="mb-12">
        <div className="glass-card p-4 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-steel" />
            <input 
              type="text" 
              placeholder={t('events.searchPlaceholder')}
              value={searchQuery || ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-12"
            />
          </div>
          <div className="relative md:w-48">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-steel" />
            <input 
              type="date" 
              value={searchDate || ''}
              onChange={(e) => setSearchDate(e.target.value)}
              className="input-field pl-12"
            />
          </div>
          <div className="relative md:w-48">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-steel" />
            <select
              value={eventCategory}
              onChange={(e) => setEventCategory(e.target.value)}
              className="input-field pl-12 appearance-none"
            >
              <option value="all">{t('events.category.all')}</option>
              <option value="road_trip">{t('events.category.road_trip')}</option>
              <option value="club_meetup">{t('events.category.club_meetup')}</option>
              <option value="shop_event">{t('events.category.shop_event')}</option>
              <option value="track_day">{t('events.category.track_day')}</option>
              <option value="other">{t('events.category.other')}</option>
            </select>
          </div>
          <div className="hidden lg:flex items-center gap-2 bg-engine p-1.5 rounded-2xl border border-inverse/5">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-primary text-inverse shadow-lg' : 'text-steel hover:text-chrome'}`}
              title={t('events.view.list')}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-primary text-inverse shadow-lg' : 'text-steel hover:text-chrome'}`}
              title={t('events.view.grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className={`grid gap-8 ${viewMode === 'grid' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {activeTab === 'all' ? (
          filteredEvents.length > 0 ? (
            filteredEvents.map((event) => (
              <EventListItem 
                key={`${event.type || 'all'}-${event.id}`} 
                event={event} 
                t={t} 
                isAdmin={isAdmin} 
                handleRSVP={handleRSVP} 
                handlePromote={handlePromote} 
                viewMode={viewMode}
              />
            ))
          ) : (
            <EmptyEvents t={t} />
          )
        ) : (
          <div className="space-y-12">
            {/* Hosted Events */}
            <div>
              <h3 className="text-xs font-mono font-black text-steel uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/50" />
                {t('eventDetails.hostedBy')} {t('profile.me')}
              </h3>
              <div className={`grid gap-6 ${viewMode === 'grid' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
                {filteredEvents.filter(e => e.type === 'hosted').length > 0 ? (
                  filteredEvents.filter(e => e.type === 'hosted').map((event) => (
                    <EventListItem 
                      key={`hosted-${event.id}`} 
                      event={event} 
                      t={t} 
                      isAdmin={isAdmin} 
                      handleRSVP={handleRSVP} 
                      handlePromote={handlePromote} 
                      viewMode={viewMode}
                    />
                  ))
                ) : (
                  <div className="p-8 rounded-2xl border border-dashed border-inverse/5 text-center text-steel font-mono text-[10px] uppercase tracking-widest">
                    {t('events.noHosted')}
                  </div>
                )}
              </div>
            </div>

            {/* Attending Events */}
            <div>
              <h3 className="text-xs font-mono font-black text-steel uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-success shadow-lg shadow-success/50" />
                {t('events.attending')}
              </h3>
              <div className={`grid gap-6 ${viewMode === 'grid' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
                {filteredEvents.filter(e => e.type === 'attending').length > 0 ? (
                  filteredEvents.filter(e => e.type === 'attending').map((event) => (
                    <EventListItem 
                      key={`attending-${event.id}`} 
                      event={event} 
                      t={t} 
                      isAdmin={isAdmin} 
                      handleRSVP={handleRSVP} 
                      handlePromote={handlePromote} 
                      viewMode={viewMode}
                    />
                  ))
                ) : (
                  <div className="p-8 rounded-2xl border border-dashed border-inverse/5 text-center text-steel font-mono text-[10px] uppercase tracking-widest">
                    {t('events.notAttending')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-engine/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto glass-card p-10 shadow-2xl shadow-primary/10"
            >
              <button 
                onClick={() => setShowModal(false)}
                className="absolute top-8 right-8 p-2 text-steel hover:text-chrome transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-2 text-primary">{t('event.modal.title')}</h2>
              <p className="text-steel font-light mb-10">{t('event.modal.subtitle')}</p>
              
              <form onSubmit={handleCreateEvent} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('event.field.title')}</label>
                    <input
                      type="text"
                      required
                      autoCapitalize="sentences"
                      placeholder={t('event.modal.titlePlaceholder')}
                      value={eventData.title || ''}
                      onChange={(e) => setEventData({...eventData, title: e.target.value})}
                      className="input-field"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('event.field.category')}</label>
                    <select
                      required
                      value={eventData.category || 'road_trip'}
                      onChange={(e) => setEventData({...eventData, category: e.target.value})}
                      className="input-field appearance-none"
                    >
                      <option value="road_trip">{t('events.category.road_trip')}</option>
                      <option value="club_meetup">{t('events.category.club_meetup')}</option>
                      <option value="shop_event">{t('events.category.shop_event')}</option>
                      <option value="track_day">{t('events.category.track_day')}</option>
                      <option value="other">{t('events.category.other')}</option>
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('event.field.date')}</label>
                    <input
                      type="date"
                      required
                      value={eventData.date || ''}
                      onChange={(e) => setEventData({...eventData, date: e.target.value})}
                      className="input-field"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('event.field.time')}</label>
                    <input
                      type="text"
                      required
                      autoCapitalize="sentences"
                      placeholder={t('event.modal.timePlaceholder')}
                      value={eventData.time || ''}
                      onChange={(e) => setEventData({...eventData, time: e.target.value})}
                      className="input-field"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('event.field.location')}</label>
                  <LocationAutocomplete
                    value={eventData.location}
                    onChange={(value) => setEventData({...eventData, location: value})}
                    placeholder={t('event.modal.locationPlaceholder')}
                  />
                </div>
                
                <div className="space-y-4">
                  <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('event.field.coverImage')}</label>
                  <div className="flex items-center gap-6">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-28 h-28 rounded-3xl bg-engine border border-inverse/10 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all overflow-hidden relative group shadow-xl"
                    >
                      {eventData.image_url ? (
                        <>
                          <img src={eventData.image_url} alt="Event" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                          <div className="absolute inset-0 bg-engine/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Plus className="w-8 h-8 text-chrome" />
                          </div>
                        </>
                      ) : (
                        <>
                          <Plus className="w-8 h-8 text-engine mb-1" />
                          <span className="text-[10px] text-steel font-mono font-bold uppercase tracking-widest">{t('event.field.uploadCover')}</span>
                        </>
                      )}
                      {isUploading && (
                        <div className="absolute inset-0 bg-engine/90 flex items-center justify-center">
                          <Clock className="w-6 h-6 text-primary animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-steel mb-3 leading-relaxed">{t('event.upload.coverDesc')}</p>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      {eventData.image_url && (
                        <button 
                          type="button"
                          onClick={() => setEventData(prev => ({ ...prev, image_url: '' }))}
                          className="text-[10px] font-mono font-black text-accent uppercase tracking-widest hover:text-error transition-colors"
                        >
                          {t('event.field.remove')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Image Preview Area */}
                  <div className="mt-4 p-4 rounded-2xl bg-engine border border-inverse/5">
                    <div className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest mb-4">{t('event.preview.title')}</div>
                    <div className="aspect-video w-full rounded-xl overflow-hidden bg-oil border border-inverse/5 flex items-center justify-center relative group">
                      {eventData.image_url ? (
                        <img src={eventData.image_url} alt="Preview" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <Bike className="w-12 h-12 text-engine" />
                          <span className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest">{t('event.preview.noImage')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">
                    Participation Stamp
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsStampSelectorOpen(!isStampSelectorOpen)}
                      className="w-full input-field flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-3">
                        {eventData.participation_stamp_id ? (
                          <>
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                              <ShieldCheck className="w-4 h-4 text-primary" />
                            </div>
                            <span className="text-chrome">
                              {stamps.find(s => s.id === eventData.participation_stamp_id)?.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-steel italic">No stamp selected</span>
                        )}
                      </div>
                      <Plus className={`w-4 h-4 text-steel transition-transform ${isStampSelectorOpen ? 'rotate-45' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {isStampSelectorOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute z-50 w-full mt-2 bg-engine border border-inverse/10 rounded-2xl shadow-2xl overflow-hidden"
                        >
                          <div className="p-4 border-bottom border-inverse/5">
                            <div className="relative">
                              <Search className="w-4 h-4 text-steel absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                placeholder="Search stamps..."
                                value={stampSearchTerm}
                                onChange={(e) => setStampSearchTerm(e.target.value)}
                                className="w-full bg-oil border border-inverse/5 rounded-xl pl-10 pr-4 py-2 text-xs text-chrome focus:outline-none focus:border-primary transition-all"
                              />
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            <button
                              type="button"
                              onClick={() => {
                                setEventData({ ...eventData, participation_stamp_id: null });
                                setIsStampSelectorOpen(false);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-inverse/5 transition-colors flex items-center gap-3 border-b border-inverse/5"
                            >
                              <div className="w-8 h-8 rounded-full bg-oil flex items-center justify-center border border-inverse/10">
                                <X className="w-4 h-4 text-steel" />
                              </div>
                              <span className="text-[10px] font-mono font-black uppercase tracking-widest text-steel">
                                No Stamp
                              </span>
                            </button>
                            {stamps
                              .filter(s => s.name.toLowerCase().includes(stampSearchTerm.toLowerCase()))
                              .map(stamp => (
                                <button
                                  key={stamp.id}
                                  type="button"
                                  onClick={() => {
                                    setEventData({ ...eventData, participation_stamp_id: stamp.id });
                                    setIsStampSelectorOpen(false);
                                  }}
                                  className="w-full px-4 py-3 text-left hover:bg-inverse/5 transition-colors flex items-center gap-3 border-b border-inverse/5 last:border-0"
                                >
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                                    <ShieldCheck className="w-4 h-4 text-primary" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-mono font-black uppercase tracking-widest text-chrome">
                                      {stamp.name}
                                    </span>
                                    <span className="text-[8px] font-mono text-steel uppercase tracking-widest">
                                      {stamp.type}
                                    </span>
                                  </div>
                                </button>
                              ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('event.field.description')}</label>
                  <textarea
                    required
                    rows={4}
                    autoCapitalize="sentences"
                    placeholder={t('event.modal.descPlaceholder')}
                    value={eventData.description || ''}
                    onChange={(e) => setEventData({...eventData, description: e.target.value})}
                    className="input-field resize-none"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn-primary py-4 mt-6"
                >
                  {isSubmitting ? t('event.btn.creating') : t('event.btn.publish')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EventListItem({ event, t, isAdmin, handleRSVP, handlePromote, viewMode = 'list' }: any) {
  const { language } = useLanguage();
  const locale = language === 'pt' ? 'pt-BR' : 'en-US';

  return (
    <div 
      className={`glass-card p-8 transition-all flex flex-col ${viewMode === 'list' ? 'md:flex-row' : ''} gap-8 relative overflow-hidden group ${
        event.is_promoted ? 'border-primary/30 ring-1 ring-primary/10' : 'hover:border-primary/20'
      }`}
    >
      {event.is_promoted === 1 && (
        <div className="absolute top-0 right-0 bg-primary text-inverse text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-2xl flex items-center gap-2 shadow-lg z-20">
          <Star className="w-3 h-3 fill-current" />
          {t('events.promoted')}
        </div>
      )}

      <div className={`${viewMode === 'list' ? 'md:w-56' : 'w-full h-48'} shrink-0 flex flex-col justify-center items-center bg-engine rounded-3xl border border-inverse/5 overflow-hidden relative group/img shadow-2xl`}>
        {event.image_url ? (
          <img src={event.image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover/img:opacity-60 grayscale group-hover/img:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-50" />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <span className="text-primary font-mono font-black text-xs uppercase tracking-[0.2em] mb-2">
            {new Date(event.date + 'T12:00:00').toLocaleDateString(locale, { month: 'short' })}
          </span>
          <span className="text-6xl font-display font-black italic tracking-tighter">
            {new Date(event.date + 'T12:00:00').getDate()}
          </span>
          <div className="flex items-center gap-2 text-steel font-mono text-[10px] uppercase tracking-widest mt-4 bg-engine/80 px-3 py-1 rounded-full border border-inverse/5">
            <Clock className="w-3 h-3" />
            {event.time}
          </div>
        </div>
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-4 mb-4">
          <Link to={`/profile/${event.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity group/author">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-inverse/10 shadow-lg">
              <img src={event.profile_picture_url} alt="" className="w-full h-full object-cover grayscale group-hover/author:grayscale-0 transition-all" referrerPolicy="no-referrer" />
            </div>
            <span className="text-xs font-mono font-black uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20 group-hover/author:bg-primary group-hover/author:text-inverse transition-all flex items-center gap-1.5">
              {event.company_name || event.username}
              {event.plan === 'premium' && <PremiumBadge size={10} />}
            </span>
          </Link>
          <span className="w-1 h-1 rounded-full bg-engine" />
          <span className="text-[10px] font-mono font-black text-primary uppercase tracking-widest px-3 py-1 rounded-full bg-primary/5 border border-primary/10">
            {event.category ? t(`events.category.${event.category}`) : t('events.category.other')}
          </span>
        </div>
        
        <Link to={`/events/${event.id}`} className="hover:text-primary transition-colors">
          <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-4">{event.title}</h2>
        </Link>
        <p className="text-steel font-light mb-6 line-clamp-2 leading-relaxed">{event.description}</p>
        
        <div className="flex flex-wrap items-center gap-6 text-[10px] font-mono uppercase tracking-widest text-steel">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-engine" />
            {event.location}
          </div>
          {event.rsvp_count > 0 && (
            <div className="flex items-center gap-2 text-primary font-bold bg-primary/5 px-3 py-1 rounded-full border border-primary/10 shadow-sm shadow-primary/5">
              <Users className="w-4 h-4" />
              {event.rsvp_count} {t('event.details.ridersAttending')}
            </div>
          )}
          {event.participation_badge_name && (
            <div className="flex items-center gap-2 text-primary font-bold">
              <ShieldCheck className="w-4 h-4" />
              {t('event.field.participationBadge')}: {event.participation_badge_name}
            </div>
          )}
          {event.stamp_name && (
            <div className="flex items-center gap-2 text-primary font-bold">
              <ShieldCheck className="w-4 h-4" />
              {t('event.field.participationStamp')}: {event.stamp_name}
            </div>
          )}
        </div>
      </div>

      <div className={`${viewMode === 'list' ? 'md:w-40' : 'w-full'} shrink-0 flex flex-col justify-center gap-4`}>
        <button 
          onClick={() => handleRSVP(event.id)}
          className={`w-full py-3 rounded-2xl font-display font-black uppercase italic tracking-widest text-xs transition-all border ${
            event.has_rsvpd 
              ? 'bg-primary text-white border-primary hover:bg-oil hover:text-primary shadow-lg shadow-primary/20' 
              : 'bg-inverse/5 text-chrome border-inverse/10 hover:bg-inverse/10'
          }`}
        >
          {event.has_rsvpd ? t('events.attending') : t('events.rsvp')}
        </button>
        {isAdmin && (
          <button 
            onClick={() => handlePromote(event.id, event.is_promoted)}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[10px] font-mono font-bold uppercase tracking-widest transition-all ${
              event.is_promoted 
                ? 'bg-engine text-steel hover:bg-oil' 
                : 'bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            {event.is_promoted ? t('events.unpromote') : t('events.promote')}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyEvents({ t }: any) {
  return (
    <div className="text-center py-32 glass-card border-dashed border-inverse/10">
      <Calendar className="w-16 h-16 text-engine mx-auto mb-6" />
      <h3 className="text-2xl font-display font-black uppercase italic mb-4 tracking-tight">{t('events.noFound')}</h3>
      <p className="text-steel font-light">{t('events.checkBack')}</p>
    </div>
  );
}
