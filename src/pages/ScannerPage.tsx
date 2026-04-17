import { fetchWithAuth } from '../utils/api';
import React, { useState } from 'react';
import QRScanner from '../components/QRScanner';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, MapPin, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function ScannerPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'scanning' | 'processing' | 'success' | 'error'>('scanning');
  const [message, setMessage] = useState('');

  const handleScan = async (data: string) => {
    if (status !== 'scanning') return;
    setStatus('processing');
    
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) {
        setStatus('error');
        setMessage(t('scanner.loginRequired'));
        return;
      }
      const user = JSON.parse(userStr);

      let targetType = '';
      let targetId = '';
      let extraData = {};

      // Try parsing as JSON first
      try {
        const parsed = JSON.parse(data);
        targetType = parsed.target_type;
        targetId = parsed.target_id;
        if (parsed.route_id) extraData = { route_id: parsed.route_id, type: parsed.type };
      } catch (e) {
        // Fallback for simple string format like "stamp:1:2"
        const parts = data.split(':');
        if (parts.length >= 2) {
          targetType = parts[0];
          targetId = parts[1];
        } else {
          throw new Error(t('review.invalidQR'));
        }
      }

      if (targetType === 'stamp') {
        // Get current location
        let lat = 0;
        let lng = 0;
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        } catch (geoErr) {
          console.warn('Geolocation failed, using default coordinates', geoErr);
        }

        // Handle Passport Stamp
        const res = await fetchWithAuth('/api/stamps/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            stamp_id: targetId,
            location_lat: lat,
            location_lng: lng
          })
        });

        if (res.ok) {
          setStatus('success');
          setMessage(t('scanner.stampCollected'));
          setTimeout(() => navigate(`/profile/${user.username}?tab=biker_passport`), 2000);
        } else {
          const errData = await res.json();
          throw new Error(errData.error || t('scanner.failed'));
        }
      } else if (targetType === 'checkpoint') {
        // Get current location
        let lat = 0;
        let lng = 0;
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        } catch (geoErr) {
          console.warn('Geolocation failed, using default coordinates', geoErr);
        }

        // Handle Route Checkpoint
        const res = await fetchWithAuth('/api/checkpoints/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            checkpoint_id: targetId,
            location_lat: lat,
            location_lng: lng,
            ...extraData
          })
        });

        if (res.ok) {
          setStatus('success');
          setMessage(t('scanner.checkpointVerified'));
          setTimeout(() => navigate('/map'), 2000);
        } else {
          const errData = await res.json();
          throw new Error(errData.error || t('scanner.failed'));
        }
      } else {
        throw new Error(t('review.invalidQR'));
      }

    } catch (err: any) {
      console.error('Scan error:', err);
      setStatus('error');
      setMessage(err.message || t('scanner.failed'));
      setTimeout(() => setStatus('scanning'), 3000);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-5rem)] pt-24 pb-28 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-display font-black uppercase italic tracking-tight mb-2">{t('scanner.title')}</h2>
          <p className="text-steel font-light">{t('scanner.subtitle')}</p>
        </div>

        <div className="glass-card p-6 border-primary/20 relative overflow-hidden">
          {status === 'scanning' && (
            <div className="rounded-2xl overflow-hidden border-2 border-primary/30">
              <QRScanner onScanSuccess={handleScan} />
            </div>
          )}

          {status === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-chrome font-mono uppercase tracking-widest text-sm">{t('common.loading')}</p>
            </div>
          )}

          {status === 'success' && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="py-12 flex flex-col items-center justify-center text-center"
            >
              <div className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center mb-6 border border-success/30">
                <ShieldCheck className="w-10 h-10 text-success" />
              </div>
              <h3 className="text-2xl font-display font-black uppercase italic text-success mb-2">{t('common.success')}</h3>
              <p className="text-chrome">{message}</p>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="py-12 flex flex-col items-center justify-center text-center"
            >
              <div className="w-20 h-20 bg-error/20 rounded-full flex items-center justify-center mb-6 border border-error/30">
                <AlertTriangle className="w-10 h-10 text-error" />
              </div>
              <h3 className="text-2xl font-display font-black uppercase italic text-error mb-2">{t('common.error')}</h3>
              <p className="text-chrome">{message}</p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
