import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bike, LogOut, User as UserIcon, Languages, Maximize, Minimize, Bell, Menu } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import SideMenu from './SideMenu';

export default function Navbar() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const { language, setLanguage, t } = useLanguage();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);

  const checkAuth = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user from localStorage", e);
        localStorage.removeItem('user');
        setUser(null);
      }
    } else {
      setUser(null);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error(err);
    }
  };

  const [notifications, setNotifications] = useState<any[]>([]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/notifications?user_id=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.filter((n: any) => !n.is_read));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    checkAuth();
    fetchSettings();
    fetchNotifications();
    window.addEventListener('auth-change', checkAuth);
    
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('auth-change', checkAuth);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    navigate('/');
    window.dispatchEvent(new Event('auth-change'));
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'pt' : 'en');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-b border-white/5 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="bg-primary p-2.5 rounded-2xl group-hover:bg-oil transition-all shadow-lg shadow-primary/20 group-hover:scale-110">
              <Bike className="w-6 h-6 text-zinc-950" />
            </div>
            <span className="font-display font-black text-2xl tracking-tighter uppercase italic text-white group-hover:text-primary transition-colors">Café777</span>
          </Link>
          
          <div className="flex items-center gap-4 sm:gap-6">
            <button 
              onClick={toggleLanguage}
              className="flex items-center gap-2 text-[10px] font-mono font-black text-zinc-600 hover:text-primary transition-all uppercase tracking-[0.2em] border border-white/5 px-2 sm:px-3 py-1.5 rounded-xl hover:border-primary/20"
              title={language === 'en' ? 'Mudar para Português' : 'Switch to English'}
            >
              <Languages className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'en' ? 'EN' : 'PT'}</span>
            </button>

            <Link to="/admin" className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-primary transition-all">
              <span className="hidden sm:inline">{t('nav.admin')}</span>
              <span className="sm:hidden">Admin</span>
            </Link>

            {user ? (
              <div className="flex items-center gap-4 sm:gap-6">
                <Link 
                  to={`/profile/${user.username}`} 
                  className="flex items-center gap-2 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-primary transition-all group/profile"
                >
                  <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center group-hover/profile:border-primary/30 transition-all">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <span className="hidden lg:inline">{t('nav.profile')}</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-4 sm:gap-6">
                <Link to="/login" className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-primary transition-all">
                  {t('nav.login')}
                </Link>
                <Link 
                  to="/register" 
                  className="text-[10px] font-display font-black bg-primary text-zinc-950 px-4 py-2 sm:px-6 sm:py-3 rounded-2xl hover:bg-oil transition-all active:scale-95 uppercase italic tracking-widest shadow-xl shadow-primary/20"
                >
                  {t('nav.join')}
                </Link>
              </div>
            )}

            <button onClick={() => setIsSideMenuOpen(true)} className="text-zinc-500 hover:text-primary ml-2">
              <Menu className="w-6 h-6" />
            </button>
          </div>
          
          <SideMenu isOpen={isSideMenuOpen} onClose={() => setIsSideMenuOpen(false)} user={user} onLogout={handleLogout} />
        </div>
      </div>
    </nav>
  );
}
