import React, { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  MapPin, Calendar, Wrench, Bike, ShieldCheck, 
  ArrowLeft, Building2, Phone, Globe, MessageSquare, 
  Heart, Share2, Send, Image as ImageIcon, Tag, Plus, Clock
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function Profile() {
  const { username } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  
  useEffect(() => {
    const editEventId = searchParams.get('editEvent');
    if (editEventId) {
      // Need to fetch events first, then find the event and call handleEditEvent
      // This is tricky because fetchProfile is async.
      // I'll just set a flag and handle it after fetchProfile.
    }
  }, [searchParams]);
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [postContent, setPostContent] = useState('');
  const [eventData, setEventData] = useState({ title: '', description: '', date: '', time: '', location: '', image_url: '' });
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const eventImageInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingEventImage, setIsUploadingEventImage] = useState(false);
  const [motoData, setMotoData] = useState({ make: '', model: '', year: '', last_service: '', last_km: '', last_shop: '' });
  const [maintenanceData, setMaintenanceData] = useState({ service: '', km: '', shop: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isAddingMoto, setIsAddingMoto] = useState(false);
  const [activeMaintenanceMotoId, setActiveMaintenanceMotoId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user from localStorage", e);
        localStorage.removeItem('user');
      }
    }
  }, []);

  const isOwner = currentUser?.username === username;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';
  const canEdit = isOwner || isAdmin;

  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/profile/${username}`);
      if (!res.ok) throw new Error('Profile not found');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [username]);

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          content: postContent,
          image_url: `https://picsum.photos/seed/${Math.random()}/800/600`,
        }),
      });

      if (res.ok) {
        setPostContent('');
        fetchProfile(); // Refresh posts
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!eventData.title.trim()) {
      setNotification({ message: 'Title is required', type: 'error' });
      return;
    }
    if (!eventData.date) {
      setNotification({ message: 'Date is required', type: 'error' });
      return;
    }
    if (!eventData.time) {
      setNotification({ message: 'Time is required', type: 'error' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const url = editingEventId ? `/api/events/${editingEventId}` : '/api/events';
      const method = editingEventId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          ...eventData
        }),
      });

      if (res.ok) {
        setEventData({ title: '', description: '', date: '', time: '', location: '', image_url: '' });
        setIsCreatingEvent(false);
        setEditingEventId(null);
        setNotification({ message: 'Event created successfully!', type: 'success' });
        fetchProfile(); // Refresh events
        setTimeout(() => setNotification(null), 3000);
      } else {
        setNotification({ message: 'Failed to create event', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setNotification({ message: 'An error occurred', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEventImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingEventImage(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (res.ok) {
        setEventData(prev => ({ ...prev, image_url: result.url }));
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploadingEventImage(false);
    }
  };

  const handleEditEvent = (event: any) => {
    setEventData({
      title: event.title,
      description: event.description,
      date: event.date,
      time: event.time,
      location: event.location,
      image_url: event.image_url
    });
    setEditingEventId(event.id);
    setIsCreatingEvent(true);
  };

  const handleMotoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/motorcycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          ...motoData
        }),
      });

      if (res.ok) {
        setMotoData({ make: '', model: '', year: '', last_service: '', last_km: '', last_shop: '' });
        setIsAddingMoto(false);
        fetchProfile(); // Refresh garage
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMaintenanceSubmit = async (e: React.FormEvent, motoId: number) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/motorcycles/${motoId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maintenanceData),
      });

      if (res.ok) {
        setMaintenanceData({ service: '', km: '', shop: '' });
        setActiveMaintenanceMotoId(null);
        fetchProfile(); // Refresh garage
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRSVP = async (eventId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username }),
      });
      if (res.ok) {
        fetchProfile();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4">
        <ShieldCheck className="w-20 h-20 text-zinc-800 mb-8" />
        <h2 className="text-4xl font-display font-black uppercase italic mb-4">{t('profile.notFound')}</h2>
        <p className="text-zinc-500 mb-10 font-light">{t('profile.notFoundDesc')}</p>
        <Link to="/" className="btn-secondary">
          <ArrowLeft className="w-4 h-4 mr-2 inline" />
          {t('profile.backHome')}
        </Link>
      </div>
    );
  }

  const isRider = data.type === 'rider';

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-24">
      {/* Cover Photo */}
      <div className="h-64 sm:h-96 w-full bg-zinc-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/moto/1920/1080')] bg-cover bg-center opacity-40 mix-blend-luminosity grayscale" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/60 via-transparent to-zinc-950/60" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 sm:-mt-48 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row gap-8 sm:items-end mb-16"
        >
          {/* Avatar */}
          <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-3xl border-4 border-zinc-950 bg-zinc-900 overflow-hidden shrink-0 shadow-2xl shadow-primary/20 relative group">
            <img 
              src={data.profile_picture_url} 
              alt={username} 
              className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 border border-white/10 rounded-3xl pointer-events-none" />
          </div>

          {/* Header Info */}
          <div className="flex-1 pb-4">
            <div className="flex items-center gap-4 mb-3">
              <h1 className="text-4xl sm:text-6xl font-display font-black tracking-tighter uppercase italic">
                {isRider ? data.profile.name : data.profile.company_name}
              </h1>
              {isRider && <ShieldCheck className="w-8 h-8 text-primary drop-shadow-lg" />}
            </div>
            
            <div className="flex flex-wrap items-center gap-6 text-zinc-400 font-mono text-xs uppercase tracking-widest">
              <span className="text-primary font-bold">@{data.username}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-600" />
                {isRider ? data.profile.city : data.profile.full_address}
              </div>
              {isRider && data.profile.age && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-zinc-600" />
                    {data.profile.age} {t('profile.yearsOld')}
                  </div>
                </>
              )}
              {!isRider && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                  <div className="flex items-center gap-2 text-primary">
                    <Building2 className="w-4 h-4" />
                    {t(`category.${data.profile.service_category}`) || data.profile.service_category}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pb-4">
            {canEdit ? (
              <Link 
                to={`/edit-profile/${username}`} 
                className="btn-secondary"
              >
                {t('profile.edit')}
              </Link>
            ) : (
              <button className="btn-primary">
                {t('profile.connect')}
              </button>
            )}
            <button className="btn-secondary px-4">
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </motion.div>

        {/* Content Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-12">
            {isRider ? (
              <div className="space-y-12">
                <section>
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-2xl">
                        <Bike className="w-6 h-6 text-primary" />
                      </div>
                      <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">{t('profile.garage')}</h2>
                    </div>
                    {isOwner && (
                      <button 
                        onClick={() => setIsAddingMoto(!isAddingMoto)}
                        className="flex items-center gap-2 text-primary hover:text-oil font-display font-bold text-xs uppercase tracking-widest transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        {isAddingMoto ? t('profile.cancel') : t('profile.addMoto')}
                      </button>
                    )}
                  </div>

                  {isAddingMoto && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="glass-card p-8 mb-12 overflow-hidden border-primary/20"
                    >
                      <form onSubmit={handleMotoSubmit} className="space-y-6">
                        <div className="grid sm:grid-cols-3 gap-6">
                          <div className="space-y-2">
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 ml-1">{t('profile.make')}</label>
                            <input
                              type="text"
                              placeholder="e.g. Harley-Davidson"
                              required
                              value={motoData.make}
                              onChange={(e) => setMotoData({...motoData, make: e.target.value})}
                              className="input-field"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 ml-1">{t('profile.model')}</label>
                            <input
                              type="text"
                              placeholder="e.g. Iron 883"
                              required
                              value={motoData.model}
                              onChange={(e) => setMotoData({...motoData, model: e.target.value})}
                              className="input-field"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 ml-1">{t('profile.year')}</label>
                            <input
                              type="number"
                              placeholder={t('profile.year')}
                              required
                              value={motoData.year}
                              onChange={(e) => setMotoData({...motoData, year: e.target.value})}
                              className="input-field"
                            />
                          </div>
                        </div>
                        <div className="pt-6 border-t border-white/5">
                          <h3 className="text-xs font-mono font-bold text-zinc-600 uppercase tracking-widest mb-6">{t('profile.initialLog')}</h3>
                          <div className="grid sm:grid-cols-3 gap-6">
                            <input
                              type="text"
                              placeholder={t('profile.service')}
                              value={motoData.last_service}
                              onChange={(e) => setMotoData({...motoData, last_service: e.target.value})}
                              className="input-field"
                            />
                            <input
                              type="number"
                              placeholder="KM"
                              value={motoData.last_km}
                              onChange={(e) => setMotoData({...motoData, last_km: e.target.value})}
                              className="input-field"
                            />
                            <input
                              type="text"
                              placeholder={t('profile.shop')}
                              value={motoData.last_shop}
                              onChange={(e) => setMotoData({...motoData, last_shop: e.target.value})}
                              className="input-field"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full btn-primary"
                        >
                          {isSubmitting ? t('profile.adding') : t('profile.addToGarage')}
                        </button>
                      </form>
                    </motion.div>
                  )}
                  
                  {data.garage && data.garage.length > 0 ? (
                    <div className="grid sm:grid-cols-2 gap-6">
                      {data.garage.map((moto: any) => (
                        <div key={moto.id} className="glass-card p-8 hover:border-primary/30 transition-all group relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary/10 transition-all" />
                          
                          <div className="flex justify-between items-start mb-6 relative z-10">
                            <div>
                              <div className="text-xs font-mono font-bold text-primary mb-2 uppercase tracking-widest">{moto.year}</div>
                              <h3 className="text-2xl font-display font-black uppercase italic mb-1 tracking-tight">{moto.make}</h3>
                              <p className="text-zinc-400 font-light">{moto.model}</p>
                            </div>
                            <div className="flex flex-col items-end gap-3">
                              <div className="p-4 bg-zinc-950 rounded-2xl border border-white/5 group-hover:border-primary/30 transition-all shadow-xl">
                                <Bike className="w-6 h-6 text-zinc-700 group-hover:text-primary transition-colors" />
                              </div>
                              {isOwner && (
                                <button 
                                  onClick={() => setActiveMaintenanceMotoId(activeMaintenanceMotoId === moto.id ? null : moto.id)}
                                  className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-600 hover:text-primary transition-colors"
                                >
                                  {activeMaintenanceMotoId === moto.id ? t('profile.cancel') : t('profile.addLog')}
                                </button>
                              )}
                            </div>
                          </div>

                          {activeMaintenanceMotoId === moto.id && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="mb-6 p-4 bg-zinc-950 rounded-xl border border-orange-500/20"
                            >
                              <form onSubmit={(e) => handleMaintenanceSubmit(e, moto.id)} className="space-y-3">
                                <input
                                  type="text"
                                  placeholder="Service"
                                  required
                                  value={maintenanceData.service}
                                  onChange={(e) => setMaintenanceData({...maintenanceData, service: e.target.value})}
                                  className="w-full bg-zinc-900 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-orange-500"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="number"
                                    placeholder="KM"
                                    value={maintenanceData.km}
                                    onChange={(e) => setMaintenanceData({...maintenanceData, km: e.target.value})}
                                    className="w-full bg-zinc-900 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-orange-500"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Shop"
                                    value={maintenanceData.shop}
                                    onChange={(e) => setMaintenanceData({...maintenanceData, shop: e.target.value})}
                                    className="w-full bg-zinc-900 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-orange-500"
                                  />
                                </div>
                                <button
                                  type="submit"
                                  disabled={isSubmitting}
                                  className="w-full bg-orange-500 text-zinc-950 py-2 rounded-lg text-xs font-bold hover:bg-orange-400 transition-colors"
                                >
                                  {isSubmitting ? t('profile.saving') : t('profile.saveLog')}
                                </button>
                              </form>
                            </motion.div>
                          )}

                          {moto.maintenance_logs && moto.maintenance_logs.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
                              <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                                <Wrench className="w-3 h-3" />
                                {t('profile.maintenance')}
                              </div>
                              <div className="space-y-3">
                                {moto.maintenance_logs.map((log: any) => (
                                  <div key={log.id} className="bg-zinc-950/50 p-3 rounded-xl border border-white/5 text-xs">
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="font-bold text-zinc-200">{log.service}</div>
                                      <div className="text-[10px] text-zinc-600">
                                        {new Date(log.date).toLocaleDateString()}
                                      </div>
                                    </div>
                                    <div className="flex gap-4 text-zinc-500">
                                      {log.km && (
                                        <div className="flex items-center gap-1">
                                          <span className="text-[10px] uppercase font-bold text-zinc-700">KM:</span>
                                          {log.km.toLocaleString()}
                                        </div>
                                      )}
                                      {log.shop && (
                                        <div className="flex items-center gap-1">
                                          <span className="text-[10px] uppercase font-bold text-zinc-700">{t('profile.shop')}:</span>
                                          {log.shop}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center">
                      <Wrench className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                      <h3 className="text-lg font-medium mb-1">{t('profile.emptyGarage')}</h3>
                      <p className="text-zinc-500 text-sm">{t('profile.noMoto')}</p>
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-2xl">
                        <Calendar className="w-6 h-6 text-primary" />
                      </div>
                      <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">{t('profile.myEvents')}</h2>
                    </div>
                    {isOwner && (
                      <button 
                        onClick={() => {
                          setIsCreatingEvent(!isCreatingEvent);
                          if (isCreatingEvent) {
                            setEditingEventId(null);
                            setEventData({ title: '', description: '', date: '', time: '', location: '', image_url: '' });
                          }
                        }}
                        className="flex items-center gap-2 text-primary hover:text-oil font-display font-bold text-xs uppercase tracking-widest transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        {isCreatingEvent ? t('profile.cancel') : t('events.create')}
                      </button>
                    )}
                  </div>

                  {isCreatingEvent && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="glass-card p-8 mb-12 overflow-hidden border-primary/20"
                    >
                      <h3 className="text-xl font-display font-bold mb-6 uppercase italic tracking-tight">{editingEventId ? 'Edit Event' : 'Create New Event'}</h3>
                      <form onSubmit={handleEventSubmit} className="space-y-6">
                        <div className="grid sm:grid-cols-2 gap-6">
                          <input
                            type="text"
                            placeholder="Event Title"
                            required
                            value={eventData.title}
                            onChange={(e) => setEventData({...eventData, title: e.target.value})}
                            className="input-field"
                          />
                          <input
                            type="date"
                            required
                            value={eventData.date}
                            onChange={(e) => setEventData({...eventData, date: e.target.value})}
                            className="input-field"
                          />
                          <input
                            type="text"
                            placeholder="Time (e.g. 08:00 AM)"
                            value={eventData.time}
                            onChange={(e) => setEventData({...eventData, time: e.target.value})}
                            className="input-field"
                          />
                          <input
                            type="text"
                            placeholder="Location"
                            value={eventData.location}
                            onChange={(e) => setEventData({...eventData, location: e.target.value})}
                            className="input-field"
                          />
                        </div>

                        <div className="space-y-3">
                          <label className="block text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest ml-1">Event Image</label>
                          <div className="flex items-center gap-6">
                            <div 
                              onClick={() => eventImageInputRef.current?.click()}
                              className="w-32 h-32 rounded-3xl bg-zinc-950 border border-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all overflow-hidden relative group shadow-xl"
                            >
                              {eventData.image_url ? (
                                <>
                                  <img src={eventData.image_url} alt="Event" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <ImageIcon className="w-8 h-8 text-white" />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <ImageIcon className="w-8 h-8 text-zinc-800 mb-2" />
                                  <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">Upload</span>
                                </>
                              )}
                              {isUploadingEventImage && (
                                <div className="absolute inset-0 bg-zinc-950/80 flex items-center justify-center">
                                  <Clock className="w-6 h-6 text-primary animate-spin" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-zinc-500 mb-4 font-light leading-relaxed">Upload a cover image for your event. Recommended size: 1200x600px.</p>
                              <input 
                                type="file" 
                                ref={eventImageInputRef}
                                onChange={handleEventImageUpload}
                                accept="image/*"
                                className="hidden"
                              />
                              {eventData.image_url && (
                                <button 
                                  type="button"
                                  onClick={() => setEventData(prev => ({ ...prev, image_url: '' }))}
                                  className="text-[10px] font-mono font-bold text-accent uppercase tracking-widest hover:text-red-400 transition-colors"
                                >
                                  Remove Image
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <textarea
                          placeholder="Event Description"
                          rows={4}
                          value={eventData.description}
                          onChange={(e) => setEventData({...eventData, description: e.target.value})}
                          className="input-field resize-none"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting || isUploadingEventImage}
                          className="w-full btn-primary py-4"
                        >
                          {isSubmitting ? (editingEventId ? 'Updating...' : 'Creating...') : (editingEventId ? 'Update Event' : 'Publish Event')}
                        </button>
                      </form>
                    </motion.div>
                  )}

                  <div className="grid gap-6">
                    {/* Created Events */}
                    {data.events && data.events.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">{t('profile.hostedBy')} {isOwner ? t('profile.me') : data.username}</h3>
                        <div className="grid gap-4">
                          {data.events.map((event: any) => (
                            <EventCard 
                              key={event.id} 
                              event={event} 
                              onRSVP={handleRSVP} 
                              onEdit={handleEditEvent}
                              isOwner={isOwner}
                              currentUsername={currentUser?.username}
                              hasRSVPd={data.rsvpd_events?.some((re: any) => re.id === event.id)}
                              t={t}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RSVP'd Events */}
                    {data.rsvpd_events && data.rsvpd_events.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">{t('profile.attending')}</h3>
                        <div className="grid gap-4">
                          {data.rsvpd_events.map((event: any) => (
                            <EventCard 
                              key={event.id} 
                              event={event} 
                              onRSVP={handleRSVP} 
                              currentUsername={currentUser?.username}
                              hasRSVPd={true}
                              t={t}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {(!data.events || data.events.length === 0) && (!data.rsvpd_events || data.rsvpd_events.length === 0) && (
                      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center">
                        <Calendar className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                        <h3 className="text-lg font-medium mb-1">{t('profile.noEvents')}</h3>
                        <p className="text-zinc-500 text-sm">{t('profile.noEventsDesc')}</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-12">
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-orange-500/10 rounded-xl">
                      <Building2 className="w-5 h-5 text-orange-400" />
                    </div>
                    <h2 className="text-2xl font-bold">{t('profile.aboutUs')}</h2>
                  </div>
                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 sm:p-8">
                    <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      {data.profile.details || t('profile.noDetails')}
                    </p>
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500/10 rounded-xl">
                        <Calendar className="w-5 h-5 text-orange-400" />
                      </div>
                      <h2 className="text-2xl font-bold">{t('admin.tab.events')}</h2>
                    </div>
                    {isOwner && (
                      <button 
                        onClick={() => setIsCreatingEvent(!isCreatingEvent)}
                        className="flex items-center gap-2 text-orange-500 hover:text-orange-400 font-bold text-sm transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {isCreatingEvent ? t('profile.cancel') : t('events.create')}
                      </button>
                    )}
                  </div>

                  {isCreatingEvent && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-zinc-900/50 border border-orange-500/20 rounded-3xl p-6 mb-8 overflow-hidden"
                    >
                      <form onSubmit={handleEventSubmit} className="space-y-4">
                        {notification && (
                          <div className={`p-4 rounded-xl text-sm font-bold ${notification.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {notification.message}
                          </div>
                        )}
                        <div className="grid sm:grid-cols-2 gap-4">
                          <input
                            type="text"
                            placeholder={t('event.field.title')}
                            required
                            value={eventData.title}
                            onChange={(e) => setEventData({...eventData, title: e.target.value})}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 transition-all"
                          />
                          <input
                            type="date"
                            required
                            value={eventData.date}
                            onChange={(e) => setEventData({...eventData, date: e.target.value})}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 transition-all"
                          />
                          <input
                            type="text"
                            placeholder={t('event.field.time')}
                            value={eventData.time}
                            onChange={(e) => setEventData({...eventData, time: e.target.value})}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 transition-all"
                          />
                          <input
                            type="text"
                            placeholder={t('event.field.location')}
                            value={eventData.location}
                            onChange={(e) => setEventData({...eventData, location: e.target.value})}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 transition-all"
                          />
                        </div>
                        <textarea
                          placeholder={t('event.field.description')}
                          rows={3}
                          value={eventData.description}
                          onChange={(e) => setEventData({...eventData, description: e.target.value})}
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-orange-500 transition-all resize-none"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full bg-orange-500 text-zinc-950 py-3 rounded-xl font-bold hover:bg-orange-400 transition-colors disabled:opacity-50"
                        >
                          {isSubmitting ? t('event.btn.creating') : t('event.btn.publish')}
                        </button>
                      </form>
                    </motion.div>
                  )}

                  <div className="grid gap-6">
                    {/* Created Events */}
                    {data.events && data.events.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">{t('profile.hostedBy')} {isOwner ? t('profile.me') : data.username}</h3>
                        <div className="grid gap-4">
                          {data.events.map((event: any) => (
                            <EventCard 
                              key={event.id} 
                              event={event} 
                              onRSVP={handleRSVP} 
                              currentUsername={currentUser?.username}
                              hasRSVPd={data.rsvpd_events?.some((re: any) => re.id === event.id)}
                              t={t}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RSVP'd Events */}
                    {data.rsvpd_events && data.rsvpd_events.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">{t('profile.attending')}</h3>
                        <div className="grid gap-4">
                          {data.rsvpd_events.map((event: any) => (
                            <EventCard 
                              key={event.id} 
                              event={event} 
                              onRSVP={handleRSVP} 
                              currentUsername={currentUser?.username}
                              hasRSVPd={true}
                              t={t}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {(!data.events || data.events.length === 0) && (!data.rsvpd_events || data.rsvpd_events.length === 0) && (
                      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center">
                        <Calendar className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                        <h3 className="text-lg font-medium mb-1">{t('profile.noEvents')}</h3>
                        <p className="text-zinc-500 text-sm">{t('profile.noEventsDesc')}</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {/* Feed Section */}
            <section className="space-y-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-2xl">
                    <MessageSquare className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">{t('profile.updates')}</h2>
                </div>
              </div>

              {isOwner && (
                <div className="glass-card p-8 border-primary/20 shadow-xl shadow-primary/5">
                  <form onSubmit={handlePostSubmit}>
                    <textarea
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      placeholder={t('profile.whatsOnMind')}
                      className="w-full bg-zinc-950/50 border border-white/5 rounded-2xl p-6 text-white focus:outline-none focus:border-primary transition-all resize-none mb-6 min-h-[120px] font-light"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button type="button" className="p-3 text-zinc-600 hover:text-primary transition-all rounded-xl hover:bg-primary/5 border border-transparent hover:border-primary/20">
                          <ImageIcon className="w-5 h-5" />
                        </button>
                        <button type="button" className="p-3 text-zinc-600 hover:text-primary transition-all rounded-xl hover:bg-primary/5 border border-transparent hover:border-primary/20">
                          <Tag className="w-5 h-5" />
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting || !postContent.trim()}
                        className="btn-primary px-8"
                      >
                        {isSubmitting ? t('profile.posting') : (
                          <div className="flex items-center gap-2">
                            {t('profile.post')} <Send className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="space-y-8">
                {data.posts && data.posts.length > 0 ? (
                  data.posts.map((post: any) => (
                    <article key={post.id} className="glass-card overflow-hidden group">
                      <div className="p-8">
                        <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-zinc-600 mb-6">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(post.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap mb-8 font-light text-lg">{post.content}</p>
                        
                        {post.image_url && (
                          <div className="rounded-3xl overflow-hidden mb-8 border border-white/5 shadow-2xl">
                            <img src={post.image_url} alt="" className="w-full aspect-video object-cover grayscale group-hover:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
                          </div>
                        )}

                        {post.tagged_motorcycle_id && (
                          <div className="flex items-center gap-3 text-xs font-mono font-bold text-primary bg-primary/5 px-4 py-3 rounded-2xl border border-primary/10 w-fit uppercase tracking-widest">
                            <Bike className="w-4 h-4" />
                            <span>{post.year} {post.make} {post.model}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="px-8 py-6 border-t border-white/5 flex items-center gap-8 bg-zinc-950/30">
                        <button className="flex items-center gap-2 text-zinc-600 hover:text-primary transition-all group/btn">
                          <Heart className="w-5 h-5 group-hover/btn:fill-primary transition-all" />
                          <span className="text-xs font-mono font-bold tracking-widest">12</span>
                        </button>
                        <button className="flex items-center gap-2 text-zinc-600 hover:text-white transition-all">
                          <MessageSquare className="w-5 h-5" />
                          <span className="text-xs font-mono font-bold tracking-widest">3</span>
                        </button>
                        <button className="ml-auto text-zinc-600 hover:text-primary transition-all">
                          <Share2 className="w-5 h-5" />
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="text-center py-20 glass-card border-dashed border-white/5">
                    <MessageSquare className="w-10 h-10 text-zinc-800 mx-auto mb-4" />
                    <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">{t('profile.noUpdates')}</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <div className="glass-card p-8">
              <h3 className="font-display font-black uppercase italic tracking-tight text-xl mb-6">{t('profile.networkStats')}</h3>
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">{t('profile.connections')}</span>
                  <span className="font-display font-bold text-lg text-primary">142</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">{t('profile.joined')}</span>
                  <span className="font-mono font-bold text-xs uppercase tracking-widest text-zinc-300">
                    {new Date(data.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>

            {!isRider && (
              <div className="glass-card p-8">
                <h3 className="font-display font-black uppercase italic tracking-tight text-xl mb-6">{t('profile.contactInfo')}</h3>
                <div className="space-y-6">
                  <div className="flex items-center gap-4 text-xs font-mono uppercase tracking-widest">
                    <Phone className="w-4 h-4 text-zinc-600" />
                    <span className="text-zinc-400">+1 (555) 0123-4567</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono uppercase tracking-widest">
                    <Globe className="w-4 h-4 text-zinc-600" />
                    <a href="#" className="text-primary hover:text-oil transition-colors">www.{data.username}.com</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventCard({ event, onRSVP, onEdit, isOwner, currentUsername, hasRSVPd, t }: any) {
  return (
    <div className="glass-card p-6 flex items-center gap-6 group hover:border-primary/30 transition-all relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="w-20 h-20 bg-zinc-950 rounded-2xl flex flex-col items-center justify-center border border-white/5 shrink-0 group-hover:border-primary/30 transition-all shadow-xl relative z-10">
        <span className="text-primary text-[10px] font-mono font-black uppercase tracking-tighter mb-1">
          {new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
        </span>
        <span className="text-2xl font-display font-black leading-none italic">
          {new Date(event.date + 'T12:00:00').getDate()}
        </span>
      </div>
      <div className="flex-1 relative z-10">
        <Link to={`/events/${event.id}`} className="hover:text-primary transition-colors">
          <h3 className="font-display font-black uppercase italic text-xl mb-2 tracking-tight">{event.title}</h3>
        </Link>
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-zinc-700" />
            {event.time}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-3 h-3 text-zinc-700" />
            {event.location}
          </div>
          <div className="flex items-center gap-2 text-primary font-bold">
            <Plus className="w-3 h-3" />
            {event.rsvp_count || 0} RSVPs
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 relative z-10">
        {event.is_promoted === 1 && (
          <div className="badge-primary">
            {t('events.promoted')}
          </div>
        )}
        {isOwner && (
          <button 
            onClick={() => onEdit(event)}
            className="p-3 text-zinc-600 hover:text-primary transition-all rounded-xl hover:bg-primary/5 border border-transparent hover:border-primary/20"
            title={t('event.modal.editTitle')}
          >
            <Wrench className="w-4 h-4" />
          </button>
        )}
        {currentUsername && (
          <button 
            onClick={() => onRSVP(event.id)}
            className={`px-6 py-2 text-xs font-display font-bold uppercase italic tracking-widest rounded-full border transition-all ${
              hasRSVPd 
                ? 'bg-primary text-zinc-950 border-primary hover:bg-oil' 
                : 'bg-white/5 text-white border-white/10 hover:bg-white/10'
            }`}
          >
            {hasRSVPd ? t('events.attending') : t('events.rsvp')}
          </button>
        )}
      </div>
    </div>
  );
}
