import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Building2, ArrowRight, ArrowLeft, Check, 
  MapPin, Wrench, Coffee, Camera, Shield, Zap,
  Navigation, Users, Calendar, Store
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

import LocationAutocomplete from '../components/LocationAutocomplete';

type ProfileType = 'rider' | 'ecosystem' | null;

interface OnboardingData {
  type: ProfileType;
  username: string;
  email: string;
  password?: string;
  fullName: string;
  bio: string;
  location: string;
  motorcycle: string;
  bloodType?: string;
  businessName: string;
  businessType: string;
  interests: string[];
  services: string[];
  referralCode?: string;
}

const RIDER_INTERESTS = [
  { id: 'touring', label: 'onboarding.interest.touring', icon: Navigation },
  { id: 'track', label: 'onboarding.interest.track', icon: Zap },
  { id: 'custom', label: 'onboarding.interest.custom', icon: Wrench },
  { id: 'photography', label: 'onboarding.interest.photography', icon: Camera },
  { id: 'meetups', label: 'onboarding.interest.meetups', icon: Users },
  { id: 'safety', label: 'onboarding.interest.safety', icon: Shield },
];

const ECOSYSTEM_SERVICES = [
  { id: 'cafe', label: 'onboarding.service.cafe', icon: Coffee },
  { id: 'gear', label: 'onboarding.service.gear', icon: Store },
  { id: 'mechanic', label: 'onboarding.service.mechanic', icon: Wrench },
  { id: 'events', label: 'onboarding.service.events', icon: Calendar },
  { id: 'tours', label: 'onboarding.service.tours', icon: Navigation },
  { id: 'club', label: 'onboarding.service.club', icon: Users },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Check if user came from Google OAuth
  const isGoogleAuth = location.state?.fromGoogleAuth;
  const googleData = location.state?.googleData;

  const handleCustomGoogleLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || clientId === "your-google-client-id.apps.googleusercontent.com") {
      setError('Missing Google Client ID. Please configure VITE_GOOGLE_CLIENT_ID in AI Studio Config/Secrets.');
      return;
    }
    
    const redirectUri = window.location.origin + '/auth/callback';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token&scope=openid%20email%20profile&nonce=random_nonce_${Date.now()}`;
    
    window.open(authUrl, 'google_oauth', 'width=500,height=600');
  };

  const handleGoogleResponse = async (response: any) => {
    setLoading(true);
    setError('');
    try {
      const referralCode = new URLSearchParams(window.location.search).get('ref');
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          credential: response.credential,
          referralCode
        }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Non-JSON response from Google Auth:", text);
        throw new Error(`Server returned an error: ${res.statusText}. Check console.`);
      }

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Google registration failed');

      localStorage.setItem('user', JSON.stringify(result.user));
      localStorage.setItem('token', result.token);
      window.dispatchEvent(new Event('auth-change'));
      
      if (result.isNewUser) {
        // Since we are already in onboarding, we can just jump to step 1 but set googleData
        setData(prev => ({
          ...prev,
          username: result.googleData.username || prev.username,
          email: result.googleData.email || prev.email,
          fullName: result.googleData.name || prev.fullName
        }));
        // We set location.state artificially so useEffect will trigger correctly on step 2
        window.history.replaceState({ 
          fromGoogleAuth: true,
          googleData: result.googleData
        }, '');
        setStep(1); // Proceed to profile type selection
      } else {
        navigate(`/profile/${result.user.username}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // The /auth/callback page is always served from this origin, so only same-origin messages are valid.
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'OAUTH_AUTH_SUCCESS' && e.data?.credential) {
        handleGoogleResponse({ credential: e.data.credential });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const [data, setData] = useState<OnboardingData>({
    type: null,
    username: googleData?.username || '',
    email: googleData?.email || '',
    password: '',
    fullName: googleData?.name || '',
    bio: '',
    location: '',
    motorcycle: '',
    bloodType: '',
    businessName: '',
    businessType: '',
    interests: [],
    services: [],
    referralCode: new URLSearchParams(window.location.search).get('ref') || ''
  });

  const totalSteps = data.type === 'rider' ? 5 : 5;

  // Auto-advance if Google Auth provided basic info
  useEffect(() => {
    if (isGoogleAuth && step === 2) {
      // Skip account creation step if coming from Google
      setStep(3);
    }
  }, [isGoogleAuth, step]);

  const handleNext = () => {
    // Basic validation before proceeding
    if (step === 2 && !isGoogleAuth) {
      if (!data.email || !data.username || !data.password) {
        setError(t('onboarding.errorFields'));
        return;
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        setError(t('onboarding.invalidEmail'));
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(data.username)) {
        setError(t('onboarding.invalidUsername'));
        return;
      }

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(data.password)) {
        setError(t('onboarding.invalidPassword'));
        return;
      }
    }
    if (step === 3) {
      if (!data.location || !data.fullName) {
        setError(t('onboarding.errorFields'));
        return;
      }
      if (data.fullName.length < 2) {
        setError(t('onboarding.invalidFullName'));
        return;
      }
    }
    if (step === 4 && data.type === 'ecosystem') {
      if (!data.businessName || !data.businessType) {
        setError(t('onboarding.errorBusiness'));
        return;
      }
    }
    if (step === 4 && data.type === 'rider') {
      if (!data.motorcycle) {
        setError(t('onboarding.errorMotorcycle'));
        return;
      }
    }
    if (step === 5) {
      if (data.type === 'rider' && data.interests.length === 0) {
        setError(t('onboarding.errorInterest'));
        return;
      }
      if (data.type === 'ecosystem' && data.services.length === 0) {
        setError(t('onboarding.errorService'));
        return;
      }
    }

    setError('');
    proceedToNext();
  };

  const handleSkip = () => {
    setError('');
    proceedToNext();
  };

  const proceedToNext = () => {
    if (step < totalSteps) {
      setStep(s => s + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(s => s - 1);
    }
  };

  const toggleInterest = (id: string) => {
    setData(prev => ({
      ...prev,
      interests: prev.interests.includes(id)
        ? prev.interests.filter(i => i !== id)
        : [...prev.interests, id]
    }));
  };

  const toggleService = (id: string) => {
    setData(prev => ({
      ...prev,
      services: prev.services.includes(id)
        ? prev.services.filter(s => s !== id)
        : [...prev.services, id]
    }));
  };

  const [showWelcome, setShowWelcome] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      // If coming from Google Auth, we update the existing user
      // Otherwise, we create a new user
      const endpoint = isGoogleAuth ? '/api/user/onboarding' : '/api/register';
      const method = isGoogleAuth ? 'PUT' : 'POST';

      // Prepare payload based on type
      const payload = {
        ...data,
        // Ensure we send the right fields based on type
        ...(data.type === 'rider' ? {
          businessName: undefined,
          businessType: undefined,
          services: undefined
        } : {
          motorcycle: undefined,
          interests: undefined
        })
      };

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(isGoogleAuth ? { 'Authorization': `Bearer ${localStorage.getItem('token')}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.details) {
          const messages = Object.entries(result.details)
            .filter(([key]) => key !== '_errors')
            .map(([key, value]: [string, any]) => `${key}: ${value._errors.join(', ')}`)
            .join(' | ');
          throw new Error(`${result.error}: ${messages}`);
        }
        throw new Error(result.error || t('onboarding.errorComplete'));
      }

      if (data.type === 'ecosystem') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth-change'));
      } else if (!isGoogleAuth && result.token) {
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify({
          id: result.id,
          username: result.username,
          role: 'user',
          type: data.type,
          status: 'active'
        }));
        window.dispatchEvent(new Event('auth-change'));
      } else if (isGoogleAuth) {
        let currentUser = {};
        try {
          const stored = localStorage.getItem('user');
          if (stored) currentUser = JSON.parse(stored);
        } catch (e) {
          console.error("Corrupted localStorage user:", e);
        }
        
        localStorage.setItem('user', JSON.stringify({
          ...currentUser,
          username: result.username || (currentUser as any).username,
          type: data.type,
          status: 'active'
        }));
        window.dispatchEvent(new Event('auth-change'));
      }

      setShowWelcome(true);
      setTimeout(() => {
        // Redirect based on type
        if (data.type === 'ecosystem') {
          navigate('/login', { state: { message: t('onboarding.successMessage') } });
        } else {
          navigate(`/profile/${result.username || data.username}`);
        }
      }, 3000);

    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="w-full max-w-md mx-auto mb-8">
      <div className="flex justify-between items-center relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-inverse/10 rounded-full" />
        <motion.div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full"
          initial={{ width: '0%' }}
          animate={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div 
            key={i}
            className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-300 ${
              step > i + 1 ? 'bg-primary text-inverse' : 
              step === i + 1 ? 'bg-primary text-inverse ring-4 ring-primary/30' : 
              'bg-engine text-steel'
            }`}
          >
            {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100dvh-5rem)] bg-engine text-chrome flex flex-col items-center py-8 px-4 relative overflow-y-auto overflow-x-hidden">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 mt-8 mb-16">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-black italic tracking-tight text-chrome mb-2">
            CAFE<span className="text-primary">777</span>
          </h1>
          <p className="text-steel">
            {step === 0 && t('onboarding.step0Desc') || 'Choose how you want to join Cafe777'}
            {step === 1 && t('onboarding.step1Desc')}
            {step === 2 && t('onboarding.step2Desc')}
            {step === 3 && t('onboarding.step3Desc')}
            {step === 4 && data.type === 'rider' && t('onboarding.step4RiderDesc')}
            {step === 4 && data.type === 'ecosystem' && t('onboarding.step4EcosystemDesc')}
            {step === 5 && data.type === 'rider' && t('onboarding.step5RiderDesc')}
            {step === 5 && data.type === 'ecosystem' && t('onboarding.step5EcosystemDesc')}
          </p>
        </div>

        {step > 0 && renderStepIndicator()}

        {error && (
          <div className="mb-6 p-4 bg-error/10 border border-error/50 rounded-xl text-error text-sm text-center">
            {error}
          </div>
        )}

        <div className="bg-oil/80 backdrop-blur-xl border border-inverse/10 rounded-3xl p-6 shadow-2xl">
          <AnimatePresence mode="wait">
            {/* STEP 0: Registration Method */}
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <button
                  type="button"
                  onClick={handleCustomGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-4 border border-inverse/20 bg-engine shadow-sm rounded-2xl hover:bg-inverse/5 hover:border-primary/50 transition-all text-inverse font-bold"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span>{loading ? t('onboarding.processing') : t('onboarding.regWithGoogle')}</span>
                </button>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-inverse/10"></div>
                  <span className="flex-shrink-0 mx-4 text-steel text-[10px] uppercase tracking-widest font-mono">or</span>
                  <div className="flex-grow border-t border-inverse/10"></div>
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStep(1)}
                  className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-primary text-inverse border border-primary/20 shadow-sm rounded-2xl hover:bg-primary/90 transition-all font-bold"
                >
                  <User className="w-5 h-5 text-inverse/70" />
                  <span>{t('onboarding.regWithEmail')}</span>
                </button>
              </motion.div>
            )}

            {/* STEP 1: Profile Type */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <button
                  onClick={() => { setData({ ...data, type: 'rider' }); handleNext(); }}
                  className={`w-full p-6 rounded-2xl border-2 text-left transition-all duration-300 group ${
                    data.type === 'rider' 
                      ? 'bg-primary/10 border-primary' 
                      : 'bg-engine/50 border-transparent hover:bg-engine hover:border-inverse/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-xl ${data.type === 'rider' ? 'bg-primary text-inverse' : 'bg-engine text-chrome group-hover:bg-engine'}`}>
                      <User className="w-6 h-6" />
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${data.type === 'rider' ? 'border-primary' : 'border-inverse/20'}`}>
                      {data.type === 'rider' && <div className="w-3 h-3 bg-primary rounded-full" />}
                    </div>
                  </div>
                  <h3 className="font-display font-bold text-xl text-chrome mb-2">{t('onboarding.imRider')}</h3>
                  <p className="text-steel text-sm">{t('onboarding.riderDesc')}</p>
                </button>

                <button
                  onClick={() => { setData({ ...data, type: 'ecosystem' }); handleNext(); }}
                  className={`w-full p-6 rounded-2xl border-2 text-left transition-all duration-300 group ${
                    data.type === 'ecosystem' 
                      ? 'bg-primary/10 border-primary' 
                      : 'bg-engine/50 border-transparent hover:bg-engine hover:border-inverse/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-xl ${data.type === 'ecosystem' ? 'bg-primary text-inverse' : 'bg-engine text-chrome group-hover:bg-engine'}`}>
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${data.type === 'ecosystem' ? 'border-primary' : 'border-inverse/20'}`}>
                      {data.type === 'ecosystem' && <div className="w-3 h-3 bg-primary rounded-full" />}
                    </div>
                  </div>
                  <h3 className="font-display font-bold text-xl text-chrome mb-2">{t('onboarding.imBusiness')}</h3>
                  <p className="text-steel text-sm">{t('onboarding.businessDesc')}</p>
                </button>
              </motion.div>
            )}

            {/* STEP 2: Account Details (Skipped if Google Auth) */}
            {step === 2 && !isGoogleAuth && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('profile.username')}</label>
                  <input
                    type="text"
                    autoCapitalize="sentences"
                    value={data.username || ''}
                    onChange={(e) => setData({ ...data, username: e.target.value })}
                    className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    placeholder={t('onboarding.usernamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('login.email')}</label>
                  <input
                    type="email"
                    value={data.email || ''}
                    onChange={(e) => setData({ ...data, email: e.target.value })}
                    className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    placeholder={t('onboarding.emailPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('login.password')}</label>
                  <input
                    type="password"
                    value={data.password || ''}
                    onChange={(e) => setData({ ...data, password: e.target.value })}
                    name="password"
                    className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    placeholder="••••••••"
                  />
                </div>
              </motion.div>
            )}

            {/* STEP 3: Basic Profile */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('profile.fullName')}</label>
                  <input
                    type="text"
                    autoCapitalize="sentences"
                    value={data.fullName || ''}
                    onChange={(e) => setData({ ...data, fullName: e.target.value })}
                    className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    placeholder={t('onboarding.fullNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('profile.city')}</label>
                  <LocationAutocomplete
                    value={data.location}
                    onChange={(val) => setData({ ...data, location: val })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('profile.detailsBio')}</label>
                  <textarea
                    value={data.bio || ''}
                    autoCapitalize="sentences"
                    onChange={(e) => setData({ ...data, bio: e.target.value })}
                    className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors h-24 resize-none"
                    placeholder={t('onboarding.bioPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('profile.referral') || 'Referral Code (Optional)'}</label>
                  <input
                    type="text"
                    autoCapitalize="sentences"
                    value={data.referralCode || ''}
                    onChange={(e) => setData({ ...data, referralCode: e.target.value.toUpperCase() })}
                    className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors uppercase"
                    placeholder={t('onboarding.referralPlaceholder')}
                  />
                </div>
              </motion.div>
            )}

            {/* STEP 4: Specific Info (Motorcycle or Business) */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {data.type === 'rider' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('profile.motorcycle') || 'Current Motorcycle'}</label>
                      <input
                        type="text"
                        autoCapitalize="sentences"
                        value={data.motorcycle || ''}
                        onChange={(e) => setData({ ...data, motorcycle: e.target.value })}
                        className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                        placeholder={t('onboarding.motorcyclePlaceholder')}
                      />
                      <p className="text-xs text-steel mt-2">{t('onboarding.motorcycleHint')}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('profile.bloodType') || 'Blood Type (Optional)'}</label>
                      <select
                        value={data.bloodType || ''}
                        onChange={(e) => setData({ ...data, bloodType: e.target.value })}
                        className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors appearance-none"
                      >
                        <option value="">{t('onboarding.selectBloodType') || 'Select Blood Type'}</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('profile.companyName')}</label>
                      <input
                        type="text"
                        autoCapitalize="sentences"
                        value={data.businessName || ''}
                        onChange={(e) => setData({ ...data, businessName: e.target.value })}
                        className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                        placeholder={t('onboarding.businessNamePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-steel uppercase tracking-wider mb-2">{t('profile.category')}</label>
                      <select
                        value={data.businessType || ''}
                        onChange={(e) => setData({ ...data, businessType: e.target.value })}
                        className="w-full bg-oil/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors appearance-none"
                      >
                        <option value="" disabled>{t('onboarding.businessTypeSelect')}</option>
                        <option value="cafe">{t('category.repair')}</option>
                        <option value="shop">{t('category.dealership')}</option>
                        <option value="workshop">{t('category.parts')}</option>
                        <option value="club">{t('category.club')}</option>
                        <option value="other">{t('category.other')}</option>
                      </select>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* STEP 5: Interests / Services */}
            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  {data.type === 'rider' ? (
                    RIDER_INTERESTS.map(interest => (
                      <button
                        key={interest.id}
                        onClick={() => toggleInterest(interest.id)}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${
                          data.interests.includes(interest.id)
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-engine/50 border-inverse/5 text-steel hover:bg-engine hover:border-inverse/20'
                        }`}
                      >
                        <interest.icon className="w-6 h-6 mb-2" />
                        <span className="text-xs font-medium text-center">{t(interest.label)}</span>
                      </button>
                    ))
                  ) : (
                    ECOSYSTEM_SERVICES.map(service => (
                      <button
                        key={service.id}
                        onClick={() => toggleService(service.id)}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${
                          data.services.includes(service.id)
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-engine/50 border-inverse/5 text-steel hover:bg-engine hover:border-inverse/20'
                        }`}
                      >
                        <service.icon className="w-6 h-6 mb-2" />
                        <span className="text-xs font-medium text-center">{t(service.label)}</span>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Buttons */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="w-full flex items-center justify-between">
            {step > 1 ? (
              <button
                onClick={handleBack}
                className="flex items-center space-x-2 text-steel hover:text-chrome transition-colors px-4 py-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">{t('onboarding.back')}</span>
              </button>
            ) : (
              <div /> // Spacer
            )}

            {step > 1 && (
              <button
                onClick={handleNext}
                disabled={loading}
                className="flex items-center space-x-2 bg-primary text-inverse px-6 py-3 rounded-full font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-inverse/20 border-t-inverse rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{step === totalSteps ? t('onboarding.complete') : t('onboarding.continue')}</span>
                    {step < totalSteps && <ArrowRight className="w-5 h-5" />}
                  </>
                )}
              </button>
            )}
          </div>
          
          {(step === 4 || step === 5) && (
            <button 
              onClick={handleSkip} 
              disabled={loading}
              className="text-xs text-steel hover:text-chrome transition-colors underline underline-offset-4 disabled:opacity-50"
            >
              {t('onboarding.skipForNow')}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-engine/90 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="text-center"
            >
              <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-3xl font-display font-black uppercase italic text-chrome mb-2">
                {t('onboarding.welcomeTitle')}
              </h2>
              <p className="text-steel font-mono text-sm uppercase tracking-widest">
                {t('onboarding.welcomeSubtitle')}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
