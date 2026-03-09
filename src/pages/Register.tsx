import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { User, Building2, ArrowRight, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function Register() {
  const navigate = useNavigate();
  const [type, setType] = useState<'rider' | 'ecosystem'>('rider');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { t } = useLanguage();

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

      if (type === 'ecosystem') {
        setSuccess(true);
      } else {
        // Redirect to new profile for riders
        navigate(`/profile/${result.username}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center"
        >
          <div className="bg-zinc-900 rounded-3xl p-8 border border-white/10 shadow-xl">
            <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-10 h-10 text-amber-500" />
            </div>
            <h2 className="text-2xl font-bold mb-4 text-white">{t('register.success')}</h2>
            <p className="text-zinc-400 mb-8">
              {t('register.successDesc')}
            </p>
            <button 
              onClick={() => navigate('/login')}
              className="w-full bg-orange-500 text-zinc-950 font-bold rounded-xl py-3.5 hover:bg-orange-400 transition-colors"
            >
              {t('register.backToLogin')}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h2 className="text-4xl font-display font-black tracking-tighter mb-2 text-primary uppercase italic">{t('nav.join')}</h2>
          <p className="text-zinc-400 font-light">{t('register.subtitle')}</p>
        </div>

        <div className="glass-card p-8 shadow-2xl shadow-primary/5">
          {/* Type Selector */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <button
              type="button"
              onClick={() => setType('rider')}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                type === 'rider' 
                  ? 'bg-primary/10 border-primary text-primary shadow-lg shadow-primary/10' 
                  : 'bg-zinc-950 border-white/5 text-zinc-500 hover:border-white/20'
              }`}
            >
              <User className="w-6 h-6" />
              <span className="font-display font-bold text-xs uppercase tracking-widest">{t('register.type.rider')}</span>
            </button>
            <button
              type="button"
              onClick={() => setType('ecosystem')}
              className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all ${
                type === 'ecosystem' 
                  ? 'bg-primary/10 border-primary text-primary shadow-lg shadow-primary/10' 
                  : 'bg-zinc-950 border-white/5 text-zinc-500 hover:border-white/20'
              }`}
            >
              <Building2 className="w-6 h-6" />
              <span className="font-display font-bold text-xs uppercase tracking-widest">{t('register.type.ecosystem')}</span>
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-accent/10 border border-accent/20 rounded-xl text-accent text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('login.email')}</label>
              <input 
                type="email" 
                name="email" 
                required
                className="input-field"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('login.password')}</label>
              <input 
                type="password" 
                name="password" 
                required
                className="input-field"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('register.username')}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 select-none font-mono text-[10px] uppercase">moto.app/</span>
                <input 
                  type="text" 
                  name="username" 
                  required
                  pattern="[a-zA-Z0-9_]+"
                  className="input-field pl-24"
                  placeholder="username"
                />
              </div>
            </div>

            {type === 'rider' ? (
              <>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('register.fullName')}</label>
                  <input 
                    type="text" 
                    name="name" 
                    required
                    className="input-field"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('register.age')}</label>
                    <input 
                      type="number" 
                      name="age" 
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('register.city')}</label>
                    <input 
                      type="text" 
                      name="city" 
                      className="input-field"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('register.companyName')}</label>
                  <input 
                    type="text" 
                    name="company_name" 
                    required
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('register.category')}</label>
                  <select 
                    name="service_category"
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
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('register.address')}</label>
                  <input 
                    type="text" 
                    name="full_address" 
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">{t('register.bio')}</label>
                  <textarea 
                    name="details" 
                    rows={3}
                    className="input-field resize-none"
                  />
                </div>
              </>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full btn-primary py-4 mt-4"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                <div className="flex items-center justify-center gap-2">
                  {t('register.create')}
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
