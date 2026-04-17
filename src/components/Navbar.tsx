import { fetchWithAuth } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bike, LogOut, User as UserIcon, Languages, Maximize, Minimize, Bell, Menu, MessageSquare } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import SideMenu from './SideMenu';

export default function Navbar() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const { language, setLanguage, t } = useLanguage();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settings, setSettings] = useState<any>({});
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const checkAuth = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        fetchUnreadCount(parsedUser.id);
      } catch (e) {
        console.error("Failed to parse user from localStorage", e);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setUser(null);
      }
    } else {
      setUser(null);
    }
  };

  const fetchUnreadCount = async (userId: number) => {
    try {
      const res = await fetchWithAuth(`/api/notifications?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.filter((n: any) => !n.is_read).length);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
        console.error(err);
      }
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetchWithAuth('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
        console.error(err);
      }
    }
  };

  const [notifications, setNotifications] = useState<any[]>([]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await fetchWithAuth(`/api/notifications?user_id=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.filter((n: any) => !n.is_read));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUnreadMessagesCount = async () => {
    if (!user) return;
    try {
      const res = await fetchWithAuth('/api/chats');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          const totalUnread = data.reduce((sum: number, chat: any) => sum + (chat.unread_count || 0), 0);
          setUnreadMessagesCount(totalUnread);
        } else {
          const text = await res.text();
          console.warn('Received non-JSON response for unread messages count:', text.substring(0, 100));
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
        console.error('Failed to fetch unread messages count:', err);
      }
    }
  };

  useEffect(() => {
    checkAuth();
    fetchSettings();
    fetchNotifications();
    window.addEventListener('auth-change', checkAuth);
    
    let interval: any;
    if (user) {
      fetchUnreadMessagesCount();
      interval = setInterval(fetchUnreadMessagesCount, 5000);
    }
    
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('auth-change', checkAuth);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (interval) clearInterval(interval);
    };
  }, [user?.id]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-engine/90 backdrop-blur-xl border-b border-inverse/5 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="bg-primary p-2.5 rounded-2xl group-hover:bg-oil transition-all shadow-lg shadow-primary/20 group-hover:scale-110">
              <Bike className="w-6 h-6 text-inverse" />
            </div>
            <span className="font-display font-black text-2xl tracking-tighter uppercase italic text-chrome group-hover:text-primary transition-colors">Café777</span>
          </Link>
          
          <div className="flex items-center gap-4 sm:gap-6">
            <button 
              onClick={toggleLanguage}
              className="flex items-center gap-2 text-[10px] font-mono font-black text-steel hover:text-primary transition-all uppercase tracking-[0.2em] border border-inverse/5 px-2 sm:px-3 py-1.5 rounded-xl hover:border-primary/20"
              title={language === 'en' ? 'Mudar para Português' : 'Switch to English'}
            >
              <Languages className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'en' ? 'EN' : 'PT'}</span>
            </button>

            {user && (user.role === 'admin' || user.role === 'moderator') && (
              <Link to="/admin" className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-steel hover:text-primary transition-all">
                <span className="hidden sm:inline">{t('nav.admin')}</span>
                <span className="sm:hidden">{t('nav.admin')}</span>
              </Link>
            )}

            {user ? (
              <div className="flex items-center gap-4 sm:gap-6">
                <Link 
                  to={`/profile/${user.username}`} 
                  className="flex items-center gap-2 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-steel hover:text-primary transition-all group/profile"
                >
                  <div className="w-8 h-8 rounded-xl bg-oil border border-inverse/5 flex items-center justify-center group-hover/profile:border-primary/30 transition-all">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <span className="hidden lg:inline">{t('nav.profile')}</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-4 sm:gap-6">
                <Link to="/login" className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-steel hover:text-primary transition-all">
                  {t('nav.login')}
                </Link>
                <Link 
                  to="/onboarding" 
                  className="text-[10px] font-display font-black bg-primary text-inverse px-4 py-2 sm:px-6 sm:py-3 rounded-2xl hover:bg-oil transition-all active:scale-95 uppercase italic tracking-widest shadow-xl shadow-primary/20"
                >
                  {t('nav.join')}
                </Link>
              </div>
            )}

            {user && (
              <>
                <Link to="/messages" className="text-steel hover:text-primary ml-2 relative">
                  <MessageSquare className="w-6 h-6" />
                  {unreadMessagesCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-inverse text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadMessagesCount}
                    </span>
                  )}
                </Link>
                <Link to="/notifications" className="text-steel hover:text-primary ml-2 relative">
                  <Bell className="w-6 h-6" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-inverse text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </Link>
              </>
            )}

            <button onClick={() => setIsSideMenuOpen(true)} className="text-steel hover:text-primary ml-2">
              <Menu className="w-6 h-6" />
            </button>
          </div>
          
          <SideMenu isOpen={isSideMenuOpen} onClose={() => setIsSideMenuOpen(false)} user={user} onLogout={handleLogout} />
        </div>
      </div>
    </nav>
  );
}
