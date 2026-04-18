import { fetchWithAuth } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Calendar, MapPin, Clock, Users, ArrowLeft, Star, ShieldCheck, Share2, Upload, Check, X, Image as ImageIcon, Wrench, Copy, Send, Plus, Search, Trophy, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { useNotification } from '../contexts/NotificationContext';
import EventAttendanceModal from '../components/EventAttendanceModal';
import EventTicketModal from '../components/EventTicketModal';
import PremiumBadge from '../components/PremiumBadge';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { QrCode, ClipboardList } from 'lucide-react';

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
  const [stamps, setStamps] = useState<any[]>([]);
  const [stampSearchTerm, setStampSearchTerm] = useState('');
  const [isStampSelectorOpen, setIsStampSelectorOpen] = useState(false);
  const editFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingEdit, setIsUploadingEdit] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

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
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareContent, setShareContent] = useState('');
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [contestSettings, setContestSettings] = useState({ enabled: false, allowedTypes: ['premium'] });
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const { canAccess } = useFeatureAccess();

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
      const res = await fetchWithAuth(`/api/events/${id}?username=${username}`);
      if (!res.ok) throw new Error('Event not found');
      const data = await res.json();
      console.log('event:', data);
      setEvent(data);
      
      // Fetch photos
      const photosRes = await fetchWithAuth(`/api/events/${id}/photos`);
      if (photosRes.ok) {
        const photosData = await photosRes.json();
        console.log('Approved photos:', photosData);
        setPhotos(Array.isArray(photosData) ? photosData : []);
      }
      
      const user = storedUser ? JSON.parse(storedUser) : null;
      if (user) {
        const pendingRes = await fetchWithAuth(`/api/events/${id}/pending-photos`);
        if (pendingRes.ok) {
          setPendingPhotos(await pendingRes.json());
        }
      }
    } catch (err) {
      console.error(err);
      navigate('/events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleAuthChange = () => {
      const storedUser = localStorage.getItem('user');
      setCurrentUser(storedUser ? JSON.parse(storedUser) : null);
    };
    window.addEventListener('auth-change', handleAuthChange);
    
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }

    fetchEvent();
    const fetchContestSettings = async () => {
      try {
        const res = await fetchWithAuth('/api/admin/photo-contest-settings');
        if (res.ok) {
          const settings = await res.json();
          console.log('Contest settings:', settings);
          setContestSettings(settings);
        }
      } catch (err) {
        console.error('Failed to fetch contest settings', err);
      }
    };
    fetchContestSettings();

    return () => window.removeEventListener('auth-change', handleAuthChange);
  }, [id]);

  useEffect(() => {
    console.log('Photos state updated:', photos);
  }, [photos]);

  useEffect(() => {
    console.log('Pending photos state updated:', pendingPhotos);
  }, [pendingPhotos]);

  const handleEditEvent = () => {
    setEditEventData({
      title: event.title,
      description: event.description,
      date: event.date,
      time: event.time,
      location: event.location,
      image_url: event.image_url,
      category: event.category || 'road_trip',
      participation_stamp_id: event.participation_stamp_id
    });
    setIsEditing(true);
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth(`/api/events/${id}`, {
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

  const processFiles = async (files: FileList | File[]) => {
    const storedUser = localStorage.getItem('user');
    const user = storedUser ? JSON.parse(storedUser) : currentUser;
    if (!user) {
      showNotification('error', t('event.details.loginToUpload'));
      return;
    }

    if (files.length === 0) return;

    setIsUploading(true);
    let uploadedCount = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        
        const formData = new FormData();
        formData.append('image', file);
        formData.append('userId', user.id);
        
        const res = await fetchWithAuth(`/api/events/${id}/photos`, {
          method: 'POST',
          body: formData,
        });
        
        if (res.ok) {
          uploadedCount++;
        }
      }
      if (uploadedCount > 0) {
        showNotification('success', t('event.details.uploadSuccess'));
        fetchEvent();
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('event.details.uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handlePromotePhoto = async (photoId: number) => {
    if (!canAccess('promote_contest', currentUser?.plan, currentUser?.role)) {
      showNotification(t('admin.featureAccess.allowedPlan'), 'error');
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/events/photos/${photoId}/promote`, { method: 'POST' });
      if (res.ok) {
        showNotification('success', 'Photo promoted to contest');
      } else {
        const data = await res.json();
        showNotification('error', data.error || 'Failed to promote photo');
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'Failed to promote photo');
    }
  };

  const handleDeletePhoto = async (photoId: number) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      const res = await fetchWithAuth(`/api/events/photos/${photoId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPhotos(photos.filter(p => p.id !== photoId));
        setPendingPhotos(pendingPhotos.filter(p => p.id !== photoId));
        showNotification('success', t('common.deleted'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('common.error'));
    }
  };

  const handleUploadPhoto = async (e: any) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handlePhotoStatus = async (photoId: number, status: 'approved' | 'rejected') => {
    try {
      const res = await fetchWithAuth(`/api/events/photos/${photoId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setPendingPhotos(pendingPhotos.filter(p => p.id !== photoId));
        if (status === 'approved') {
          const approvedPhoto = pendingPhotos.find(p => p.id === photoId);
          if (approvedPhoto) setPhotos([...photos, { ...approvedPhoto, status: 'approved' }]);
        }
        showNotification('success', status === 'approved' ? t('event.details.photosApproved') : t('event.details.photosRejected'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('common.error'));
    }
  };

  const handleApproveAll = async () => {
    if (pendingPhotos.length === 0) return;
    try {
      const res = await fetchWithAuth('/api/events/photos/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          photoIds: pendingPhotos.map(p => p.id),
          status: 'approved' 
        }),
      });
      if (res.ok) {
        setPhotos([...photos, ...pendingPhotos.map(p => ({ ...p, status: 'approved' }))]);
        setPendingPhotos([]);
        showNotification('success', t('event.details.photosApproved'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('common.error'));
    }
  };

  const handleRejectAll = async () => {
    if (pendingPhotos.length === 0) return;
    try {
      const res = await fetchWithAuth('/api/events/photos/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          photoIds: pendingPhotos.map(p => p.id),
          status: 'rejected' 
        }),
      });
      if (res.ok) {
        setPendingPhotos([]);
        showNotification('success', t('event.details.photosRejected'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('common.error'));
    }
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploadingEdit(true);
    try {
      const res = await fetchWithAuth('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setEditEventData({ ...editEventData, image_url: data.url });
      }
    } catch (err) {
      console.error('Upload failed', err);
      showNotification('error', t('common.error'));
    } finally {
      setIsUploadingEdit(false);
    }
  };

  const handleRSVP = async () => {
    if (!currentUser) {
      showNotification('error', t('events.loginToRSVP'));
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/events/${id}/rsvp`, {
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
      <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!event) return null;

  const locale = t('locale');

  return (
    <div className="min-h-[calc(100dvh-5rem)] py-12 pb-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <Link to="/events" className="inline-flex items-center gap-2 text-steel hover:text-primary transition-all mb-10 font-mono text-[10px] uppercase tracking-widest font-black">
        <ArrowLeft className="w-4 h-4" />
        {t('eventDetails.back')}
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden shadow-2xl border-inverse/5"
      >
        <div className="aspect-[21/9] w-full relative">
          <img 
            src={event.image_url} 
            alt={event.title} 
            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-asphalt/20 to-transparent" />
          
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
                  {event.service_category ? t(`category.${event.service_category}`) : t('event.details.communityEvent')}
                </span>
                <span className="text-steel text-[10px] font-mono uppercase tracking-widest">
                  {t('event.details.posted')} {new Date(event.created_at).toLocaleDateString(locale)}
                </span>
              </div>
              <h1 className="text-5xl sm:text-7xl font-display font-black uppercase italic tracking-tighter mb-10 leading-[0.85] text-chrome">
                {event.title}
              </h1>
              
              <div className="grid sm:grid-cols-2 gap-8">
                <div className="flex items-center gap-5 group">
                  <div className="w-14 h-14 rounded-2xl bg-engine border border-inverse/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                    <Calendar className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest mb-1">{t('eventDetails.date')}</div>
                    <div className="font-display font-black uppercase italic text-lg tracking-tight">{new Date(event.date + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5 group">
                  <div className="w-14 h-14 rounded-2xl bg-engine border border-inverse/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                    <Star className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest mb-1">{t('event.field.category')}</div>
                    <div className="font-display font-black uppercase italic text-lg tracking-tight">{t(`events.category.${event.category || 'road_trip'}`)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5 group">
                  <div className="w-14 h-14 rounded-2xl bg-engine border border-inverse/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                    <Clock className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest mb-1">{t('eventDetails.time')}</div>
                    <div className="font-display font-black uppercase italic text-lg tracking-tight">{event.time}</div>
                  </div>
                </div>
                <div className="flex items-center gap-5 group">
                  <div className="w-14 h-14 rounded-2xl bg-engine border border-inverse/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                    <MapPin className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest mb-1">{t('eventDetails.location')}</div>
                    <div className="font-display font-black uppercase italic text-lg tracking-tight">{event.location}</div>
                  </div>
                </div>
                {event.rsvp_count > 0 && (
                  <div className="flex items-center gap-5 group">
                    <div className="w-14 h-14 rounded-2xl bg-engine border border-inverse/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl shadow-primary/5">
                      <Users className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest mb-1">{t('eventDetails.attendance')}</div>
                      <div className="font-display font-black uppercase italic text-lg tracking-tight text-chrome group-hover:text-primary transition-colors">{event.rsvp_count} {t('eventDetails.riders')}</div>
                    </div>
                  </div>
                )}
                {event.participation_badge_name && (
                  <div className="flex items-center gap-5 group">
                    <div className="w-14 h-14 rounded-2xl bg-engine border border-inverse/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                      <ShieldCheck className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest mb-1">{t('event.field.participationBadge')}</div>
                      <div className="font-display font-black uppercase italic text-lg tracking-tight text-primary">{event.participation_badge_name}</div>
                    </div>
                  </div>
                )}
                {event.stamp_name && (
                  <div className="flex items-center gap-5 group">
                    <div className="w-14 h-14 rounded-2xl bg-engine border border-inverse/5 flex items-center justify-center text-primary group-hover:border-primary/30 transition-all shadow-xl">
                      <ShieldCheck className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest mb-1">{t('event.field.participationStamp')}</div>
                      <div className="font-display font-black uppercase italic text-lg tracking-tight text-primary">{event.stamp_name}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:w-80 shrink-0">
              <div className="glass-card p-8 shadow-2xl border-inverse/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <button 
                  onClick={handleRSVP}
                  className={`w-full py-5 rounded-2xl font-display font-black uppercase italic text-xl tracking-widest transition-all mb-4 relative z-10 ${
                    event.has_rsvpd 
                      ? 'bg-primary text-inverse hover:bg-oil shadow-xl shadow-primary/20' 
                      : 'bg-inverse/5 text-chrome border border-inverse/10 hover:bg-inverse/10'
                  }`}
                >
                  {event.has_rsvpd ? t('events.attending') : t('events.rsvp')}
                </button>

                {event.has_rsvpd && (
                  <button 
                    onClick={() => setIsTicketModalOpen(true)}
                    className="w-full py-4 rounded-2xl font-mono font-black text-[10px] uppercase tracking-[0.2em] text-chrome bg-inverse/5 hover:bg-inverse/10 border border-inverse/10 transition-all flex items-center justify-center gap-3 relative z-10 mb-6"
                  >
                    <QrCode className="w-4 h-4" />
                    {t('event.details.showTicket')}
                  </button>
                )}
                
                { (() => {
                  const storedUser = localStorage.getItem('user');
                  const user = storedUser ? JSON.parse(storedUser) : currentUser;
                  const isOwner = user?.id === event.user_id;
                  const isAdmin = user?.role === 'admin';
                  
                  if (isOwner || isAdmin) {
                    return (
                      <>
                        <button onClick={() => setIsAttendanceModalOpen(true)} className="w-full py-4 rounded-2xl font-mono font-black text-[10px] uppercase tracking-[0.2em] text-steel hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 relative z-10 border border-transparent hover:border-primary/20 mb-2">
                          <ClipboardList className="w-4 h-4" />
                          {t('event.details.manageAttendance')}
                        </button>
                        <button onClick={handleEditEvent} className="w-full py-4 rounded-2xl font-mono font-black text-[10px] uppercase tracking-[0.2em] text-steel hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 relative z-10 border border-transparent hover:border-primary/20 mb-4">
                          <Wrench className="w-4 h-4" />
                          {t('event.details.editEvent')}
                        </button>
                      </>
                    );
                  }
                  return null;
                })()}

                <button 
                  onClick={() => setIsShareModalOpen(true)}
                  className="w-full py-4 rounded-2xl font-mono font-black text-[10px] uppercase tracking-[0.2em] text-steel hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 relative z-10 border border-transparent hover:border-primary/20">
                  <Share2 className="w-4 h-4" />
                  {t('profile.share')}
                </button>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-20 pt-16 border-t border-inverse/5">
            <div className="lg:col-span-2">
              <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-8 text-primary">{t('eventDetails.about')}</h2>
              <div className="prose prose-invert max-w-none text-steel leading-relaxed whitespace-pre-wrap font-light text-lg">
                {event.description}
              </div>
            </div>
            
            <div>
              <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-8 text-primary">{t('eventDetails.hostedBy')}</h2>
              <Link 
                to={`/profile/${event.username}`}
                className="group flex items-center gap-6 glass-card p-6 border-inverse/5 hover:border-primary/30 transition-all shadow-xl relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <img 
                  src={event.profile_picture_url} 
                  alt={event.username} 
                  className="w-20 h-20 rounded-2xl object-cover shadow-2xl grayscale group-hover:grayscale-0 transition-all relative z-10"
                  referrerPolicy="no-referrer"
                />
                <div className="relative z-10">
                  <div className="text-xl font-display font-black uppercase italic tracking-tight text-chrome group-hover:text-primary transition-colors leading-none mb-2 flex items-center gap-1.5">
                    {event.company_name || event.username}
                    {event.plan === 'premium' && <PremiumBadge size={12} />}
                  </div>
                  <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest mb-3">@{event.username}</div>
                  <div className="text-[10px] font-mono font-black text-primary uppercase tracking-[0.2em]">{t('event.details.viewProfile')}</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Gallery Section */}
          <div className="pt-16 border-t border-inverse/5">
            <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-8 text-primary">{t('event.details.gallery')}</h2>
            
            {currentUser && (event.has_rsvpd || currentUser.role === 'admin' || currentUser.id === event.user_id) && (
              <div 
                className={`mb-8 border-2 border-dashed rounded-2xl p-8 text-center transition-all ${isDragging ? 'border-primary bg-primary/10' : 'border-inverse/20 hover:border-primary/50'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-primary' : 'text-steel'}`} />
                <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-chrome mb-2">
                  {isUploading ? t('event.details.uploading') : t('event.details.dropPhotos')}
                </h3>
                <p className="text-sm font-mono text-steel mb-6">{t('event.details.orClickToBrowse')}</p>
                <label className={`inline-flex items-center gap-2 px-6 py-3 bg-primary text-inverse rounded-2xl font-display font-black uppercase italic tracking-widest cursor-pointer hover:bg-oil transition-all ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Upload className="w-5 h-5" />
                  {t('event.details.uploadPhoto')}
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleUploadPhoto} disabled={isUploading} />
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {photos.map((photo: any) => (
                <div key={photo.id} className="relative group cursor-zoom-in" onClick={() => setSelectedPhoto(photo.image_url)}>
                  <img src={photo.image_url} alt="Event" className="w-full aspect-square object-cover rounded-2xl border border-inverse/5 transition-all group-hover:scale-[1.02]" referrerPolicy="no-referrer" />
                  <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {contestSettings.enabled && (
                      <button 
                        onClick={() => handlePromotePhoto(photo.id)}
                        className="p-2 bg-primary text-white rounded-full hover:bg-inverse hover:text-primary transition-colors"
                        title={t('event.details.promoteToContest')}
                      >
                        <Trophy className="w-4 h-4" />
                      </button>
                    )}
                    {(currentUser?.role === 'admin' || Number(currentUser?.id) === Number(photo.user_id) || Number(currentUser?.id) === Number(event.user_id)) && (
                      <button 
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="p-2 bg-error text-chrome rounded-full hover:bg-error transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {pendingPhotos.length > 0 && (
              <div className="mt-16">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <h3 className="text-xl font-display font-black uppercase italic tracking-tighter text-steel">{t('event.details.pendingApproval')}</h3>
                  {(currentUser?.role === 'admin' || Number(currentUser?.id) === Number(event.user_id)) && (
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={handleApproveAll}
                        className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-xl font-mono text-[10px] font-black uppercase tracking-widest border border-success/20 hover:bg-success hover:text-chrome transition-all"
                      >
                        <Check className="w-4 h-4" />
                        {t('event.details.approveAll')}
                      </button>
                      <button 
                        onClick={handleRejectAll}
                        className="flex items-center gap-2 px-4 py-2 bg-error/10 text-error rounded-xl font-mono text-[10px] font-black uppercase tracking-widest border border-error/20 hover:bg-error hover:text-chrome transition-all"
                      >
                        <X className="w-4 h-4" />
                        {t('event.details.rejectAll')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {pendingPhotos.map((photo: any) => (
                    <div key={photo.id} className="relative group overflow-hidden rounded-2xl border border-inverse/5 bg-engine/50">
                      <img src={photo.image_url} alt="Pending" className="w-full aspect-square object-cover opacity-50 grayscale" referrerPolicy="no-referrer" />
                      
                      {/* Pending Badge */}
                      <div className="absolute top-3 left-3 z-10">
                        <span className="bg-engine/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-[7px] font-mono font-black uppercase tracking-[0.2em] text-primary border border-primary/20 shadow-xl">
                          {t('event.details.pending')}
                        </span>
                      </div>

                      {/* Moderation Actions */}
                      {(currentUser?.role === 'admin' || Number(currentUser?.id) === Number(event.user_id)) && (
                        <div className="absolute inset-0 bg-engine/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-3 z-20">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handlePhotoStatus(photo.id, 'approved')} 
                              className="p-3 bg-success text-chrome rounded-full hover:scale-110 hover:bg-success transition-all shadow-lg group/btn"
                              title={t('event.details.approve')}
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handlePhotoStatus(photo.id, 'rejected')} 
                              className="p-3 bg-error text-chrome rounded-full hover:scale-110 hover:bg-error transition-all shadow-lg group/btn"
                              title={t('event.details.reject')}
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <span className="text-[8px] font-mono font-black uppercase tracking-widest text-chrome/70">{t('admin.table.actions')}</span>
                        </div>
                      )}

                      {/* Owner Delete Action */}
                      {(Number(currentUser?.id) === Number(photo.user_id)) && (
                        <button 
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="absolute top-3 right-3 p-2 bg-error/20 text-error hover:bg-error hover:text-chrome rounded-lg backdrop-blur-md border border-error/20 transition-all z-30 opacity-0 group-hover:opacity-100"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {isEditing && (
        <div className="fixed inset-0 bg-engine/80 z-50 flex items-center justify-center p-4">
          <div className="glass-card p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-8 text-primary">{t('event.details.editEvent')}</h2>
            <form onSubmit={handleUpdateEvent} className="space-y-6">
              <input type="text" autoCapitalize="sentences" value={editEventData.title || ''} onChange={e => setEditEventData({...editEventData, title: e.target.value})} className="input-field" placeholder={t('event.field.title')} required />
              <select
                required
                value={editEventData.category || 'road_trip'}
                onChange={(e) => setEditEventData({...editEventData, category: e.target.value})}
                className="input-field appearance-none"
              >
                <option value="road_trip">{t('events.category.road_trip')}</option>
                <option value="club_meetup">{t('events.category.club_meetup')}</option>
                <option value="shop_event">{t('events.category.shop_event')}</option>
                <option value="track_day">{t('events.category.track_day')}</option>
                <option value="other">{t('events.category.other')}</option>
              </select>
              <input type="date" value={editEventData.date || ''} onChange={e => setEditEventData({...editEventData, date: e.target.value})} className="input-field" required />
              <input type="text" autoCapitalize="sentences" value={editEventData.time || ''} onChange={e => setEditEventData({...editEventData, time: e.target.value})} className="input-field" placeholder={t('event.field.time')} />
              <LocationAutocomplete
                value={editEventData.location}
                onChange={(value) => setEditEventData({...editEventData, location: value})}
                placeholder={t('event.field.location')}
              />
              
              <div className="space-y-4">
                <label className="text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('event.field.coverImage')}</label>
                <div className="flex items-center gap-6">
                  <div 
                    onClick={() => editFileInputRef.current?.click()}
                    className="w-28 h-28 rounded-3xl bg-engine border border-inverse/10 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all overflow-hidden relative group shadow-xl"
                  >
                    {editEventData.image_url ? (
                      <>
                        <img src={editEventData.image_url} alt="Event" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
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
                    {isUploadingEdit && (
                      <div className="absolute inset-0 bg-engine/90 flex items-center justify-center">
                        <Clock className="w-6 h-6 text-primary animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-steel mb-3 leading-relaxed">{t('event.upload.coverDesc')}</p>
                    <input 
                      type="file" 
                      ref={editFileInputRef}
                      onChange={handleEditImageUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    {editEventData.image_url && (
                      <button 
                        type="button"
                        onClick={() => setEditEventData(prev => ({ ...prev, image_url: '' }))}
                        className="text-[10px] font-mono font-black text-accent uppercase tracking-widest hover:text-error transition-colors"
                      >
                        {t('event.field.remove')}
                      </button>
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
                      {editEventData.participation_stamp_id ? (
                        <>
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4 text-primary" />
                          </div>
                          <span className="text-chrome">
                            {stamps.find(s => s.id === editEventData.participation_stamp_id)?.name}
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
                              setEditEventData({ ...editEventData, participation_stamp_id: null });
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
                                  setEditEventData({ ...editEventData, participation_stamp_id: stamp.id });
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
              <textarea autoCapitalize="sentences" value={editEventData.description || ''} onChange={e => setEditEventData({...editEventData, description: e.target.value})} className="input-field" placeholder={t('event.field.description')} rows={4} />
              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">{t('common.save')}</button>
                <button type="button" onClick={() => setIsEditing(false)} className="btn-secondary flex-1">{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isShareModalOpen && (
        <div className="fixed inset-0 bg-engine/80 z-50 flex items-center justify-center p-4">
          <div className="glass-card p-8 max-w-md w-full relative">
            <button onClick={() => setIsShareModalOpen(false)} className="absolute top-4 right-4 text-steel hover:text-chrome">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-display font-black uppercase italic tracking-tighter mb-6 text-primary">{t('event.share.title')}</h2>
            
            <div className="space-y-4">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  showNotification('success', t('event.share.copySuccess'));
                  setIsShareModalOpen(false);
                }}
                className="w-full py-4 rounded-2xl font-mono font-black text-[10px] uppercase tracking-[0.2em] text-chrome bg-inverse/5 hover:bg-inverse/10 transition-all flex items-center justify-center gap-3 border border-inverse/10"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('event.share.copyLink')}
              </button>

              <div className="relative flex items-center py-4">
                <div className="flex-grow border-t border-inverse/10"></div>
                <span className="flex-shrink-0 mx-4 text-steel text-xs font-mono uppercase">{t('event.share.orShareToFeed')}</span>
                <div className="flex-grow border-t border-inverse/10"></div>
              </div>

              {/* Event Preview Card */}
              <div className="p-4 rounded-3xl border border-inverse/10 bg-oil/50 overflow-hidden relative mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden">
                    <img src={event.image_url} alt={event.title} className="w-full h-full object-cover grayscale" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[8px] font-mono font-black text-primary uppercase tracking-[0.2em] mb-1">{t('event.share.preview')}</div>
                    <h4 className="text-sm font-display font-black uppercase italic tracking-tight text-chrome truncate">{event.title}</h4>
                    <div className="text-[10px] text-steel font-mono uppercase truncate">{event.location}</div>
                  </div>
                </div>
              </div>

              <textarea 
                value={shareContent || ''}
                onChange={(e) => setShareContent(e.target.value)}
                placeholder={t('event.share.placeholder')}
                className="w-full bg-engine/50 border border-inverse/10 rounded-2xl p-4 text-chrome placeholder:text-steel focus:outline-none focus:border-primary/50 transition-colors resize-none h-24 mb-6"
              />
              
              <button 
                onClick={async () => {
                  if (!currentUser) {
                    showNotification('error', t('event.share.loginToShare'));
                    return;
                  }
                  try {
                    const res = await fetchWithAuth('/api/posts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        username: currentUser.username,
                        content: shareContent || "",
                        privacy_level: 'public',
                        shared_event_id: Number(event.id)
                      }),
                    });
                    if (res.ok) {
                      showNotification('success', t('event.share.success'));
                      setIsShareModalOpen(false);
                      setShareContent('');
                    } else {
                      const errorData = await res.json();
                      showNotification('error', `${t('event.share.failed')}: ${errorData.error || 'Unknown error'}`);
                    }
                  } catch (err) {
                    console.error(err);
                    showNotification('error', t('event.share.failed'));
                  }
                }}
                className="w-full py-4 rounded-2xl font-mono font-black text-[10px] uppercase tracking-[0.2em] text-inverse bg-primary hover:bg-oil transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20"
              >
                <Send className="w-4 h-4" />
                {t('event.share.toMotorFeed')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAttendanceModalOpen && (
        <EventAttendanceModal 
          eventId={id!} 
          eventName={event.title} 
          eventDate={event.date}
          hostName={event.company_name || event.username}
          participationStampName={event.stamp_name}
          onClose={() => setIsAttendanceModalOpen(false)} 
        />
      )}

      {isTicketModalOpen && currentUser && (
        <EventTicketModal 
          eventId={id!} 
          eventName={event.title} 
          userId={currentUser.id} 
          participationStampName={event.stamp_name}
          onClose={() => setIsTicketModalOpen(false)} 
        />
      )}

      <AnimatePresence>
        {selectedPhoto && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedPhoto(null)}
            className="fixed inset-0 bg-engine/95 z-[100] flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-7xl w-full max-h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={selectedPhoto} 
                alt="Expanded view" 
                className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl border border-inverse/10"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-4 right-4 p-2 bg-engine/50 hover:bg-primary text-inverse rounded-full backdrop-blur-md border border-inverse/10 transition-all shadow-2xl group"
                title={t('common.close')}
              >
                <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
