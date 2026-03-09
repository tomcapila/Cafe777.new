import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, X, Bike } from 'lucide-react';
import { motion } from 'motion/react';

export default function SubmitPhoto() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [motorcycleId, setMotorcycleId] = useState('');
  const [motorcycles, setMotorcycles] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      fetchMotorcycles(user.username);
    }
  }, []);

  const fetchMotorcycles = async (username: string) => {
    try {
      const res = await fetch(`/api/profile/${username}`);
      const data = await res.json();
      if (data.motorcycles) {
        setMotorcycles(data.motorcycles);
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
    if (!photo || !currentUser) return;

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('photo', photo);
    formData.append('user_id', currentUser.id);
    formData.append('description', description);
    if (motorcycleId) formData.append('motorcycle_id', motorcycleId);

    try {
      const res = await fetch('/api/contests/current/submissions', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        navigate('/events'); // Redirect to events or a dedicated contest page
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to submit photo');
      }
    } catch (err) {
      console.error('Submission failed:', err);
      alert('An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Submit Photo of the Week</h1>
      <form onSubmit={handleSubmit} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-6">
        
        {/* Photo Uploader */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-zinc-700 rounded-xl h-64 flex flex-col items-center justify-center cursor-pointer hover:border-orange-500 transition-colors relative overflow-hidden"
        >
          {preview ? (
            <>
              <img src={preview} alt="Preview" className="w-full h-full object-cover" />
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); setPhoto(null); setPreview(null); }}
                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center text-zinc-500">
              <Upload className="w-12 h-12 mb-2" />
              <p>Click to upload photo</p>
            </div>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
        </div>

        {/* Description */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description of your photo..."
          className="w-full bg-zinc-950 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-orange-500"
          rows={3}
        />

        {/* Motorcycle Selector */}
        <select
          value={motorcycleId}
          onChange={(e) => setMotorcycleId(e.target.value)}
          className="w-full bg-zinc-950 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-orange-500"
        >
          <option value="">Select your motorcycle (optional)</option>
          {motorcycles.map((moto: any) => (
            <option key={moto.id} value={moto.id}>{moto.make} {moto.model} ({moto.year})</option>
          ))}
        </select>

        <button
          type="submit"
          disabled={isSubmitting || !photo}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Entry'}
        </button>
      </form>
    </div>
  );
}
