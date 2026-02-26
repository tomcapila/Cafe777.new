import React, { useEffect, useState } from 'react';
import { Calendar, MapPin, Clock, Users, Plus, Star, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handlePromote = async (eventId: number, currentStatus: number) => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/promote`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser?.role || 'user'
        },
        body: JSON.stringify({ is_promoted: !currentStatus }),
      });

      if (res.ok) {
        fetchEvents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Upcoming Events</h1>
          <p className="text-zinc-400">Rides, meetups, and showcases in your area.</p>
        </div>
        {currentUser && currentUser.type !== 'rider' && (
          <Link 
            to={`/profile/${currentUser.username}`}
            className="hidden sm:flex items-center gap-2 bg-orange-500 text-zinc-950 px-4 py-2 rounded-xl font-semibold hover:bg-orange-400 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Event
          </Link>
        )}
      </div>

      <div className="grid gap-6">
        {events.length > 0 ? (
          events.map((event) => (
            <div 
              key={event.id} 
              className={`bg-zinc-900/50 border rounded-2xl p-6 transition-all flex flex-col md:flex-row gap-6 relative overflow-hidden ${
                event.is_promoted ? 'border-orange-500/30 ring-1 ring-orange-500/10' : 'border-white/5 hover:border-white/10'
              }`}
            >
              {event.is_promoted === 1 && (
                <div className="absolute top-0 right-0 bg-orange-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" />
                  Promoted
                </div>
              )}

              <div className="md:w-48 shrink-0 flex flex-col justify-center items-center bg-zinc-950 rounded-xl p-4 border border-white/5">
                <span className="text-orange-500 font-bold text-sm uppercase tracking-wider">
                  {new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}
                </span>
                <span className="text-4xl font-bold">
                  {new Date(event.date).getDate() + 1}
                </span>
                <span className="text-zinc-500 text-sm mt-1">
                  {event.time}
                </span>
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Link to={`/profile/${event.username}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <img src={event.profile_picture_url} alt="" className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                    <span className="text-sm font-medium text-zinc-300">{event.company_name || event.username}</span>
                  </Link>
                  <span className="w-1 h-1 rounded-full bg-zinc-700" />
                  <span className="text-xs text-orange-400 font-medium capitalize px-2 py-0.5 rounded-full bg-orange-500/10">
                    {event.service_category || 'Community'}
                  </span>
                </div>
                
                <h2 className="text-2xl font-bold mb-3">{event.title}</h2>
                <p className="text-zinc-400 mb-4 line-clamp-2">{event.description}</p>
                
                <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    {event.location}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    {Math.floor(Math.random() * 50) + 5} Attending
                  </div>
                </div>
              </div>

              <div className="md:w-32 shrink-0 flex flex-col justify-center gap-3">
                <button className="w-full bg-white/5 text-white border border-white/10 py-2.5 rounded-xl font-semibold hover:bg-white/10 transition-colors">
                  RSVP
                </button>
                {isAdmin && (
                  <button 
                    onClick={() => handlePromote(event.id, event.is_promoted)}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
                      event.is_promoted 
                        ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' 
                        : 'bg-orange-500/10 text-orange-500 border border-orange-500/20 hover:bg-orange-500/20'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {event.is_promoted ? 'Unpromote' : 'Promote'}
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20 bg-zinc-900/30 rounded-3xl border border-dashed border-white/5">
            <Calendar className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">No Events Found</h3>
            <p className="text-zinc-500">Check back later for upcoming rides and meetups.</p>
          </div>
        )}
      </div>
    </div>
  );
}
