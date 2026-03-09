import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { User, Building2, ArrowLeft, Loader2, Save, ShieldAlert, Camera, Upload, Bike, Wrench, Plus, History, Calendar, MapPin, Clock } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function EditProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profilePicUrl, setProfilePicUrl] = useState('');
  const { t } = useLanguage();
  
  // Maintenance log state
  const [activeMaintenanceMotoId, setActiveMaintenanceMotoId] = useState<number | null>(null);
  const [maintenanceData, setMaintenanceData] = useState({
    service: '',
    km: '',
    shop: ''
  });
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);

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

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/profile/${username}`);
        if (!res.ok) throw new Error('Profile not found');
        const result = await res.json();
        setData(result);
        setProfilePicUrl(result.profile_picture_url);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setProfilePicUrl(result.url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    // Use the uploaded profile pic URL
    const payload = { ...data, profile_picture_url: profilePicUrl };

    try {
      const res = await fetch(`/api/profile/${username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to update profile');
      }

      navigate(`/profile/${username}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMaintenanceSubmit = async (e: React.FormEvent, motoId: number) => {
    e.preventDefault();
    setIsSubmittingLog(true);
    try {
      const res = await fetch(`/api/motorcycles/${motoId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maintenanceData),
      });

      if (res.ok) {
        setMaintenanceData({ service: '', km: '', shop: '' });
        setActiveMaintenanceMotoId(null);
        // Refresh profile data to show new log
        const refreshRes = await fetch(`/api/profile/${username}`);
        const refreshResult = await refreshRes.json();
        setData(refreshResult);
      } else {
        const result = await res.json();
        setError(result.error || 'Failed to add maintenance log');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmittingLog(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isOwner = currentUser?.username === username;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';

  if (!isOwner && !isAdmin) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4">
        <ShieldAlert className="w-20 h-20 text-zinc-800 mb-8" />
        <h2 className="text-4xl font-display font-black uppercase italic mb-4">Access Denied</h2>
        <p className="text-zinc-500 mb-10 font-light">You do not have permission to edit this profile.</p>
        <Link to="/" className="btn-secondary">
          <ArrowLeft className="w-4 h-4 mr-2 inline" />
          Back to Home
        </Link>
      </div>
    );
  }

  const isRider = data.type === 'rider';

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto">
      <Link to={`/profile/${username}`} className="inline-flex items-center gap-2 text-zinc-500 hover:text-primary transition-colors mb-12 font-mono text-xs uppercase tracking-widest">
        <ArrowLeft className="w-4 h-4" />
        {t('eventDetails.back')}
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-12">
          <h1 className="text-4xl font-display font-black uppercase italic tracking-tighter mb-2 text-primary">{t('profile.edit')}</h1>
          <p className="text-zinc-500 font-light">{t('profile.updateInfo')} @{username}</p>
        </div>

        <div className="glass-card p-8 shadow-2xl shadow-primary/5">
          {error && (
            <div className="mb-8 p-4 bg-accent/10 border border-accent/20 rounded-xl text-accent text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex flex-col items-center mb-12">
              <div className="relative group">
                <div className="w-40 h-40 rounded-3xl overflow-hidden border-4 border-zinc-950 bg-zinc-900 shadow-2xl shadow-primary/20">
                  <img 
                    src={profilePicUrl} 
                    alt="Profile" 
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                    referrerPolicy="no-referrer"
                  />
                  {uploading && (
                    <div className="absolute inset-0 bg-zinc-950/80 flex items-center justify-center">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-3 -right-3 p-4 bg-primary text-zinc-950 rounded-2xl shadow-xl hover:bg-oil transition-all hover:scale-110 active:scale-95"
                >
                  <Camera className="w-6 h-6" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden" 
                />
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 mt-6">Click the camera to upload a new photo</p>
            </div>

            <div className="hidden">
              <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Profile Picture URL</label>
              <input 
                type="url" 
                name="profile_picture_url" 
                value={profilePicUrl}
                readOnly
                className="input-field"
              />
            </div>

            {isRider ? (
              <>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Full Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    required
                    defaultValue={data.profile.name}
                    className="input-field"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Age</label>
                    <input 
                      type="number" 
                      name="age" 
                      defaultValue={data.profile.age}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">City</label>
                    <input 
                      type="text" 
                      name="city" 
                      defaultValue={data.profile.city}
                      className="input-field"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Company Name</label>
                  <input 
                    type="text" 
                    name="company_name" 
                    required
                    defaultValue={data.profile.company_name}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Category</label>
                  <select 
                    name="service_category"
                    defaultValue={data.profile.service_category}
                    className="input-field appearance-none"
                  >
                    <option value="repair">Repair Shop</option>
                    <option value="dealership">Dealership</option>
                    <option value="parts">Parts Store</option>
                    <option value="club">Motorcycle Club</option>
                    <option value="barbershop">Barbershop</option>
                    <option value="band">Band / Entertainment</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Full Address</label>
                  <input 
                    type="text" 
                    name="full_address" 
                    defaultValue={data.profile.full_address}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Details / Bio</label>
                  <textarea 
                    name="details" 
                    rows={5}
                    defaultValue={data.profile.details}
                    className="input-field resize-none"
                  />
                </div>
              </>
            )}

            <button 
              type="submit" 
              disabled={saving}
              className="w-full btn-primary py-4 mt-8"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Save className="w-5 h-5" />
                  {t('profile.save')}
                </div>
              )}
            </button>
          </form>
        </div>

        {isRider && data.garage && data.garage.length > 0 && (
          <div className="mt-20 space-y-10">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Bike className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">Garage Management</h2>
            </div>

            <div className="grid gap-8">
              {data.garage.map((moto: any) => (
                <div key={moto.id} className="glass-card p-8 shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary/10 transition-all" />
                  
                  <div className="flex justify-between items-start mb-8 relative z-10">
                    <div>
                      <div className="text-xs font-mono font-bold text-primary mb-2 uppercase tracking-widest">{moto.year}</div>
                      <h3 className="text-2xl font-display font-black uppercase italic mb-1 tracking-tight">{moto.make}</h3>
                      <p className="text-zinc-400 font-light">{moto.model}</p>
                    </div>
                    <button 
                      onClick={() => setActiveMaintenanceMotoId(activeMaintenanceMotoId === moto.id ? null : moto.id)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-mono font-bold uppercase tracking-widest transition-all ${
                        activeMaintenanceMotoId === moto.id 
                          ? 'bg-zinc-800 text-zinc-500' 
                          : 'bg-primary text-zinc-950 hover:bg-oil shadow-lg shadow-primary/10'
                      }`}
                    >
                      {activeMaintenanceMotoId === moto.id ? 'Cancel' : (
                        <>
                          <Plus className="w-4 h-4" />
                          Add Maintenance Log
                        </>
                      )}
                    </button>
                  </div>

                  {activeMaintenanceMotoId === moto.id && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-10 p-8 bg-zinc-950/50 rounded-3xl border border-primary/20 relative z-10"
                    >
                      <form onSubmit={(e) => handleMaintenanceSubmit(e, moto.id)} className="space-y-6">
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mb-2 ml-1">Service Performed</label>
                          <input
                            type="text"
                            placeholder="e.g. Oil Change, Tire Replacement"
                            required
                            value={maintenanceData.service}
                            onChange={(e) => setMaintenanceData({...maintenanceData, service: e.target.value})}
                            className="input-field"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label className="block text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mb-2 ml-1">Current KM</label>
                            <input
                              type="number"
                              placeholder="KM"
                              value={maintenanceData.km}
                              onChange={(e) => setMaintenanceData({...maintenanceData, km: e.target.value})}
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mb-2 ml-1">Shop / Location</label>
                            <input
                              type="text"
                              placeholder="Shop Name"
                              value={maintenanceData.shop}
                              onChange={(e) => setMaintenanceData({...maintenanceData, shop: e.target.value})}
                              className="input-field"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={isSubmittingLog}
                          className="w-full btn-primary py-4"
                        >
                          {isSubmittingLog ? 'Saving Log...' : 'Save Maintenance Log'}
                        </button>
                      </form>
                    </motion.div>
                  )}

                  {moto.maintenance_logs && moto.maintenance_logs.length > 0 && (
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center gap-3 text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mb-4">
                        <History className="w-4 h-4" />
                        Recent History
                      </div>
                      <div className="grid gap-4">
                        {moto.maintenance_logs.slice(0, 3).map((log: any) => (
                          <div key={log.id} className="bg-zinc-950/30 p-6 rounded-2xl border border-white/5 group/log hover:border-primary/20 transition-all">
                            <div className="flex justify-between items-start mb-3">
                              <div className="font-display font-bold uppercase italic text-zinc-200 tracking-tight">{log.service}</div>
                              <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
                                {new Date(log.date).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="flex gap-6 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                              {log.km && (
                                <div className="flex items-center gap-2">
                                  <span className="text-primary font-black">KM:</span>
                                  {log.km.toLocaleString()}
                                </div>
                              )}
                              {log.shop && (
                                <div className="flex items-center gap-2">
                                  <span className="text-primary font-black">Shop:</span>
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
          </div>
        )}
      </motion.div>
    </div>
  );
}
