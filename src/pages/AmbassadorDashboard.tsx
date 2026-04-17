import { fetchWithAuth } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, QrCode, MapPin, Award, Users, Star, Plus, CheckCircle, Calendar, Globe, Image as ImageIcon, Link as LinkIcon, Info } from 'lucide-react';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { useNotification } from '../contexts/NotificationContext';
import { useLanguage } from '../contexts/LanguageContext';
import PremiumBadge from '../components/PremiumBadge';
import { useNavigate } from 'react-router-dom';

export default function AmbassadorDashboard() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const { canAccess } = useFeatureAccess();
  const [user, setUser] = useState<any>(null);
  const [ambassador, setAmbassador] = useState<any>(null);
  const [stamps, setStamps] = useState<any[]>([]);
  const [showCreateStamp, setShowCreateStamp] = useState(false);
  const [newStamp, setNewStamp] = useState({ name: '', description: '', type: 'location', icon: 'MapPin', rarity: 'common' });
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [selectedStamp, setSelectedStamp] = useState<any>(null);

  const [showCreateCheckpoint, setShowCreateCheckpoint] = useState(false);
  const [routes, setRoutes] = useState<any[]>([]);
  const [newCheckpoint, setNewCheckpoint] = useState({ route_id: '', type: 'start' });
  const [checkpointQrUrl, setCheckpointQrUrl] = useState<string | null>(null);

  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ 
    title: '', 
    description: '', 
    date: '', 
    time: '', 
    location: '',
    participation_badge_id: null as number | null,
    participation_stamp_id: null as number | null
  });
  const [events, setEvents] = useState<any[]>([]);
  const [createdBadges, setCreatedBadges] = useState<any[]>([]);

  const [isApplying, setIsApplying] = useState(false);
  const [applicationData, setApplicationData] = useState({
    category: 'rider',
    name: '',
    location: '',
    description: '',
    photos: [] as string[],
    links: [] as string[],
    proof_of_legitimacy: ''
  });
  const [isSubmittingApp, setIsSubmittingApp] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);

  const [myClubs, setMyClubs] = useState<any[]>([]);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClub, setNewClub] = useState({ name: '', description: '', location: '' });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      fetchAmbassador(parsedUser.id);
      fetchStamps(parsedUser.id);
      fetchRoutes();
      fetchEvents(parsedUser.id);
      fetchMyClubs();
    }
  }, []);

  const fetchMyClubs = async () => {
    try {
      const res = await fetchWithAuth('/api/clubs/my');
      if (res.ok) {
        const data = await res.json();
        setMyClubs(data.ownedClubs || []);
      }
    } catch (err) {
      console.error('Failed to fetch my clubs', err);
    }
  };

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth('/api/clubs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClub)
      });
      if (res.ok) {
        showNotification('success', 'MotoClub created successfully!');
        setShowCreateClub(false);
        setNewClub({ name: '', description: '', location: '' });
        fetchMyClubs();
      } else {
        const data = await res.json();
        showNotification('error', data.error || 'Failed to create club');
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'An error occurred');
    }
  };

  const fetchEvents = async (userId: number) => {
    try {
      const res = await fetchWithAuth(`/api/users/${userId}/events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Failed to fetch events', err);
    }
  };

  const fetchRoutes = async () => {
    try {
      const res = await fetchWithAuth('/api/roads');
      if (res.ok) {
        const data = await res.json();
        setRoutes(data);
      }
    } catch (err) {
      console.error('Failed to fetch routes', err);
    }
  };

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newCheckpoint.route_id) return;

    let lat = ambassador?.location_lat || 0;
    let lng = ambassador?.location_lng || 0;

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      lat = position.coords.latitude;
      lng = position.coords.longitude;
    } catch (geoErr) {
      console.warn('Geolocation failed, using ambassador default coordinates', geoErr);
    }

    try {
      const res = await fetchWithAuth('/api/checkpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_id: newCheckpoint.route_id,
          type: newCheckpoint.type,
          lat,
          lng
        })
      });

      if (res.ok) {
        const data = await res.json();
        generateCheckpointQR(data.checkpoint_id, newCheckpoint.route_id, newCheckpoint.type);
        setShowCreateCheckpoint(false);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to create checkpoint');
      }
    } catch (err) {
      console.error('Failed to create checkpoint', err);
      alert('Failed to create checkpoint');
    }
  };

  const generateCheckpointQR = async (checkpointId: string, routeId: string, type: string) => {
    try {
      const res = await fetchWithAuth(`/api/qr/checkpoint/${checkpointId}`);
      if (res.ok) {
        const data = await res.json();
        setCheckpointQrUrl(data.qrCode);
      } else {
        // Fallback
        const dataStr = JSON.stringify({ target_type: 'checkpoint', target_id: checkpointId, route_id: routeId, type: type });
        setCheckpointQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(dataStr)}`);
      }
    } catch (err) {
      console.error('Failed to generate QR code', err);
      const dataStr = JSON.stringify({ target_type: 'checkpoint', target_id: checkpointId, route_id: routeId, type: type });
      setCheckpointQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(dataStr)}`);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const res = await fetchWithAuth('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          ...newEvent
        })
      });

      if (res.ok) {
        setShowCreateEvent(false);
        setNewEvent({ 
          title: '', 
          description: '', 
          date: '', 
          time: '', 
          location: '',
          participation_badge_id: null,
          participation_stamp_id: null
        });
        // Optionally refresh ambassador details to show updated reputation
        fetchAmbassador(user.id);
        fetchEvents(user.id);
      }
    } catch (err) {
      console.error('Failed to create event', err);
    }
  };

  const fetchAmbassador = async (userId: number) => {
    try {
      const res = await fetchWithAuth(`/api/ambassadors/${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setAmbassador(data);
        } else {
          // If not an ambassador, check application status
          const statusRes = await fetchWithAuth(`/api/ambassadors/${userId}/application-status`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            setApplicationStatus(statusData.status);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch ambassador details', err);
    }
  };

  const fetchStamps = async (userId: number) => {
    try {
      const res = await fetchWithAuth(`/api/ambassadors/${userId}/stamps`);
      if (res.ok) {
        const data = await res.json();
        setStamps(data);
      }
      
      const badgesRes = await fetchWithAuth(`/api/badges?creator_id=${userId}`);
      if (badgesRes.ok) {
        const badgesData = await badgesRes.json();
        setCreatedBadges(badgesData);
      }
    } catch (err) {
      console.error('Failed to fetch stamps or badges', err);
    }
  };

  const handleCreateStamp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const res = await fetchWithAuth('/api/ambassadors/stamps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ambassador_id: user.id,
          ...newStamp
        })
      });

      if (res.ok) {
        setShowCreateStamp(false);
        setNewStamp({ name: '', description: '', type: 'location', icon: 'MapPin', rarity: 'common' });
        fetchStamps(user.id);
      }
    } catch (err) {
      console.error('Failed to create stamp', err);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (applicationData.category === 'motoclub' && !canAccess('create_club', user.plan, user.role)) {
      showNotification('error', t('admin.featureAccess.allowedPlan'));
      return;
    }

    setIsSubmittingApp(true);
    try {
      const res = await fetchWithAuth('/api/ambassadors/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          ...applicationData
        })
      });

      if (res.ok) {
        showNotification('success', 'Application submitted successfully! Our team will review it shortly.');
        setIsApplying(false);
        setApplicationStatus('pending');
      } else {
        const data = await res.json();
        showNotification('error', data.error || 'Failed to submit application');
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'An error occurred while submitting your application');
    } finally {
      setIsSubmittingApp(false);
    }
  };

  const generateQRCode = async (stamp: any) => {
    setSelectedStamp(stamp);
    try {
      const res = await fetchWithAuth(`/api/qr/stamp/${stamp.id}`);
      if (res.ok) {
        const data = await res.json();
        setQrCodeUrl(data.qrCode);
      } else {
        // Fallback for demo if endpoint doesn't exist yet
        setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=stamp:${stamp.id}:${user.id}`);
      }
    } catch (err) {
      console.error('Failed to generate QR code', err);
      setQrCodeUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=stamp:${stamp.id}:${user.id}`);
    }
  };

  if (!user) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] pt-24 pb-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <p className="text-chrome">Please log in to view the Ambassador Dashboard.</p>
      </div>
    );
  }

  if (!ambassador) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-oil rounded-3xl p-8 text-center border border-inverse/10"
        >
          <Shield className="w-16 h-16 text-steel mx-auto mb-6" />
          <h1 className="text-3xl font-display font-black uppercase italic text-chrome mb-4">Ambassador Network</h1>
          
          {applicationStatus === 'pending' ? (
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 mb-8">
              <h2 className="text-xl font-bold text-primary mb-2">Application Under Review</h2>
              <p className="text-steel">Your submission was received. Our team is currently reviewing your application to become an ambassador. We will notify you once a decision has been made.</p>
            </div>
          ) : applicationStatus === 'rejected' ? (
            <div className="bg-error/10 border border-error/20 rounded-2xl p-6 mb-8">
              <h2 className="text-xl font-bold text-error mb-2">Application Not Approved</h2>
              <p className="text-steel mb-4">Unfortunately, your previous application was not approved. You can submit a new application with updated information.</p>
              <button 
                onClick={() => {
                  setIsApplying(true);
                  setApplicationStatus('none');
                }}
                className="bg-inverse/10 text-chrome px-6 py-2 rounded-full font-bold hover:bg-inverse/20 transition-colors"
              >
                Re-apply
              </button>
            </div>
          ) : (
            <>
              <div className="bg-inverse/5 border border-inverse/10 rounded-2xl p-6 mb-8 text-left">
                <p className="text-steel leading-relaxed">
                  {t('ambassador.roleExplanation')}
                </p>
              </div>
              <p className="text-steel mb-8">{t('ambassador.notAmbassador')}</p>
              
              {!isApplying ? (
                <button 
                  onClick={() => setIsApplying(true)}
                  className="bg-primary text-inverse px-8 py-3 rounded-full font-bold hover:bg-inverse hover:text-inverse transition-colors"
                >
                  {t('ambassador.applyNow')}
                </button>
              ) : (
                <form onSubmit={handleApply} className="text-left space-y-6 bg-engine p-8 rounded-3xl border border-inverse/5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Category</label>
                  <select 
                    value={applicationData.category}
                    onChange={e => setApplicationData({...applicationData, category: e.target.value})}
                    className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary transition-all"
                  >
                    <option value="rider">Individual Rider</option>
                    <option value="motoclub">MotoClub / Group</option>
                    <option value="business">Business / Shop</option>
                    <option value="event">Event Organizer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Display Name</label>
                  <input 
                    type="text"
                    required
                    autoCapitalize="sentences"
                    value={applicationData.name}
                    onChange={e => setApplicationData({...applicationData, name: e.target.value})}
                    className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary transition-all"
                    placeholder="e.g. Black Knights MC"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Location</label>
                <LocationAutocomplete 
                  value={applicationData.location}
                  onChange={(val) => setApplicationData({...applicationData, location: val})}
                  placeholder="City, State"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Description</label>
                <textarea 
                  required
                  autoCapitalize="sentences"
                  value={applicationData.description}
                  onChange={e => setApplicationData({...applicationData, description: e.target.value})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary transition-all h-32 resize-none"
                  placeholder="Tell us about yourself or your organization..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Proof of Legitimacy</label>
                <textarea 
                  required
                  autoCapitalize="sentences"
                  value={applicationData.proof_of_legitimacy}
                  onChange={e => setApplicationData({...applicationData, proof_of_legitimacy: e.target.value})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary transition-all h-24 resize-none"
                  placeholder="Links to social media, website, or other proof..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsApplying(false)}
                  className="flex-1 px-6 py-3 rounded-full bg-inverse/5 text-chrome font-bold hover:bg-inverse/10 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingApp}
                  className="flex-1 px-6 py-3 rounded-full bg-primary text-inverse font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingApp ? (
                    <div className="w-5 h-5 border-2 border-inverse/30 border-t-chrome rounded-full animate-spin" />
                  ) : (
                    'Submit Application'
                  )}
                </button>
              </div>
            </form>
          )}
          </>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-5rem)] pt-24 pb-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary">
          <Shield className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-black uppercase italic text-chrome flex items-center gap-2">
            Ambassador Dashboard
            {user.plan === 'premium' && <PremiumBadge size={20} />}
          </h1>
          <p className="text-steel capitalize">{ambassador.category} Ambassador • Reputation: {ambassador.reputation_score}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Stamps Section */}
          <section className="bg-oil rounded-3xl p-6 border border-inverse/10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-chrome flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Your Passport Stamps
              </h2>
              <button 
                onClick={() => setShowCreateStamp(true)}
                className="flex items-center gap-2 text-sm bg-inverse/10 hover:bg-inverse/20 text-chrome px-4 py-2 rounded-full transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Stamp
              </button>
            </div>

            {stamps.length === 0 ? (
              <p className="text-steel text-center py-8">You haven't created any stamps yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {stamps.map(stamp => (
                  <div key={stamp.id} className="bg-engine rounded-2xl p-4 border border-inverse/5 flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-chrome mb-1">{stamp.name}</h3>
                      <p className="text-xs text-steel mb-2">{stamp.description}</p>
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-mono">
                        <span className="text-primary">{stamp.type}</span>
                        <span className="text-steel">•</span>
                        <span className="text-chrome">{stamp.rarity}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => generateQRCode(stamp)}
                      className="p-2 bg-inverse/10 hover:bg-primary hover:text-inverse rounded-xl text-steel transition-colors"
                      title="Generate QR Code"
                    >
                      <QrCode className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Events Section */}
          <section className="bg-oil rounded-3xl p-6 border border-inverse/10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-chrome flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Your Hosted Events
              </h2>
              <button 
                onClick={() => setShowCreateEvent(true)}
                className="flex items-center gap-2 text-sm bg-inverse/10 hover:bg-inverse/20 text-chrome px-4 py-2 rounded-full transition-colors"
              >
                <Plus className="w-4 h-4" />
                Host Event
              </button>
            </div>

            {events.length === 0 ? (
              <p className="text-steel text-center py-8">You haven't hosted any events yet.</p>
            ) : (
              <div className="space-y-4">
                {events.map(event => (
                  <div key={event.id} className="bg-engine rounded-2xl p-4 border border-inverse/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-engine">
                        <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <h3 className="font-bold text-chrome text-sm">{event.title}</h3>
                        <div className="flex items-center gap-3 text-[10px] text-steel uppercase tracking-wider mt-1">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {event.date}</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-1 rounded-full border ${event.is_approved ? 'bg-success/10 border-success/20 text-success' : 'bg-accent/10 border-accent/20 text-accent'}`}>
                        {event.is_approved ? 'Approved' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Stats Section */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-oil rounded-3xl p-6 border border-inverse/10 text-center">
              <Users className="w-8 h-8 text-info mx-auto mb-2" />
              <div className="text-3xl font-display font-black text-chrome">{ambassador.reputation_score * 3}</div>
              <div className="text-xs text-steel uppercase tracking-wider mt-1">Riders Verified</div>
            </div>
            <div className="bg-oil rounded-3xl p-6 border border-inverse/10 text-center">
              <MapPin className="w-8 h-8 text-success mx-auto mb-2" />
              <div className="text-3xl font-display font-black text-chrome">{stamps.length}</div>
              <div className="text-xs text-steel uppercase tracking-wider mt-1">Active Stamps</div>
            </div>
            <div className="bg-oil rounded-3xl p-6 border border-inverse/10 text-center">
              <Star className="w-8 h-8 text-warning mx-auto mb-2" />
              <div className="text-3xl font-display font-black text-chrome">{ambassador.reputation_score}</div>
              <div className="text-xs text-steel uppercase tracking-wider mt-1">Reputation Score</div>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          {/* QR Code Display */}
          {qrCodeUrl && selectedStamp && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-oil rounded-3xl p-6 border border-primary/30 text-center"
            >
              <h3 className="font-bold text-chrome mb-2">Scan to Collect</h3>
              <p className="text-sm text-steel mb-6">{selectedStamp.name}</p>
              <div className="bg-chrome p-4 rounded-2xl inline-block mb-6">
                <img src={qrCodeUrl} alt="Stamp QR Code" className="w-48 h-48" />
              </div>
              <p className="text-xs text-steel">Riders can scan this code using the app to collect this passport stamp.</p>
            </motion.div>
          )}

          {/* Quick Actions */}
          <section className="bg-oil rounded-3xl p-6 border border-inverse/10">
            <h2 className="text-lg font-bold text-chrome mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <button 
                onClick={() => setShowCreateCheckpoint(true)}
                className="w-full text-left px-4 py-3 rounded-xl bg-inverse/5 hover:bg-inverse/10 text-chrome transition-colors flex items-center gap-3"
              >
                <MapPin className="w-4 h-4" /> Create Route Checkpoint
              </button>
              <button 
                onClick={() => setShowCreateEvent(true)}
                className="w-full text-left px-4 py-3 rounded-xl bg-inverse/5 hover:bg-inverse/10 text-chrome transition-colors flex items-center gap-3"
              >
                <Users className="w-4 h-4" /> Host an Event
              </button>
              {ambassador && (
                <button 
                  onClick={() => myClubs.length > 0 ? navigate('/clubs') : setShowCreateClub(true)}
                  className="w-full text-left px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors flex items-center gap-3"
                >
                  <Shield className="w-4 h-4" /> {myClubs.length > 0 ? 'Manage My MotoClub' : 'Create My MotoClub'}
                </button>
              )}
            </div>
          </section>

          {showCreateClub && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-engine/50 backdrop-blur-sm p-4">
              <div className="bg-oil border border-inverse/10 rounded-3xl w-full max-w-md p-6">
                <h3 className="text-xl font-bold text-chrome mb-6">Create Your MotoClub</h3>
                <form onSubmit={handleCreateClub} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Club Name</label>
                    <input type="text" required autoCapitalize="sentences" value={newClub.name} onChange={e => setNewClub({...newClub, name: e.target.value})} className="input-field" placeholder="e.g. Iron Souls MC" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Location</label>
                    <LocationAutocomplete 
                      value={newClub.location} 
                      onChange={val => setNewClub({...newClub, location: val})} 
                      className="input-field" 
                      placeholder="City, State" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Description</label>
                    <textarea required autoCapitalize="sentences" value={newClub.description} onChange={e => setNewClub({...newClub, description: e.target.value})} className="input-field h-24 resize-none" placeholder="What is your club about?" />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setShowCreateClub(false)} className="flex-1 px-6 py-3 rounded-full bg-inverse/5 text-chrome font-bold">Cancel</button>
                    <button type="submit" className="flex-1 px-6 py-3 rounded-full bg-primary text-inverse font-bold">Create Club</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Checkpoint QR Code Display */}
          {checkpointQrUrl && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-oil rounded-3xl p-6 border border-primary/30 text-center mt-8"
            >
              <h3 className="font-bold text-chrome mb-2">Route Checkpoint QR</h3>
              <p className="text-sm text-steel mb-6">Scan to verify {newCheckpoint.type} checkpoint.</p>
              <div className="bg-chrome p-4 rounded-2xl inline-block mb-6">
                <img src={checkpointQrUrl} alt="Checkpoint QR Code" className="w-48 h-48" />
              </div>
              <p className="text-xs text-steel">Riders can scan this code to verify their route progress.</p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Create Event Modal */}
      {showCreateEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-engine/80 backdrop-blur-sm" onClick={() => setShowCreateEvent(false)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-oil rounded-3xl p-6 border border-inverse/10 w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-xl font-bold text-chrome mb-6">Host an Event</h2>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-steel mb-1">Event Title</label>
                <input 
                  type="text" 
                  required
                  autoCapitalize="sentences"
                  value={newEvent.title || ''}
                  onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                  placeholder="e.g., Sunday Morning Canyon Run"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-steel mb-1">Description</label>
                <textarea 
                  required
                  autoCapitalize="sentences"
                  value={newEvent.description || ''}
                  onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary h-24 resize-none"
                  placeholder="Describe your event..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-steel mb-1">Date</label>
                  <input 
                    type="date" 
                    required
                    value={newEvent.date || ''}
                    onChange={e => setNewEvent({...newEvent, date: e.target.value})}
                    className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-steel mb-1">Time</label>
                  <input 
                    type="time" 
                    required
                    value={newEvent.time || ''}
                    onChange={e => setNewEvent({...newEvent, time: e.target.value})}
                    className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-steel mb-1">Location</label>
                <LocationAutocomplete 
                  value={newEvent.location}
                  onChange={value => setNewEvent({...newEvent, location: value})}
                  placeholder="e.g., Moto Garage LA"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-steel mb-1">{t('event.field.participationBadge')}</label>
                <select
                  value={newEvent.participation_badge_id || ''}
                  onChange={e => setNewEvent({...newEvent, participation_badge_id: e.target.value ? parseInt(e.target.value) : null})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                >
                  <option value="">{t('event.modal.noBadge')}</option>
                  {createdBadges.map(badge => (
                    <option key={badge.badge_id} value={badge.badge_id}>{badge.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-steel mb-1">{t('event.field.participationStamp')}</label>
                <select
                  value={newEvent.participation_stamp_id || ''}
                  onChange={e => setNewEvent({...newEvent, participation_stamp_id: e.target.value ? parseInt(e.target.value) : null})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                >
                  <option value="">{t('event.modal.noBadge')}</option>
                  {stamps.map(stamp => (
                    <option key={stamp.id} value={stamp.id}>{stamp.name}</option>
                  ))}
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowCreateEvent(false)}
                  className="flex-1 px-4 py-2 rounded-xl bg-inverse/5 text-chrome hover:bg-inverse/10 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl bg-primary text-inverse font-bold hover:bg-primary/90 transition-colors"
                >
                  Create Event
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Create Route Checkpoint Modal */}
      {showCreateCheckpoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-engine/80 backdrop-blur-sm" onClick={() => setShowCreateCheckpoint(false)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-oil rounded-3xl p-6 border border-inverse/10 w-full max-w-md"
          >
            <h2 className="text-xl font-bold text-chrome mb-6">Create Route Checkpoint</h2>
            <form onSubmit={handleCreateCheckpoint} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-steel mb-1">Select Route</label>
                <select 
                  required
                  value={newCheckpoint.route_id || ''}
                  onChange={e => setNewCheckpoint({...newCheckpoint, route_id: e.target.value})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                >
                  <option value="">Select a route...</option>
                  {routes.map(route => (
                    <option key={route.route_id} value={route.route_id}>{route.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-steel mb-1">Checkpoint Type</label>
                <select 
                  value={newCheckpoint.type || ''}
                  onChange={e => setNewCheckpoint({...newCheckpoint, type: e.target.value})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                >
                  <option value="start">Start Checkpoint</option>
                  <option value="end">End Checkpoint</option>
                </select>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowCreateCheckpoint(false)}
                  className="flex-1 px-4 py-2 rounded-xl bg-inverse/5 text-chrome hover:bg-inverse/10 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl bg-primary text-inverse font-bold hover:bg-primary/90 transition-colors"
                >
                  Generate QR
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Create Stamp Modal */}
      {showCreateStamp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-engine/80 backdrop-blur-sm" onClick={() => setShowCreateStamp(false)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative bg-oil rounded-3xl p-6 border border-inverse/10 w-full max-w-md"
          >
            <h2 className="text-xl font-bold text-chrome mb-6">Create Passport Stamp</h2>
            <form onSubmit={handleCreateStamp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-steel mb-1">Stamp Name</label>
                <input 
                  type="text" 
                  required
                  autoCapitalize="sentences"
                  value={newStamp.name || ''}
                  onChange={e => setNewStamp({...newStamp, name: e.target.value})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                  placeholder="e.g., Tail of the Dragon Survivor"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-steel mb-1">Description</label>
                <textarea 
                  required
                  autoCapitalize="sentences"
                  value={newStamp.description || ''}
                  onChange={e => setNewStamp({...newStamp, description: e.target.value})}
                  className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary h-24 resize-none"
                  placeholder="Describe how to earn this stamp..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-steel mb-1">Type</label>
                  <select 
                    value={newStamp.type || ''}
                    onChange={e => setNewStamp({...newStamp, type: e.target.value})}
                    className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                  >
                    <option value="location">Location</option>
                    <option value="event">Event</option>
                    <option value="challenge">Challenge</option>
                    <option value="route_completion">Route Completion</option>
                    <option value="special_edition">Special Edition</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-steel mb-1">Rarity</label>
                  <select 
                    value={newStamp.rarity || ''}
                    onChange={e => setNewStamp({...newStamp, rarity: e.target.value})}
                    className="w-full bg-engine border border-inverse/10 rounded-xl px-4 py-2 text-chrome focus:outline-none focus:border-primary"
                  >
                    <option value="common">Common</option>
                    <option value="uncommon">Uncommon</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="legendary">Legendary</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowCreateStamp(false)}
                  className="flex-1 px-4 py-2 rounded-xl bg-inverse/5 text-chrome hover:bg-inverse/10 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl bg-primary text-inverse font-bold hover:bg-primary/90 transition-colors"
                >
                  Create Stamp
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
