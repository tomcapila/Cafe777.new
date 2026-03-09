import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, Loader2, ArrowRight, Lock } from 'lucide-react';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      if (user.role === 'admin' || user.role === 'moderator') {
        navigate('/admin');
      }
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Server returned non-JSON response:", text);
        throw new Error(`Server error: Received ${res.status} ${res.statusText}. Please try again later.`);
      }

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Login failed');
      }

      if (result.role !== 'admin' && result.role !== 'moderator') {
        throw new Error('Access denied: Administrator privileges required');
      }

      localStorage.setItem('user', JSON.stringify(result));
      window.dispatchEvent(new Event('auth-change'));
      navigate('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-black relative overflow-hidden grid-pattern">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/5 border border-primary/20 mb-6 shadow-2xl shadow-primary/10">
            <ShieldCheck className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-4xl font-display font-black uppercase italic tracking-tighter mb-2 text-white">Admin Access</h2>
          <p className="text-zinc-600 font-mono text-[10px] uppercase tracking-[0.3em]">Secure Terminal v1.0.4</p>
        </div>

        <div className="glass-card p-10 shadow-2xl border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
          
          {error && (
            <div className="mb-8 p-5 bg-red-500/5 border border-red-500/20 rounded-2xl text-red-400 text-[10px] font-mono uppercase tracking-widest flex items-start gap-4 shadow-xl">
              <Lock className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
            <div>
              <label className="block text-[10px] font-mono font-black text-zinc-600 uppercase tracking-[0.2em] mb-3">Admin Credentials</label>
              <input 
                type="email" 
                name="email" 
                required
                className="input-field"
                placeholder="admin@cafe777.com"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-black text-zinc-600 uppercase tracking-[0.2em] mb-3">Security Key</label>
              <input 
                type="password" 
                name="password" 
                required
                className="input-field"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="btn-primary w-full py-5 text-lg"
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  Authenticate
                  <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-white/5 text-center relative z-10">
            <Link to="/login" className="text-zinc-600 hover:text-primary text-[10px] font-mono font-black uppercase tracking-widest transition-all">
              Standard User Login
            </Link>
          </div>
        </div>

        <div className="mt-10 text-center">
          <p className="text-[10px] text-zinc-800 font-mono uppercase tracking-[0.4em] font-black">
            Authorized Personnel Only • IP Logged
          </p>
        </div>
      </motion.div>
    </div>
  );
}
