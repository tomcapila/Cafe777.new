import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Building2, ArrowLeft, Loader2, Save, ShieldAlert, Camera, Upload } from 'lucide-react';

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

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isOwner = currentUser?.username === username;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';

  if (!isOwner && !isAdmin) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4">
        <ShieldAlert className="w-16 h-16 text-zinc-800 mb-6" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-zinc-500 mb-8">You do not have permission to edit this profile.</p>
        <Link to="/" className="text-orange-500 hover:text-orange-400 font-medium">
          Back to Home
        </Link>
      </div>
    );
  }

  const isRider = data.type === 'rider';

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto">
      <Link to={`/profile/${username}`} className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-8">
        <ArrowLeft className="w-4 h-4" />
        Back to Profile
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Edit Profile</h1>
          <p className="text-zinc-400">Update your information for @{username}</p>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-8 border border-white/10 shadow-xl">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col items-center mb-8">
              <div className="relative group">
                <div className="w-32 h-32 rounded-3xl overflow-hidden border-4 border-zinc-950 bg-zinc-900 shadow-2xl">
                  <img 
                    src={profilePicUrl} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {uploading && (
                    <div className="absolute inset-0 bg-zinc-950/60 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 p-3 bg-orange-500 text-zinc-950 rounded-2xl shadow-lg hover:bg-orange-400 transition-all hover:scale-110 active:scale-95"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden" 
                />
              </div>
              <p className="text-xs text-zinc-500 mt-4">Click the camera to upload a new photo</p>
            </div>

            <div className="hidden">
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Profile Picture URL</label>
              <input 
                type="url" 
                name="profile_picture_url" 
                value={profilePicUrl}
                readOnly
                className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
              />
            </div>

            {isRider ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Full Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    required
                    defaultValue={data.profile.name}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Age</label>
                    <input 
                      type="number" 
                      name="age" 
                      defaultValue={data.profile.age}
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">City</label>
                    <input 
                      type="text" 
                      name="city" 
                      defaultValue={data.profile.city}
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Company Name</label>
                  <input 
                    type="text" 
                    name="company_name" 
                    required
                    defaultValue={data.profile.company_name}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Category</label>
                  <select 
                    name="service_category"
                    defaultValue={data.profile.service_category}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all appearance-none"
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
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Full Address</label>
                  <input 
                    type="text" 
                    name="full_address" 
                    defaultValue={data.profile.full_address}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Details / Bio</label>
                  <textarea 
                    name="details" 
                    rows={5}
                    defaultValue={data.profile.details}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all resize-none"
                  />
                </div>
              </>
            )}

            <button 
              type="submit" 
              disabled={saving}
              className="w-full bg-orange-500 text-zinc-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
