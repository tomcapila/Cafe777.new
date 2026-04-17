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
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Check if user came from Google OAuth
  const isGoogleAuth = location.state?.fromGoogleAuth;
  const googleData = location.state?.googleData;

  const [data, setData] = useState<OnboardingData>({
    type: null,
    username: googleData?.username || '',
    email: googleData?.email || '',
    password: '',
    fullName: googleData?.name || '',
    bio: '',
    location: '',
    motorcycle: '',
    businessName: '',
    businessType: '',
    interests: [],
    services: [],
    referralCode: ''
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
        setError("Invalid email format");
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(data.username)) {
        setError("Username must be 3-30 characters and contain only letters, numbers, and underscores");
        return;
      }

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!passwordRegex.test(data.password)) {
        setError("Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number and one special character");
        return;
      }
    }
    if (step === 3) {
      if (!data.location || !data.fullName) {
        setError(t('onboarding.errorFields'));
        return;
      }
      if (data.fullName.length < 2) {
        setError("Full name must be at least 2 characters");
        return;
      }
    }
    if (step === 4 && data.type === 'ecosystem') {
      if (!data.businessName || !data.businessType) {
        setError(t('onboarding.errorBusiness'));
        return;
      }
    }
    if (step === 4 && data.type === 'rider' && !isGoogleAuth) {
      if (!data.motorcycle) {
        setError(t('onboarding.errorMotorcycle'));
        return;
      }
    }
    if (step === 5 && !isGoogleAuth) {
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
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({
          ...currentUser,
          username: result.username || currentUser.username,
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
            {step === 1 && t('onboarding.step1Desc')}
            {step === 2 && t('onboarding.step2Desc')}
            {step === 3 && t('onboarding.step3Desc')}
            {step === 4 && data.type === 'rider' && t('onboarding.step4RiderDesc')}
            {step === 4 && data.type === 'ecosystem' && t('onboarding.step4EcosystemDesc')}
            {step === 5 && data.type === 'rider' && t('onboarding.step5RiderDesc')}
            {step === 5 && data.type === 'ecosystem' && t('onboarding.step5EcosystemDesc')}
          </p>
        </div>

        {renderStepIndicator()}

        {error && (
          <div className="mb-6 p-4 bg-error/10 border border-error/50 rounded-xl text-error text-sm text-center">
            {error}
          </div>
        )}

        <div className="bg-oil/80 backdrop-blur-xl border border-inverse/10 rounded-3xl p-6 shadow-2xl">
          <AnimatePresence mode="wait">
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
