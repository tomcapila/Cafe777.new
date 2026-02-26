import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bike, LogOut, User as UserIcon } from 'lucide-react';

export default function Navbar() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

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

  useEffect(() => {
    checkAuth();
    window.addEventListener('auth-change', checkAuth);
    return () => window.removeEventListener('auth-change', checkAuth);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    navigate('/');
    window.dispatchEvent(new Event('auth-change'));
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-orange-500 p-2 rounded-xl group-hover:bg-orange-400 transition-colors">
              <Bike className="w-5 h-5 text-zinc-950" />
            </div>
            <span className="font-bold text-xl tracking-tight">Café777</span>
          </Link>
          
          <div className="flex items-center gap-4 sm:gap-6">
            <Link to="/map" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Map
            </Link>
            <Link to="/events" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Events
            </Link>
            
            {user ? (
              <>
                {(user.role === 'admin' || user.role === 'moderator') && (
                  <Link to="/admin" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                    Admin
                  </Link>
                )}
                <Link 
                  to={`/profile/${user.username}`} 
                  className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  <UserIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Profile</span>
                </Link>
                <button 
                  onClick={handleLogout}
                  className="text-sm font-medium text-zinc-400 hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                  Login
                </Link>
                <Link 
                  to="/register" 
                  className="text-sm font-medium bg-white text-zinc-950 px-4 py-2 rounded-full hover:bg-zinc-200 transition-colors"
                >
                  Join
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
