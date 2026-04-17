import { fetchWithAuth } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCircle2, Heart, UserPlus, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      fetchNotifications(user.id);
    }
  }, []);

  const fetchNotifications = async (userId: number) => {
    try {
      const res = await fetchWithAuth(`/api/notifications?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
        console.error(err);
      }
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await fetchWithAuth(`/api/notifications/${id}/read`, { method: 'POST' });
      fetchNotifications(currentUser.id);
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
        console.error(err);
      }
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart className="w-5 h-5 text-primary" />;
      case 'follow': return <UserPlus className="w-5 h-5 text-success" />;
      default: return <Bell className="w-5 h-5 text-steel" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
        <div className="max-w-2xl mx-auto">
          <div className="mb-10">
            <h1 className="text-4xl sm:text-5xl font-display font-black uppercase italic tracking-tighter text-chrome mb-2">
              Your <span className="text-primary">Notifications</span>
            </h1>
            <p className="text-steel font-light text-lg">Stay updated with your community interactions.</p>
          </div>
          
          <div className="space-y-4">
            {notifications.length > 0 ? (
              notifications.map((n: any, index: number) => (
                <motion.div 
                  key={n.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`glass-card p-6 flex items-start gap-5 group hover:border-primary/30 transition-all ${n.is_read ? 'opacity-70' : 'shadow-[0_0_30px_rgba(242,125,38,0.05)]'}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-inverse/5 ${n.is_read ? 'bg-engine/50' : 'bg-oil shadow-lg'}`}>
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    {n.link ? (
                      <Link to={n.link} className="text-chrome hover:text-primary transition-colors block mb-2 font-medium leading-relaxed">
                        {n.content}
                      </Link>
                    ) : (
                      <p className="text-chrome mb-2 font-medium leading-relaxed">{n.content}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-steel">
                        {new Date(n.created_at).toLocaleDateString()}
                      </span>
                      {!n.is_read && (
                        <button 
                          onClick={() => markAsRead(n.id)} 
                          className="flex items-center gap-2 text-[10px] font-mono font-black uppercase tracking-widest text-primary hover:text-chrome transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                  {n.link && (
                    <div className="w-8 h-8 rounded-full bg-engine flex items-center justify-center text-steel group-hover:text-primary transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </motion.div>
              ))
            ) : (
              <div className="text-center py-24 glass-card border-dashed border-inverse/10">
                <div className="w-20 h-20 bg-oil rounded-full flex items-center justify-center mx-auto mb-6 border border-inverse/5">
                  <Bell className="w-10 h-10 text-steel" />
                </div>
                <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-chrome mb-2">All Caught Up</h3>
                <p className="text-steel font-mono text-xs uppercase tracking-widest">No new notifications at the moment.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
