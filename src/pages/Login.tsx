import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, Loader2, ArrowRight, Play } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showVideo, setShowVideo] = useState(true);
  const [videoStarted, setVideoStarted] = useState(false);

  const handleVideoEnd = () => {
    setShowVideo(false);
  };

  const startVideo = () => {
    setVideoStarted(true);
  };

  useEffect(() => {
    if (videoStarted && videoRef.current) {
      videoRef.current.play().catch(err => {
        // AbortError is often benign (e.g. user skipped)
        if (err.name !== 'AbortError') {
          console.error("Video play failed:", err);
          setShowVideo(false); // Fallback if video fails
        }
      });
    }
  }, [videoStarted]);

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
            {!videoStarted && (
              <button 
                onClick={startVideo}
                className="group flex flex-col items-center gap-4 text-white hover:text-orange-500 transition-colors"
              >
                <div className="w-20 h-20 rounded-full border-2 border-white/20 flex items-center justify-center group-hover:border-orange-500/50 group-hover:bg-orange-500/10 transition-all">
                  <Play className="w-8 h-8 fill-current" />
                </div>
                <span className="font-bold tracking-widest text-sm uppercase">Enter Café777</span>
              </button>
            )}
            <video
              ref={videoRef}
              onEnded={handleVideoEnd}
              className={`w-full h-full object-cover transition-opacity duration-1000 ${!videoStarted ? 'opacity-0' : 'opacity-100'}`}
              playsInline
              preload="auto"
            >
              <source src="./src/intro.webm" type="video/webm" />
            </video>
            
            {videoStarted && (
              <button 
                onClick={() => setShowVideo(false)}
                className="absolute bottom-8 right-8 text-white/50 hover:text-white text-sm font-medium transition-colors"
              >
                Skip Intro
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
              <h2 className="text-3xl font-bold tracking-tight mb-2 text-orange-500">Welcome Back</h2>
              <p className="text-zinc-400">Login to Café777</p>
            </div>

            <div className="bg-zinc-900 rounded-3xl p-8 border border-white/10 shadow-xl">
              {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
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

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-orange-500 text-zinc-950 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Login
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-white/5 text-center">
                <p className="text-zinc-500 text-sm">
                  Don't have an account?{' '}
                  <Link to="/register" className="text-orange-500 hover:text-orange-400 font-medium">
                    Join the Network
                  </Link>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
