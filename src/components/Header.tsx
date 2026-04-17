import { fetchWithAuth } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bike, Bell, Search, Languages, ShieldAlert, MessageSquare, Moon, Sun } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import SideMenu from './SideMenu';
import UniversalSearch from './UniversalSearch';

const MotorcycleMenuIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="9" y1="12" x2="21" y2="12" />
    <line x1="5" y1="18" x2="21" y2="18" />
  </svg>
);

export default function Header() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);

  const checkAuth = () => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (storedUser && token) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        fetchUnreadCount(parsedUser.id);
      } catch (e) {
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

  const fetchUnreadMessagesCount = async () => {
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
    window.addEventListener('auth-change', checkAuth);
    
    let interval: any;
    if (user) {
      fetchUnreadMessagesCount();
      interval = setInterval(fetchUnreadMessagesCount, 5000);
    }
    
    return () => {
      window.removeEventListener('auth-change', checkAuth);
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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-engine/90 backdrop-blur-xl border-b border-inverse/5 h-20 px-4">
      <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="bg-primary p-2 rounded-xl border border-primary/20 shadow-[0_0_15px_rgba(255,85,0,0.2)]">
            <Bike className="w-5 h-5 text-inverse fill-inverse" />
          </div>
          <span className="font-display font-black text-xl tracking-tighter uppercase italic text-chrome hidden sm:inline">Café777</span>
        </Link>

        <div className="flex-1 mx-4 flex justify-end lg:justify-center relative">
          <UniversalSearch />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={toggleTheme}
            className="p-2.5 text-steel hover:text-primary transition-colors"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setLanguage(language === 'en' ? 'pt' : 'en')}
            className="p-2.5 text-steel hover:text-primary transition-colors"
          >
            <Languages className="w-5 h-5" />
          </button>
          
          {!user && (
            <Link 
              to="/login" 
              className="px-4 py-2 bg-primary text-inverse font-mono text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-accent transition-all shadow-lg shadow-primary/20"
            >
              {t('nav.login') || 'Login'}
            </Link>
          )}
          
          {user && (
            <>
              <Link to="/messages" className="p-2.5 text-steel hover:text-primary relative transition-colors">
                <MessageSquare className="w-5 h-5" />
                {unreadMessagesCount > 0 && (
                  <span className="absolute top-2 right-2 w-4 h-4 bg-primary text-inverse text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadMessagesCount}
                  </span>
                )}
              </Link>
              <Link to="/notifications" className="p-2.5 text-steel hover:text-primary relative transition-colors">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-4 h-4 bg-primary text-inverse text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Link>
            </>
          )}

          {user && (user.role === 'admin' || user.role === 'moderator') && (
            <Link to="/admin" className="p-2.5 text-steel hover:text-primary transition-colors">
              <ShieldAlert className="w-5 h-5" />
            </Link>
          )}

          <button 
            onClick={() => {
              setIsSideMenuOpen(true);
              if (navigator.vibrate) navigator.vibrate(50);
            }} 
            className="p-2.5 text-steel hover:text-primary transition-colors"
          >
            <MotorcycleMenuIcon className="w-6 h-6" />
          </button>
        </div>

        <SideMenu isOpen={isSideMenuOpen} onClose={() => setIsSideMenuOpen(false)} user={user} onLogout={handleLogout} />
      </div>
    </header>
  );
}
