import React, { useEffect, useState } from 'react';
import { Calendar, MapPin, Clock, Users, Plus, Star, ShieldCheck, Search, Filter, X, Bike } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';

export default function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [myEvents, setMyEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all');
  const { t } = useLanguage();
  
  // Filter states
  const [searchTitle, setSearchTitle] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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
  });
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
        const profileRes = await fetch(`/api/profile/${username}`);
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
      
      const res = await fetch(`/api/events?username=${username}`);
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
      alert('Please login to RSVP');
      return;
    }
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
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
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...eventData,
          username: currentUser.username,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        setEventData({ title: '', description: '', date: '', time: '', location: '', image_url: '' });
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
      const res = await fetch('/api/upload', {
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
      const res = await fetch(`/api/admin/events/${eventId}/promote`, {
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
    const matchesTitle = event.title.toLowerCase().includes(searchTitle.toLowerCase());
    const matchesLocation = event.location.toLowerCase().includes(searchLocation.toLowerCase());
    const matchesDate = searchDate ? event.date.includes(searchDate) : true;
    return matchesTitle && matchesLocation && matchesDate;
  });

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-display font-black uppercase italic tracking-tighter mb-2 text-primary">{t('events.title')}</h1>
            <Link to="/submit-photo" className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-xl transition-colors">
              {t('events.submitPhoto')}
            </Link>
            <Link to="/contest" className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2 px-4 rounded-xl transition-colors">
              {t('events.vote')}
            </Link>
          </div>
          <p className="text-zinc-500 font-light">{t('events.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-3 rounded-2xl border transition-all ${showFilters ? 'bg-primary/10 border-primary/50 text-primary' : 'bg-zinc-900 border-white/5 text-zinc-500 hover:text-white'}`}
          >
            <Filter className="w-5 h-5" />
          </button>
          {currentUser && (
            <button 
              onClick={() => setShowModal(true)}
              className="btn-primary"
            >
              <Plus className="w-5 h-5 mr-2 inline" />
              {t('events.create')}
            </button>
          )}
        </div>
      </div>

      {currentUser && (
        <div className="flex items-center gap-2 mb-10 bg-zinc-950 p-1.5 rounded-2xl border border-white/5 w-fit">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
              activeTab === 'all' ? 'bg-primary text-zinc-950 shadow-lg shadow-primary/20' : 'text-zinc-500 hover:text-white'
            }`}
          >
            {t('nav.events')}
          </button>
          <button
            onClick={() => setActiveTab('my')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
              activeTab === 'my' ? 'bg-primary text-zinc-950 shadow-lg shadow-primary/20' : 'text-zinc-500 hover:text-white'
            }`}
          >
            {t('nav.myEvents')}
          </button>
        </div>
      )}

      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-12 overflow-hidden"
          >
            <div className="glass-card p-6 grid sm:grid-cols-3 gap-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  type="text" 
                  placeholder={t('events.filter.title')}
                  value={searchTitle}
                  onChange={(e) => setSearchTitle(e.target.value)}
                  className="input-field pl-12"
                />
              </div>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  type="text" 
                  placeholder={t('events.filter.location')}
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  className="input-field pl-12"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input 
                  type="date" 
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  className="input-field pl-12"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-8">
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
              />
            ))
          ) : (
            <EmptyEvents t={t} />
          )
        ) : (
          <div className="space-y-12">
            {/* Hosted Events */}
            <div>
              <h3 className="text-xs font-mono font-black text-zinc-600 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/50" />
                {t('profile.hostedBy')} {t('profile.me')}
              </h3>
              <div className="grid gap-6">
                {filteredEvents.filter(e => e.type === 'hosted').length > 0 ? (
                  filteredEvents.filter(e => e.type === 'hosted').map((event) => (
                    <EventListItem 
                      key={`hosted-${event.id}`} 
                      event={event} 
                      t={t} 
                      isAdmin={isAdmin} 
                      handleRSVP={handleRSVP} 
                      handlePromote={handlePromote} 
                    />
                  ))
                ) : (
                  <div className="p-8 rounded-2xl border border-dashed border-white/5 text-center text-zinc-600 font-mono text-[10px] uppercase tracking-widest">
                    {t('events.noHosted')}
                  </div>
                )}
              </div>
            </div>

            {/* Attending Events */}
            <div>
              <h3 className="text-xs font-mono font-black text-zinc-600 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                {t('profile.attending')}
              </h3>
              <div className="grid gap-6">
                {filteredEvents.filter(e => e.type === 'attending').length > 0 ? (
                  filteredEvents.filter(e => e.type === 'attending').map((event) => (
                    <EventListItem 
                      key={`attending-${event.id}`} 
                      event={event} 
                      t={t} 
                      isAdmin={isAdmin} 
                      handleRSVP={handleRSVP} 
                      handlePromote={handlePromote} 
                    />
                  ))
                ) : (
                  <div className="p-8 rounded-2xl border border-dashed border-white/5 text-center text-zinc-600 font-mono text-[10px] uppercase tracking-widest">
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
              className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto glass-card p-10 shadow-2xl shadow-primary/10"
            >
              <button 
                onClick={() => setShowModal(false)}
                className="absolute top-8 right-8 p-2 text-zinc-600 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-2 text-primary">{t('event.modal.title')}</h2>
              <p className="text-zinc-500 font-light mb-10">{t('event.modal.subtitle')}</p>
              
              <form onSubmit={handleCreateEvent} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest ml-1">{t('event.field.title')}</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sunday Morning Canyon Run"
                    value={eventData.title}
                    onChange={(e) => setEventData({...eventData, title: e.target.value})}
                    className="input-field"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest ml-1">{t('event.field.date')}</label>
                    <input
                      type="date"
                      required
                      value={eventData.date}
                      onChange={(e) => setEventData({...eventData, date: e.target.value})}
                      className="input-field"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest ml-1">{t('event.field.time')}</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 08:00 AM"
                      value={eventData.time}
                      onChange={(e) => setEventData({...eventData, time: e.target.value})}
                      className="input-field"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest ml-1">{t('event.field.location')}</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mulholland Hwy, Malibu"
                    value={eventData.location}
                    onChange={(e) => setEventData({...eventData, location: e.target.value})}
                    className="input-field"
                  />
                </div>
                
                <div className="space-y-4">
                  <label className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest ml-1">{t('event.field.image')}</label>
                  <div className="flex items-center gap-6">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-28 h-28 rounded-3xl bg-zinc-950 border border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all overflow-hidden relative group shadow-xl"
                    >
                      {eventData.image_url ? (
                        <>
                          <img src={eventData.image_url} alt="Event" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Plus className="w-8 h-8 text-white" />
                          </div>
                        </>
                      ) : (
                        <>
                          <Plus className="w-8 h-8 text-zinc-800 mb-1" />
                          <span className="text-[10px] text-zinc-600 font-mono font-bold uppercase tracking-widest">{t('event.field.upload')}</span>
                        </>
                      )}
                      {isUploading && (
                        <div className="absolute inset-0 bg-zinc-950/90 flex items-center justify-center">
                          <Clock className="w-6 h-6 text-primary animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mb-3 leading-relaxed">{t('event.upload.desc')}</p>
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
                          className="text-[10px] font-mono font-black text-accent uppercase tracking-widest hover:text-red-400 transition-colors"
                        >
                          {t('event.field.remove')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Image Preview Area */}
                  <div className="mt-4 p-4 rounded-2xl bg-zinc-950 border border-white/5">
                    <div className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mb-4">{t('event.preview.title')}</div>
                    <div className="aspect-video w-full rounded-xl overflow-hidden bg-zinc-900 border border-white/5 flex items-center justify-center relative group">
                      {eventData.image_url ? (
                        <img src={eventData.image_url} alt="Preview" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <Bike className="w-12 h-12 text-zinc-800" />
                          <span className="text-[10px] font-mono font-bold text-zinc-700 uppercase tracking-widest">{t('event.preview.noImage')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest ml-1">{t('event.field.description')}</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="What's the plan? Route details, skill level, etc."
                    value={eventData.description}
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

function EventListItem({ event, t, isAdmin, handleRSVP, handlePromote }: any) {
  return (
    <div 
      className={`glass-card p-8 transition-all flex flex-col md:flex-row gap-8 relative overflow-hidden group ${
        event.is_promoted ? 'border-primary/30 ring-1 ring-primary/10' : 'hover:border-primary/20'
      }`}
    >
      {event.is_promoted === 1 && (
        <div className="absolute top-0 right-0 bg-primary text-zinc-950 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-2xl flex items-center gap-2 shadow-lg z-20">
          <Star className="w-3 h-3 fill-current" />
          {t('events.promoted')}
        </div>
      )}

      <div className="md:w-56 shrink-0 flex flex-col justify-center items-center bg-zinc-950 rounded-3xl border border-white/5 overflow-hidden relative group/img shadow-2xl">
        {event.image_url ? (
          <img src={event.image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover/img:opacity-60 grayscale group-hover/img:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-50" />
        )}
        <div className="relative z-10 flex flex-col items-center">
          <span className="text-primary font-mono font-black text-xs uppercase tracking-[0.2em] mb-2">
            {new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </span>
          <span className="text-6xl font-display font-black italic tracking-tighter">
            {new Date(event.date + 'T12:00:00').getDate()}
          </span>
          <div className="flex items-center gap-2 text-zinc-500 font-mono text-[10px] uppercase tracking-widest mt-4 bg-zinc-950/80 px-3 py-1 rounded-full border border-white/5">
            <Clock className="w-3 h-3" />
            {event.time}
          </div>
        </div>
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-4 mb-4">
          <Link to={`/profile/${event.username}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity group/author">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 shadow-lg">
              <img src={event.profile_picture_url} alt="" className="w-full h-full object-cover grayscale group-hover/author:grayscale-0 transition-all" referrerPolicy="no-referrer" />
            </div>
            <span className="text-xs font-mono font-black uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20 group-hover/author:bg-primary group-hover/author:text-zinc-950 transition-all">
              {event.company_name || event.username}
            </span>
          </Link>
          <span className="w-1 h-1 rounded-full bg-zinc-800" />
          <span className="text-[10px] font-mono font-black text-primary uppercase tracking-widest px-3 py-1 rounded-full bg-primary/5 border border-primary/10">
            {t(`category.${event.service_category}`) || 'Community'}
          </span>
        </div>
        
        <Link to={`/events/${event.id}`} className="hover:text-primary transition-colors">
          <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-4">{event.title}</h2>
        </Link>
        <p className="text-zinc-500 font-light mb-6 line-clamp-2 leading-relaxed">{event.description}</p>
        
        <div className="flex flex-wrap items-center gap-6 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-zinc-800" />
            {event.location}
          </div>
          <div className="flex items-center gap-2 text-primary font-bold">
            <Users className="w-4 h-4" />
            {event.rsvp_count || 0} {t('event.details.ridersAttending')}
          </div>
        </div>
      </div>

      <div className="md:w-40 shrink-0 flex flex-col justify-center gap-4">
        <button 
          onClick={() => handleRSVP(event.id)}
          className={`w-full py-3 rounded-2xl font-display font-black uppercase italic tracking-widest text-xs transition-all border ${
            event.has_rsvpd 
              ? 'bg-primary text-zinc-950 border-primary hover:bg-oil shadow-lg shadow-primary/20' 
              : 'bg-white/5 text-white border-white/10 hover:bg-white/10'
          }`}
        >
          {event.has_rsvpd ? t('events.attending') : t('events.rsvp')}
        </button>
        {isAdmin && (
          <button 
            onClick={() => handlePromote(event.id, event.is_promoted)}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[10px] font-mono font-bold uppercase tracking-widest transition-all ${
              event.is_promoted 
                ? 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700' 
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
    <div className="text-center py-32 glass-card border-dashed border-white/10">
      <Calendar className="w-16 h-16 text-zinc-800 mx-auto mb-6" />
      <h3 className="text-2xl font-display font-black uppercase italic mb-4 tracking-tight">{t('events.noFound')}</h3>
      <p className="text-zinc-500 font-light">{t('events.checkBack')}</p>
    </div>
  );
}
