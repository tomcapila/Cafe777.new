import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';

import { useLanguage } from '../contexts/LanguageContext';

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send reset link');
      setMessage(t('forgotPassword.success'));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-engine p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-oil p-8 rounded-lg shadow-xl"
      >
        <button onClick={() => navigate('/login')} className="text-steel hover:text-chrome mb-6 flex items-center gap-2">
          <ArrowLeft size={16} /> {t('forgotPassword.backToLogin')}
        </button>
        <h1 className="text-2xl font-bold text-chrome mb-6">{t('forgotPassword.title')}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-steel mb-1">{t('forgotPassword.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-engine text-chrome p-2 rounded border border-inverse/10 focus:border-primary outline-none"
              placeholder="you@example.com"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-inverse p-2 rounded font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
            {t('forgotPassword.sendLink')}
          </button>
        </form>
        {message && <p className="mt-4 text-success text-sm">{message}</p>}
        {error && <p className="mt-4 text-error text-sm">{error}</p>}
      </motion.div>
    </div>
  );
}
