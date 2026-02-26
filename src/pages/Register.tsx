import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Building2, ArrowRight, Loader2 } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const [type, setType] = useState<'rider' | 'ecosystem'>('rider');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    // Add type to payload
    const payload = { ...data, type };

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to register');
      }

      // Redirect to new profile
      navigate(`/profile/${result.username}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold tracking-tight mb-2">Join the Network</h2>
          <p className="text-zinc-400">Create your unique profile page</p>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-8 border border-white/10 shadow-xl">
          {/* Type Selector */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <button
              type="button"
              onClick={() => setType('rider')}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                type === 'rider' 
                  ? 'bg-orange-500/10 border-orange-500 text-orange-400' 
                  : 'bg-zinc-950 border-white/5 text-zinc-400 hover:border-white/20'
              }`}
            >
              <User className="w-6 h-6" />
              <span className="font-medium text-sm">Rider</span>
            </button>
            <button
              type="button"
              onClick={() => setType('ecosystem')}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                type === 'ecosystem' 
                  ? 'bg-orange-500/10 border-orange-500 text-orange-400' 
                  : 'bg-zinc-950 border-white/5 text-zinc-400 hover:border-white/20'
              }`}
            >
              <Building2 className="w-6 h-6" />
              <span className="font-medium text-sm">Ecosystem</span>
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Email Address</label>
              <input 
                type="email" 
                name="email" 
                required
                className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Password</label>
              <input 
                type="password" 
                name="password" 
                required
                className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Username (URL)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 select-none">moto.app/</span>
                <input 
                  type="text" 
                  name="username" 
                  required
                  pattern="[a-zA-Z0-9_]+"
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 pl-24 pr-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                  placeholder="username"
                />
              </div>
            </div>

            {type === 'rider' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Full Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    required
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">Age</label>
                    <input 
                      type="number" 
                      name="age" 
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">City</label>
                    <input 
                      type="text" 
                      name="city" 
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
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Category</label>
                  <select 
                    name="service_category"
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
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">Details / Bio</label>
                  <textarea 
                    name="details" 
                    rows={3}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all resize-none"
                  />
                </div>
              </>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-orange-500 text-zinc-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Create Profile
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
