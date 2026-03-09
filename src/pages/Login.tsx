import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, Loader2, ArrowRight, Play } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function Login() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showVideo, setShowVideo] = useState(true);
  const [videoStarted, setVideoStarted] = useState(false);
  const { t } = useLanguage();

  const handleVideoEnd = () => {
    setShowVideo(false);
  };

  const startVideo = () => {
    setVideoStarted(true);
    if (videoRef.current) {
      videoRef.current.play();
    }
  };

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

      // Store user info in localStorage for this prototype
      localStorage.setItem('user', JSON.stringify(result));
      
      // Dispatch event to notify Navbar and other components
      window.dispatchEvent(new Event('auth-change'));

      // Redirect to profile
      navigate(`/profile/${result.username}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-zinc-950 overflow-hidden">
      <AnimatePresence mode="wait">
        {showVideo ? (
          <motion.div
            key="video-intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black"
          >
            <video
              ref={videoRef}
              muted
              onEnded={handleVideoEnd}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${videoStarted ? 'opacity-100' : 'opacity-0'}`}
              playsInline
              preload="auto"
            >
              <source src="/Intro.webm" type="video/webm" />
            </video>

            {!videoStarted && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={startVideo}
                className="group relative z-10 flex flex-col items-center gap-4 text-white hover:text-orange-500 transition-all"
              >
                <div className="w-20 h-20 rounded-full border-2 border-white/20 flex items-center justify-center group-hover:border-orange-500/50 group-hover:bg-orange-500/10 transition-all">
                  <Play className="w-8 h-8 fill-current" />
                </div>
                <span className="font-bold tracking-widest text-sm uppercase">{t('login.enter')}</span>
              </motion.button>
            )}
            
            {videoStarted && (
              <button 
                onClick={() => setShowVideo(false)}
                className="absolute bottom-8 right-8 text-white/50 hover:text-white text-sm font-medium transition-colors"
              >
                {t('login.skip')}
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="login-form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md relative z-10"
          >
            <div className="text-center mb-8">
              <h2 className="text-4xl font-display font-black tracking-tighter mb-2 text-primary uppercase italic">{t('login.welcome')}</h2>
              <p className="text-zinc-400 font-light">{t('login.subtitle')}</p>
            </div>

            <div className="glass-card p-8 shadow-2xl shadow-primary/5">
              {error && (
                <div className="mb-6 p-4 bg-accent/10 border border-accent/20 rounded-xl text-accent text-sm font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
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

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full btn-primary py-4"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      {t('nav.login')}
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-white/5 text-center space-y-4">
                <p className="text-zinc-500 text-sm">
                  {t('login.noAccount')}{' '}
                  <Link to="/register" className="text-orange-500 hover:text-orange-400 font-medium">
                    {t('nav.join')}
                  </Link>
                </p>
                <div className="pt-2">
                  <Link to="/admin/login" className="text-zinc-600 hover:text-zinc-400 text-xs font-mono uppercase tracking-wider transition-colors">
                    {t('login.admin')}
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
