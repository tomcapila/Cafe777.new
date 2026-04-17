import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, Loader2, ArrowRight, Play } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(location.state?.message || '');
  const [showVideo, setShowVideo] = useState(true);
  const [videoStarted, setVideoStarted] = useState(true);
  const { t } = useLanguage();
  
  useEffect(() => {
    if (showVideo && videoRef.current) {
      videoRef.current.play().catch(err => {
        console.log("Autoplay blocked:", err);
        setVideoStarted(false); // Show play button if blocked
      });
    }
  }, [showVideo]);

  const handleGoogleResponse = async (response: any) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Google login failed');

      localStorage.setItem('user', JSON.stringify(result.user));
      localStorage.setItem('token', result.token);
      window.dispatchEvent(new Event('auth-change'));
      
      if (result.isNewUser) {
        navigate('/onboarding', { 
          state: { 
            fromGoogleAuth: true,
            googleData: result.googleData
          } 
        });
      } else {
        navigate(`/profile/${result.user.username}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleResponseRef = useRef<any>(null);
  handleGoogleResponseRef.current = handleGoogleResponse;

  useEffect(() => {
    const initGoogle = () => {
      if (!showVideo && typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
        // Initialize only once per session to avoid GSI_LOGGER warning
        if (!(window as any).google_gsi_initialized) {
          (window as any).google.accounts.id.initialize({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
            callback: (response: any) => {
              if (handleGoogleResponseRef.current) {
                handleGoogleResponseRef.current(response);
              }
            },
          });
          (window as any).google_gsi_initialized = true;
        }

        const googleDiv = document.getElementById("googleSignInDiv");
        if (googleDiv) {
          (window as any).google.accounts.id.renderButton(
            googleDiv,
            { theme: "outline", size: "large", width: "100%" }
          );
          return true;
        }
      }
      return false;
    };

    if (!initGoogle()) {
      const interval = setInterval(() => {
        if (initGoogle()) clearInterval(interval);
      }, 500);
      return () => clearInterval(interval);
    }
  }, [t, showVideo]);

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

      // Store user info and token in localStorage
      localStorage.setItem('user', JSON.stringify(result.user));
      localStorage.setItem('token', result.token);
      
      // Dispatch event to notify Navbar and other components
      window.dispatchEvent(new Event('auth-change'));

      // Redirect to profile
      navigate(`/profile/${result.user.username}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-engine overflow-hidden">
      <AnimatePresence mode="wait">
        {showVideo ? (
          <motion.div
            key="video-intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.8 }}
            onClick={() => setShowVideo(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-engine cursor-pointer"
          >
            <video
              ref={videoRef}
              autoPlay
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
                onClick={(e) => { e.stopPropagation(); startVideo(); }}
                className="group relative z-10 flex flex-col items-center gap-4 text-chrome hover:text-primary transition-all"
              >
                <div className="w-20 h-20 rounded-full border-2 border-inverse/20 flex items-center justify-center group-hover:border-primary/50 group-hover:bg-primary/10 transition-all">
                  <Play className="w-8 h-8 fill-current" />
                </div>
                <span className="font-bold tracking-widest text-sm uppercase">{t('login.enter')}</span>
              </motion.button>
            )}
            
            <button 
              onClick={() => setShowVideo(false)}
              className="absolute bottom-8 right-8 text-chrome/50 hover:text-chrome text-sm font-medium transition-colors z-[60]"
            >
              {t('login.skip') || 'Skip to Login'}
            </button>
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
              <p className="text-steel font-light">{t('login.subtitle')}</p>
            </div>

            <div className="glass-card p-8 shadow-2xl shadow-primary/5">
              {message && (
                <div className="mb-6 p-4 bg-success/10 border border-success/20 rounded-xl text-success text-sm font-medium">
                  {message}
                </div>
              )}
              {error && (
                <div className="mb-6 p-4 bg-accent/10 border border-accent/20 rounded-xl text-accent text-sm font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('login.email')}</label>
                  <input 
                    type="email" 
                    name="email" 
                    autoCapitalize="sentences"
                    required
                    className="input-field"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-widest text-steel mb-2">{t('login.password')}</label>
                  <input 
                    type="password" 
                    name="password" 
                    required
                    className="input-field"
                    placeholder="••••••••"
                  />
                  <div className="text-right mt-2">
                    <a href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</a>
                  </div>
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

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-inverse/5"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-engine px-2 text-steel font-mono tracking-widest">{t('login.orContinueWith')}</span>
                  </div>
                </div>

                <div className="mt-6">
                  <div id="googleSignInDiv" className="min-h-[44px] flex justify-center"></div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-inverse/5 text-center space-y-4">
                <p className="text-steel text-sm">
                  {t('login.noAccount')}{' '}
                  <Link to="/onboarding" className="text-primary hover:text-accent font-medium">
                    {t('nav.join')}
                  </Link>
                </p>
                <div className="pt-2 flex flex-col gap-2">
                  <Link to="/admin/login" className="text-steel hover:text-steel text-xs font-mono uppercase tracking-wider transition-colors">
                    {t('login.admin')}
                  </Link>
                  <Link to="/privacy" className="text-steel/50 hover:text-primary text-[10px] font-mono uppercase tracking-widest transition-colors">
                    Privacy Policy
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
