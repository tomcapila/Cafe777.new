import { fetchWithAuth } from '../utils/api';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, X, Bike, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../contexts/NotificationContext';

export default function SubmitPhoto() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [motorcycleId, setMotorcycleId] = useState('');
  const [motorcycles, setMotorcycles] = useState<any[]>([]);
  const [contests, setContests] = useState<any[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      fetchMotorcycles(user.username);
    }
    fetchActiveContests();
  }, []);

  const fetchActiveContests = async () => {
    try {
      const res = await fetchWithAuth('/api/contests/active');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setContests(data);
          if (data.length > 0) {
            setSelectedContestId(data[0].id.toString());
          }
        } else {
          console.error('Active contests data is not an array:', data);
          setContests([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch active contests:', err);
    }
  };

  const fetchMotorcycles = async (username: string) => {
    try {
      const res = await fetchWithAuth(`/api/profile/${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.garage) {
        setMotorcycles(data.garage);
      }
    } catch (err) {
      console.error('Failed to fetch motorcycles:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo || !currentUser || !selectedContestId) return;

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('photo', photo);
    formData.append('user_id', currentUser.id);
    formData.append('description', description);
    if (motorcycleId) formData.append('motorcycle_id', motorcycleId);

    try {
      const res = await fetchWithAuth(`/api/contests/${selectedContestId}/submissions`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        showNotification('success', 'Photo submitted successfully! Waiting for approval.');
        navigate('/contest');
      } else {
        const error = await res.json();
        showNotification('error', error.error || 'Failed to submit photo');
      }
    } catch (err) {
      console.error('Submission failed:', err);
      showNotification('error', 'An error occurred during submission');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-5rem)] bg-engine text-chrome font-sans p-8 pb-28">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => navigate('/contest')}
          className="flex items-center gap-2 text-steel hover:text-primary transition-colors mb-8 font-mono text-xs uppercase tracking-widest"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Contest
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Left Side: Header & Form */}
          <div className="space-y-8">
            <div>
              <h1 className="text-6xl font-black uppercase tracking-tighter leading-[0.85] mb-4">
                Submit <br /> Your Shot
              </h1>
              <p className="text-xl text-steel font-medium leading-tight">
                Enter the weekly contest for a chance to win exclusive badges and reputation points.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-widest text-steel mb-2">Select Contest</label>
                  <div className="relative">
                    <select
                      value={selectedContestId}
                      onChange={(e) => setSelectedContestId(e.target.value)}
                      required
                      className="w-full bg-oil border-2 border-inverse p-4 text-chrome focus:border-primary outline-none appearance-none transition-colors"
                    >
                      <option value="" disabled>Select an active contest</option>
                      {contests.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel pointer-events-none rotate-90" />
                  </div>
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-widest text-steel mb-2">Description</label>
                  <textarea
                    value={description || ''}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Tell us about this shot..."
                    className="w-full bg-oil border-2 border-inverse p-4 text-chrome focus:border-primary outline-none min-h-[120px] transition-colors"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-widest text-steel mb-2">Tagged Motorcycle (Optional)</label>
                  <div className="relative">
                    <select
                      value={motorcycleId || ''}
                      onChange={(e) => setMotorcycleId(e.target.value)}
                      className="w-full bg-oil border-2 border-inverse p-4 text-chrome focus:border-primary outline-none appearance-none transition-colors"
                    >
                      <option value="">None</option>
                      {motorcycles.map((moto: any) => (
                        <option key={moto.id} value={moto.id}>{moto.make} {moto.model} ({moto.year})</option>
                      ))}
                    </select>
                    <Bike className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel pointer-events-none" />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !photo}
                className="group relative w-full bg-primary text-inverse font-black uppercase tracking-widest py-6 text-xl hover:bg-inverse hover:text-inverse transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {isSubmitting ? 'Submitting...' : 'Submit Entry'} <ChevronRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                </span>
                <div className="absolute top-2 left-2 w-full h-full border-2 border-primary -z-10 group-hover:top-0 group-hover:left-0 transition-all" />
              </button>
            </form>
          </div>

          {/* Right Side: Photo Preview */}
          <div className="relative">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`group relative aspect-[4/5] bg-oil border-4 border-dashed border-inverse hover:border-primary transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden ${preview ? 'border-solid' : ''}`}
            >
              {preview ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full h-full"
                >
                  <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-engine/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <p className="bg-inverse text-inverse font-black uppercase tracking-widest px-6 py-3 border-2 border-inverse">Change Photo</p>
                  </div>
                </motion.div>
              ) : (
                <div className="text-center p-12">
                  <div className="w-24 h-24 bg-engine border-4 border-inverse flex items-center justify-center mx-auto mb-6 group-hover:bg-primary transition-colors">
                    <Upload className="w-10 h-10 text-steel group-hover:text-inverse transition-colors" />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Upload Photo</h3>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-steel">
                    JPG, PNG or WEBP. Max 5MB.
                  </p>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>

            {/* Decorative Elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 border-t-4 border-right-4 border-primary -z-10" />
            <div className="absolute -bottom-4 -left-4 w-24 h-24 border-b-4 border-left-4 border-primary -z-10" />
          </div>
        </div>
      </div>
    </div>
  );
}
