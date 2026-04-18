import { fetchWithAuth } from '../utils/api';
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');
  const { t } = useLanguage();
  
  const coverInputRef = useRef<HTMLInputElement>(null);
  
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
        const res = await fetchWithAuth(`/api/profile/${encodeURIComponent(username!)}`);
        if (!res.ok) throw new Error(t('profile.notFound'));
        const result = await res.json();
        setData(result);
        setProfilePicUrl(result.profile_picture_url);
        setCoverPhotoUrl(result.cover_photo_url || '');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetchWithAuth('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || t('profile.uploadFailed'));
      }

      if (type === 'profile') {
        setProfilePicUrl(result.url);
      } else {
        setCoverPhotoUrl(result.url);
      }
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
    const formDataObj = Object.fromEntries(formData.entries());
    
    // Use the uploaded URLs
    const payload = { 
      ...formDataObj, 
      profile_picture_url: profilePicUrl,
      cover_photo_url: coverPhotoUrl
    };

    try {
      // If admin is editing and email changed, update email first
      if (isAdmin && formDataObj.email && formDataObj.email !== data.email) {
        const emailRes = await fetchWithAuth(`/api/admin/users/${data.id}/email`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formDataObj.email }),
        });

        if (!emailRes.ok) {
          const emailResult = await emailRes.json();
          throw new Error(emailResult.error || t('profile.updateFailed'));
        }
      }

      const res = await fetchWithAuth(`/api/profile/${encodeURIComponent(username!)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || t('profile.updateFailed'));
      }

      // Update localStorage with new user data
      const updatedUser = { ...currentUser, username: result.username };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      window.dispatchEvent(new Event('auth-change'));

      navigate(`/profile/${result.username}`);
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
      const res = await fetchWithAuth(`/api/motorcycles/${motoId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maintenanceData),
      });

      if (res.ok) {
        setMaintenanceData({ service: '', km: '', shop: '' });
        setActiveMaintenanceMotoId(null);
        // Refresh profile data to show new log
        const refreshRes = await fetchWithAuth(`/api/profile/${encodeURIComponent(username!)}`);
        const refreshResult = await refreshRes.json();
        setData(refreshResult);
      } else {
        const result = await res.json();
        setError(result.error || t('profile.maintenanceFailed'));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmittingLog(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isOwner = currentUser?.username === username;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';

  if (!isOwner && !isAdmin) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] flex flex-col items-center justify-center text-center px-4">
        <ShieldAlert className="w-20 h-20 text-engine mb-8" />
        <h2 className="text-4xl font-display font-black uppercase italic mb-4">{t('profile.accessDenied')}</h2>
        <p className="text-steel mb-10 font-light">{t('profile.noPermissionEdit')}</p>
        <Link to="/" className="btn-secondary">
          <ArrowLeft className="w-4 h-4 mr-2 inline" />
          {t('profile.backHome')}
        </Link>
      </div>
    );
  }

  const isRider = data.type === 'rider';

  return (
    <div className="min-h-[calc(100dvh-5rem)] py-12 pb-28 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto">
      <Link to={`/profile/${username}`} className="inline-flex items-center gap-2 text-steel hover:text-primary transition-colors mb-12 font-mono text-xs uppercase tracking-widest">
        <ArrowLeft className="w-4 h-4" />
        {t('eventDetails.back')}
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-12">
          <h1 className="text-4xl font-display font-black uppercase italic tracking-tighter mb-2 text-primary">{t('profile.edit')}</h1>
          <p className="text-steel font-light">{t('profile.updateInfo')} @{username}</p>
        </div>

        <div className="glass-card p-8 shadow-2xl shadow-primary/5">
          {error && (
            <div className="mb-8 p-4 bg-accent/10 border border-accent/20 rounded-xl text-accent text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="mb-12">
              <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-4">{t('profile.coverPhoto') || 'Cover Photo'}</label>
              <div className="relative h-48 w-full rounded-3xl overflow-hidden border-4 border-asphalt bg-oil shadow-2xl group">
                <img 
                  src={coverPhotoUrl || 'https://picsum.photos/seed/moto/1920/1080'} 
                  alt="Cover" 
                  className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-engine/40 group-hover:bg-transparent transition-colors" />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="absolute bottom-4 right-4 p-3 bg-primary text-white rounded-xl shadow-xl hover:bg-inverse hover:text-primary transition-all hover:scale-110"
                >
                  <Upload className="w-5 h-5" />
                </button>
                <input 
                  type="file" 
                  ref={coverInputRef}
                  onChange={(e) => handleFileUpload(e, 'cover')}
                  accept="image/*"
                  className="hidden" 
                />
              </div>
            </div>

            <div className="flex flex-col items-center mb-12">
              <div className="relative group">
                <div className="w-40 h-40 rounded-3xl overflow-hidden border-4 border-asphalt bg-oil shadow-2xl shadow-primary/20">
                  <img 
                    src={profilePicUrl} 
                    alt="Profile" 
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                    referrerPolicy="no-referrer"
                  />
                  {uploading && (
                    <div className="absolute inset-0 bg-engine/80 flex items-center justify-center">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-3 -right-3 p-4 bg-primary text-inverse rounded-2xl shadow-xl hover:bg-oil transition-all hover:scale-110 active:scale-95"
                >
                  <Camera className="w-6 h-6" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={(e) => handleFileUpload(e, 'profile')}
                  accept="image/*"
                  className="hidden" 
                />
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-steel mt-6">{t('profile.uploadNewPhoto')}</p>
            </div>

            <div className="hidden">
              <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.picUrl')}</label>
              <input 
                type="url" 
                name="profile_picture_url" 
                value={profilePicUrl || ''}
                readOnly
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.username')}</label>
              <input 
                type="text" 
                name="new_username" 
                autoCapitalize="sentences"
                required
                defaultValue={username}
                className="input-field"
              />
            </div>

            {isAdmin && (
              <div>
                <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('admin.editEmail.label')}</label>
                <input 
                  type="email" 
                  name="email" 
                  required
                  defaultValue={data.email}
                  className="input-field"
                />
              </div>
            )}

            {isRider ? (
              <>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.fullName')}</label>
                  <input 
                    type="text" 
                    name="name" 
                    autoCapitalize="sentences"
                    required
                    defaultValue={data.profile.name}
                    className="input-field"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.age')}</label>
                    <input 
                      type="number" 
                      name="age" 
                      defaultValue={data.profile.age}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.city')}</label>
                    <LocationAutocomplete 
                      name="city" 
                      defaultValue={data.profile.city}
                      className="input-field"
                      types={['(cities)']}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.bio') || 'Bio'}</label>
                  <textarea 
                    name="bio" 
                    autoCapitalize="sentences"
                    rows={3}
                    defaultValue={data.bio}
                    className="input-field resize-none"
                    placeholder={t('profile.bioPlaceholder') || 'Tell us about your riding journey...'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.motorcycle') || 'Current Motorcycle'}</label>
                  <input 
                    type="text" 
                    name="motorcycle" 
                    autoCapitalize="sentences"
                    defaultValue={data.motorcycle}
                    className="input-field"
                    placeholder="e.g. 2023 Triumph Bonneville T120"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.interests') || 'Interests'}</label>
                  <input 
                    type="text" 
                    name="interests" 
                    defaultValue={data.interests}
                    className="input-field"
                    placeholder="e.g. Cafe Racers, Custom Builds, Road Trips"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.companyName')}</label>
                  <input 
                    type="text" 
                    name="company_name" 
                    autoCapitalize="sentences"
                    required
                    defaultValue={data.profile.company_name}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.category')}</label>
                  <select 
                    name="service_category"
                    defaultValue={data.profile.service_category}
                    className="input-field appearance-none"
                  >
                    <option value="repair">{t('category.repair')}</option>
                    <option value="dealership">{t('category.dealership')}</option>
                    <option value="parts">{t('category.parts')}</option>
                    <option value="club">{t('category.club')}</option>
                    <option value="barbershop">{t('category.barbershop')}</option>
                    <option value="band">{t('category.band')}</option>
                    <option value="other">{t('category.other')}</option>
                  </select>
                </div>
                {data.profile.service_category === 'club' && (
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">Chapter Label (e.g. Chapter, Party, Faction)</label>
                    <input 
                      type="text" 
                      name="chapter_label" 
                      autoCapitalize="sentences"
                      defaultValue={data.profile.chapter_label || 'Chapter'}
                      className="input-field"
                      placeholder="Chapter"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.fullAddress')}</label>
                  <LocationAutocomplete 
                    name="full_address" 
                    defaultValue={data.profile.full_address}
                    className="input-field"
                    types={['address']}
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">Phone</label>
                    <input 
                      type="tel" 
                      name="phone" 
                      defaultValue={data.profile.phone || ''}
                      className="input-field"
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">Website</label>
                    <input 
                      type="url" 
                      name="website" 
                      defaultValue={data.profile.website || ''}
                      className="input-field"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.detailsBio')}</label>
                  <textarea 
                    name="details" 
                    autoCapitalize="sentences"
                    rows={5}
                    defaultValue={data.profile.details || ''}
                    className="input-field resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('profile.services') || 'Services Offered'}</label>
                  <input 
                    type="text" 
                    name="services" 
                    defaultValue={data.services}
                    className="input-field"
                    placeholder="e.g. Custom Paint, Engine Tuning, Parts"
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

          {isOwner && (
            <div className="mt-12 pt-12 border-t border-inverse/10">
              <h3 className="text-xs font-mono uppercase tracking-widest text-engine mb-4">Danger Zone</h3>
              <p className="text-steel text-sm mb-6 font-light">
                Once you delete your account, there is no going back. Please be certain.
              </p>
              <button
                onClick={async () => {
                  if (window.confirm("Are you absolutely sure you want to delete your account? This action cannot be undone.")) {
                    try {
                      const res = await fetchWithAuth('/api/user', { method: 'DELETE' });
                      if (res.ok) {
                        localStorage.clear();
                        window.location.href = '/';
                      } else {
                        const result = await res.json();
                        alert(result.error || "Failed to delete account");
                      }
                    } catch (err: any) {
                      alert(err.message);
                    }
                  }
                }}
                className="w-full py-4 border border-engine/30 text-engine hover:bg-engine/10 rounded-2xl transition-all font-mono text-xs uppercase tracking-widest"
              >
                Delete My Account
              </button>
            </div>
          )}
        </div>

        {/* Garage management removed from here as it is now fully managed in Profile.tsx */}
      </motion.div>
    </div>
  );
}
