import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Calendar, MapPin, Clock, Users, ArrowLeft, Star, ShieldCheck, Share2, Upload, Check, X, Image as ImageIcon, Wrench } from 'lucide-react';
import { motion } from 'motion/react';
import { useLanguage } from '../contexts/LanguageContext';

export default function EventDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editEventData, setEditEventData] = useState<any>({});
  const { t } = useLanguage();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      console.log('currentUser:', user);
    }
  }, []);

  const fetchEvent = async () => {
    try {
      const storedUser = localStorage.getItem('user');
      let username = '';
      if (storedUser) {
        username = JSON.parse(storedUser).username;
      }
      const res = await fetch(`/api/events/${id}?username=${username}`);
      if (!res.ok) throw new Error('Event not found');
      const data = await res.json();
      console.log('event:', data);
      setEvent(data);
      
      // Fetch photos
      const photosRes = await fetch(`/api/events/${id}/photos`);
      setPhotos(await photosRes.json());
      
      const user = storedUser ? JSON.parse(storedUser) : null;
      if (user?.role === 'admin' || user?.id === data.user_id) {
        const pendingRes = await fetch(`/api/events/${id}/pending-photos`);
        setPendingPhotos(await pendingRes.json());
      }
    } catch (err) {
      console.error(err);
      navigate('/events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvent();
  }, [id]);

  const handleEditEvent = () => {
    setEditEventData({
      title: event.title,
      description: event.description,
      date: event.date,
      time: event.time,
      location: event.location,
      image_url: event.image_url
    });
    setIsEditing(true);
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          ...editEventData
        }),
      });

      if (res.ok) {
        setIsEditing(false);
        fetchEvent();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadPhoto = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const storedUser = localStorage.getItem('user');
    const user = storedUser ? JSON.parse(storedUser) : currentUser;
    if (!user) {
      alert('Please login to upload photos');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);
    formData.append('userId', user.id);
    
    await fetch(`/api/events/${id}/photos`, {
      method: 'POST',
      body: formData,
    });
    alert('Photo uploaded for approval');
    fetchEvent(); // Refresh to show the new photo if approved, or just to update state
  };

  const handlePhotoStatus = async (photoId: number, status: string) => {
    await fetch(`/api/events/photos/${photoId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchEvent();
  };

  const handleRSVP = async () => {
    if (!currentUser) {
      alert('Please login to RSVP');
      return;
    }
    try {
      const res = await fetch(`/api/events/${id}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username }),
      });
      if (res.ok) {
        fetchEvent();
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

  if (!event) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <Link to="/events" className="inline-flex items-center gap-2 text-zinc-600 hover:text-primary transition-all mb-10 font-mono text-[10px] uppercase tracking-widest font-black">
        <ArrowLeft className="w-4 h-4" />
        {t('eventDetails.back')}
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden shadow-2xl border-white/5"
      >
        <div className="aspect-[21/9] w-full relative">
          <img 
            src={event.image_url} 
            alt={event.title} 
            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
          
          {event.is_promoted === 1 && (
            <div className="absolute top-8 right-8 badge-primary px-6 py-3 shadow-2xl">
              <Star className="w-4 h-4 fill-current" />
              {t('events.promoted')}
            </div>
          )}
        </div>

        <div className="p-8 sm:p-16">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-16 mb-16">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-[10px] font-mono font-black text-primary uppercase tracking-[0.2em] px-4 py-1.5 rounded-full bg-primary/5 border border-primary/20">
                  {event.service_category || 'Community Event'}
                </span>
                <span className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
                  Posted {new Date(event.created_at).toLocaleDateString()}
                </span>
              </div>
              <h1 className="text-5xl sm:text-7xl font-display font-black uppercase italic tracking-tighter mb-10 leading-[0.85] text-white">
                {event.title}
              </h1>
              
              <div className="grid sm:grid-cols-2 gap-8">
                <div className="flex items-center gap-5 group">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-white/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                    <Calendar className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-widest mb-1">{t('eventDetails.date')}</div>
                    <div className="font-display font-black uppercase italic text-lg tracking-tight">{new Date(event.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5 group">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-white/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                    <Clock className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-widest mb-1">{t('eventDetails.time')}</div>
                    <div className="font-display font-black uppercase italic text-lg tracking-tight">{event.time}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5 group">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-white/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                    <MapPin className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-widest mb-1">{t('eventDetails.location')}</div>
                    <div className="font-display font-black uppercase italic text-lg tracking-tight">{event.location}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5 group">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-white/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                    <Users className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-widest mb-1">{t('eventDetails.attendance')}</div>
                    <div className="font-display font-black uppercase italic text-lg tracking-tight">{event.rsvp_count || 0} {t('eventDetails.riders')}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:w-80 shrink-0">
              <div className="glass-card p-8 shadow-2xl border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <button 
                  onClick={handleRSVP}
                  className={`w-full py-5 rounded-2xl font-display font-black uppercase italic text-xl tracking-widest transition-all mb-6 relative z-10 ${
                    event.has_rsvpd 
                      ? 'bg-primary text-zinc-950 hover:bg-oil shadow-xl shadow-primary/20' 
                      : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {event.has_rsvpd ? t('events.attending') : t('events.rsvp')}
                </button>
                
                { (() => {
                  const storedUser = localStorage.getItem('user');
                  const user = storedUser ? JSON.parse(storedUser) : currentUser;
                  const isOwner = user?.id === event.user_id;
                  const isAdmin = user?.role === 'admin';
                  console.log('Checking Edit button visibility:');
                  console.log('user:', user);
                  console.log('event:', event);
                  console.log('isOwner:', isOwner, 'isAdmin:', isAdmin);
                  
                  if (isOwner || isAdmin) {
                    return (
                      <button onClick={handleEditEvent} className="w-full py-4 rounded-2xl font-mono font-black text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 relative z-10 border border-transparent hover:border-primary/20 mb-4">
                        <Wrench className="w-4 h-4" />
                        Edit Event
                      </button>
                    );
                  }
                  return null;
                })()}

                <button className="w-full py-4 rounded-2xl font-mono font-black text-[10px] uppercase tracking-[0.2em] text-zinc-500 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 relative z-10 border border-transparent hover:border-primary/20">
                  <Share2 className="w-4 h-4" />
                  {t('profile.share')}
                </button>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-20 pt-16 border-t border-white/5">
            <div className="lg:col-span-2">
              <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-8 text-primary">{t('eventDetails.about')}</h2>
              <div className="prose prose-invert max-w-none text-zinc-400 leading-relaxed whitespace-pre-wrap font-light text-lg">
                {event.description}
              </div>
            </div>
            
            <div>
              <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-8 text-primary">{t('eventDetails.hostedBy')}</h2>
              <Link 
                to={`/profile/${event.username}`}
                className="group flex items-center gap-6 glass-card p-6 border-white/5 hover:border-primary/30 transition-all shadow-xl relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <img 
                  src={event.profile_picture_url} 
                  alt={event.username} 
                  className="w-20 h-20 rounded-2xl object-cover shadow-2xl grayscale group-hover:grayscale-0 transition-all relative z-10"
                  referrerPolicy="no-referrer"
                />
                <div className="relative z-10">
                  <div className="text-xl font-display font-black uppercase italic tracking-tight text-white group-hover:text-primary transition-colors leading-none mb-2">
                    {event.company_name || event.username}
                  </div>
                  <div className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-widest mb-3">@{event.username}</div>
                  <div className="text-[10px] font-mono font-black text-primary uppercase tracking-[0.2em]">{t('event.details.viewProfile')}</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Gallery Section */}
          <div className="pt-16 border-t border-white/5">
            <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-8 text-primary">Event Gallery</h2>
            
            {currentUser && (event.has_rsvpd || currentUser.role === 'admin' || currentUser.id === event.user_id) && (
              <div className="mb-8">
                <label className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-zinc-950 rounded-2xl font-display font-black uppercase italic tracking-widest cursor-pointer hover:bg-oil transition-all">
                  <Upload className="w-5 h-5" />
                  Upload Photo
                  <input type="file" className="hidden" accept="image/*" onChange={handleUploadPhoto} />
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {photos.map((photo: any) => (
                <img key={photo.id} src={photo.image_url} alt="Event" className="w-full aspect-square object-cover rounded-2xl border border-white/5" referrerPolicy="no-referrer" />
              ))}
            </div>

            {(currentUser?.role === 'admin' || currentUser?.id === event.user_id) && pendingPhotos.length > 0 && (
              <div className="mt-16">
                <h3 className="text-xl font-display font-black uppercase italic tracking-tighter mb-8 text-zinc-500">Pending Approval</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {pendingPhotos.map((photo: any) => (
                    <div key={photo.id} className="relative group">
                      <img src={photo.image_url} alt="Pending" className="w-full aspect-square object-cover rounded-2xl border border-white/5" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl z-10">
                        <button onClick={() => handlePhotoStatus(photo.id, 'approved')} className="p-3 bg-emerald-500 rounded-full text-white"><Check className="w-6 h-6" /></button>
                        <button onClick={() => handlePhotoStatus(photo.id, 'rejected')} className="p-3 bg-red-500 rounded-full text-white"><X className="w-6 h-6" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {isEditing && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="glass-card p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-8 text-primary">Edit Event</h2>
            <form onSubmit={handleUpdateEvent} className="space-y-6">
              <input type="text" value={editEventData.title} onChange={e => setEditEventData({...editEventData, title: e.target.value})} className="input-field" placeholder="Title" required />
              <input type="date" value={editEventData.date} onChange={e => setEditEventData({...editEventData, date: e.target.value})} className="input-field" required />
              <input type="text" value={editEventData.time} onChange={e => setEditEventData({...editEventData, time: e.target.value})} className="input-field" placeholder="Time" />
              <input type="text" value={editEventData.location} onChange={e => setEditEventData({...editEventData, location: e.target.value})} className="input-field" placeholder="Location" />
              <textarea value={editEventData.description} onChange={e => setEditEventData({...editEventData, description: e.target.value})} className="input-field" placeholder="Description" rows={4} />
              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">Save Changes</button>
                <button type="button" onClick={() => setIsEditing(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
