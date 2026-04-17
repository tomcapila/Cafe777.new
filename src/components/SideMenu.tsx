import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, MapPin, Camera, Bell, User, LogOut, Bike, 
  Gauge, Users, Calendar, Shield, Settings, HelpCircle,
  ChevronRight, MessageSquare, Crown
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import PremiumBadge from './PremiumBadge';
import { fetchWithAuth } from '../utils/api';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onLogout: () => void;
}

export default function SideMenu({ isOpen, onClose, user, onLogout }: SideMenuProps) {
  const { t } = useLanguage();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [isAmbassador, setIsAmbassador] = useState(false);

  useEffect(() => {
    let interval: any;
    if (user && isOpen) {
      const fetchData = async () => {
        try {
          // Fetch unread messages
          const chatsRes = await fetchWithAuth('/api/chats');
          if (chatsRes.ok) {
            const contentType = chatsRes.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const data = await chatsRes.json();
              const totalUnread = data.reduce((sum: number, chat: any) => sum + (chat.unread_count || 0), 0);
              setUnreadMessagesCount(totalUnread);
            }
          }

          // Fetch ambassador status
          const ambRes = await fetchWithAuth(`/api/ambassadors/${user.id}`);
          if (ambRes.ok) {
            const ambData = await ambRes.json();
            setIsAmbassador(!!ambData);
          }
        } catch (err: any) {
          if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
            console.error('Failed to fetch side menu data:', err);
          }
        }
      };
      
      fetchData();
      interval = setInterval(fetchData, 10000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [user, isOpen]);

  const handleInteraction = () => {
    if (navigator.vibrate) navigator.vibrate(50);
    onClose();
  };

  const menuContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-engine/60 backdrop-blur-sm" 
            onClick={onClose} 
          />
          
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-80 sm:w-96 bg-engine border-l border-inverse/10 flex flex-col shadow-2xl h-full overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-engine/90 backdrop-blur-md p-6 border-b border-inverse/5 flex items-center justify-between">
              <Link to="/" onClick={handleInteraction} className="flex items-center gap-3 group">
                <div className="bg-primary p-2 rounded-xl group-hover:bg-accent transition-all shadow-lg shadow-primary/20">
                  <Bike className="w-5 h-5 text-inverse fill-inverse" />
                </div>
                <span className="font-display font-black text-xl tracking-tighter uppercase italic text-chrome group-hover:text-primary transition-colors">Café777</span>
              </Link>
              <button 
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(50);
                  onClose();
                }} 
                className="text-steel hover:text-chrome transition-colors bg-inverse/5 hover:bg-inverse/10 p-2 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-8 pb-24">
              
              {/* RIDER SECTION */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-steel mb-4 px-3">{t('menu.rider')}</h3>
                {user ? (
                  <Link to={`/profile/${user.username}`} onClick={handleInteraction} className="flex items-center justify-between p-3 rounded-xl hover:bg-inverse/5 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-bold text-chrome group-hover:text-primary transition-colors flex items-center gap-1.5">
                          {user.username}
                          {user.plan === 'premium' && <PremiumBadge size={12} />}
                        </div>
                        <div className="text-xs text-steel">{t('menu.viewProfile')}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-steel group-hover:text-primary transition-colors" />
                  </Link>
                ) : (
                  <Link to="/login" onClick={handleInteraction} className="flex items-center justify-between p-3 rounded-xl hover:bg-inverse/5 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div className="font-bold text-chrome group-hover:text-primary transition-colors">{t('menu.loginRegister')}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-steel group-hover:text-primary transition-colors" />
                  </Link>
                )}
                <Link to="/motorfeed" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <Gauge className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.motorfeed')}</span>
                </Link>
                {user && (
                  <Link to="/messages" onClick={handleInteraction} className="flex items-center justify-between text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                    <div className="flex items-center gap-4">
                      <MessageSquare className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                      <span className="font-bold">{t('menu.messages')}</span>
                    </div>
                    {unreadMessagesCount > 0 && (
                      <span className="bg-primary text-inverse text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {unreadMessagesCount}
                      </span>
                    )}
                  </Link>
                )}
              </div>

              {/* DISCOVER SECTION */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-steel mb-4 px-3">{t('menu.discover')}</h3>
                <Link to="/discover" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <MapPin className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.mapExplorer')}</span>
                </Link>
                <Link to="/roads" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <Bike className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.legendaryRoads')}</span>
                </Link>
                <Link to="/contest" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <Camera className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.photoContest')}</span>
                </Link>
              </div>

              {/* COMMUNITY SECTION */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-steel mb-4 px-3">{t('menu.community')}</h3>
                <Link to="/" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <Users className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.riders')}</span>
                </Link>
                <Link to="/events" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <Calendar className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.events')}</span>
                </Link>
                <Link to="/clubs" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <Shield className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.clubs')}</span>
                </Link>
                {isAmbassador ? (
                  <Link to="/ambassador" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                    <Crown className="w-5 h-5 text-primary group-hover:scale-110 transition-all" /> 
                    <span className="font-bold">{t('menu.ambassadorDashboard')}</span>
                  </Link>
                ) : (
                  <Link to="/ambassador" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                    <Crown className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                    <span className="font-bold">{t('menu.applyAmbassador')}</span>
                  </Link>
                )}
              </div>

              {/* SETTINGS SECTION */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-steel mb-4 px-3">{t('menu.settings')}</h3>
                <Link to="/notifications" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <Bell className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.notifications')}</span>
                </Link>
                <Link to="/" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <Settings className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.appSettings')}</span>
                </Link>
                <Link to="/faq" onClick={handleInteraction} className="flex items-center gap-4 text-chrome hover:text-primary transition-colors p-3 rounded-xl hover:bg-inverse/5 group">
                  <HelpCircle className="w-5 h-5 text-steel group-hover:text-primary transition-colors" /> 
                  <span className="font-bold">{t('menu.helpSupport')}</span>
                </Link>
              </div>

              {user && (
                <div className="pt-4 mt-4 border-t border-inverse/5">
                  <button 
                    onClick={() => { 
                      if (navigator.vibrate) navigator.vibrate(50);
                      onLogout(); 
                      onClose(); 
                    }} 
                    className="w-full flex items-center gap-4 text-accent hover:text-primary transition-colors p-3 rounded-xl hover:bg-accent/10 group"
                  >
                    <LogOut className="w-5 h-5 text-accent group-hover:text-primary transition-colors" /> 
                    <span className="font-bold">{t('menu.logout')}</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(menuContent, document.body);
}
