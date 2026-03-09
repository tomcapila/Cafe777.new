import React from 'react';
import { Link } from 'react-router-dom';
import { X, MapPin, Calendar, Camera, Bell, User, LogOut, Bike } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onLogout: () => void;
}

export default function SideMenu({ isOpen, onClose, user, onLogout }: SideMenuProps) {
  const { t } = useLanguage();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-80 bg-zinc-900 border-l border-white/10 p-8 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between mb-12">
          <Link to="/" onClick={onClose} className="flex items-center gap-3 group">
            <div className="bg-primary p-2 rounded-xl group-hover:bg-oil transition-all shadow-lg shadow-primary/20">
              <Bike className="w-5 h-5 text-zinc-950" />
            </div>
            <span className="font-display font-black text-xl tracking-tighter uppercase italic text-white group-hover:text-primary transition-colors">Café777</span>
          </Link>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors bg-zinc-800 p-2 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          <Link to="/map" onClick={onClose} className="flex items-center gap-4 text-lg font-bold text-white hover:text-primary transition-colors p-3 rounded-xl hover:bg-white/10">
            <MapPin className="w-6 h-6" /> {t('nav.map')}
          </Link>
          <Link to="/events" onClick={onClose} className="flex items-center gap-4 text-lg font-bold text-white hover:text-primary transition-colors p-3 rounded-xl hover:bg-white/10">
            <Calendar className="w-6 h-6" /> {t('nav.events')}
          </Link>
          <Link to="/contest" onClick={onClose} className="flex items-center gap-4 text-lg font-bold text-white hover:text-primary transition-colors p-3 rounded-xl hover:bg-white/10">
            <Camera className="w-6 h-6" /> {t('nav.contest')}
          </Link>
          <Link to="/notifications" onClick={onClose} className="flex items-center gap-4 text-lg font-bold text-white hover:text-primary transition-colors p-3 rounded-xl hover:bg-white/10">
            <Bell className="w-6 h-6" /> {t('nav.notifications')}
          </Link>
          {user && (
            <>
              <div className="h-px bg-white/10 my-4" />
              <Link to={`/profile/${user.username}`} onClick={onClose} className="flex items-center gap-4 text-lg font-bold text-white hover:text-primary transition-colors p-3 rounded-xl hover:bg-white/10">
                <User className="w-6 h-6" /> {t('nav.profile')}
              </Link>
              <button onClick={() => { onLogout(); onClose(); }} className="w-full flex items-center gap-4 text-lg font-bold text-red-500 hover:text-red-400 transition-colors p-3 rounded-xl hover:bg-red-500/10">
                <LogOut className="w-6 h-6" /> {t('nav.logout')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
