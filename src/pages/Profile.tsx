import React, { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  MapPin, Calendar, Wrench, Bike, ShieldCheck, 
  ArrowLeft, Building2, Phone, Globe, MessageSquare, 
  Heart, Share2, Send, Image as ImageIcon, Tag, Plus, Clock
} from 'lucide-react';

export default function Profile() {
  const { username } = useParams();
  const [searchParams] = useSearchParams();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [postContent, setPostContent] = useState('');
  const [eventData, setEventData] = useState({ title: '', description: '', date: '', time: '', location: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user from localStorage", e);
        localStorage.removeItem('user');
      }
    }
  }, []);

  const isOwner = currentUser?.username === username;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';
  const canEdit = isOwner || isAdmin;

  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/profile/${username}`);
      if (!res.ok) throw new Error('Profile not found');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [username]);

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          content: postContent,
          image_url: `https://picsum.photos/seed/${Math.random()}/800/600`,
        }),
      });

      if (res.ok) {
        setPostContent('');
        fetchProfile(); // Refresh posts
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          ...eventData
        }),
      });

      if (res.ok) {
        setEventData({ title: '', description: '', date: '', time: '', location: '' });
        setIsCreatingEvent(false);
        fetchProfile(); // Refresh events
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4">
        <ShieldCheck className="w-16 h-16 text-zinc-800 mb-6" />
        <h2 className="text-2xl font-bold mb-2">Profile Not Found</h2>
        <p className="text-zinc-500 mb-8">The user or business you're looking for doesn't exist.</p>
        <Link to="/" className="text-orange-500 hover:text-orange-400 font-medium flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    );
  }

  const isRider = data.type === 'rider';

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-24">
      {/* Cover Photo */}
      <div className="h-64 sm:h-80 w-full bg-zinc-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/moto/1920/1080')] bg-cover bg-center opacity-40 mix-blend-luminosity" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row gap-6 sm:items-end mb-12"
        >
          {/* Avatar */}
          <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-3xl border-4 border-zinc-950 bg-zinc-900 overflow-hidden shrink-0 shadow-2xl">
            <img 
              src={data.profile_picture_url} 
              alt={username} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Header Info */}
          <div className="flex-1 pb-2">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                {isRider ? data.profile.name : data.profile.company_name}
              </h1>
              {isRider && <ShieldCheck className="w-6 h-6 text-orange-500" />}
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-zinc-400 font-medium">
              <span className="text-orange-400">@{data.username}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {isRider ? data.profile.city : data.profile.full_address}
              </div>
              {isRider && data.profile.age && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {data.profile.age} years old
                  </div>
                </>
              )}
              {!isRider && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                  <div className="flex items-center gap-1.5 capitalize text-orange-400">
                    <Building2 className="w-4 h-4" />
                    {data.profile.service_category}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pb-2">
            {canEdit ? (
              <Link 
                to={`/edit-profile/${username}`} 
                className="px-6 py-2.5 bg-white/10 text-white font-semibold rounded-full hover:bg-white/20 transition-colors border border-white/10"
              >
                Edit Profile
              </Link>
            ) : (
              <button className="px-6 py-2.5 bg-orange-500 text-zinc-950 font-semibold rounded-full hover:bg-orange-400 transition-colors">
                Connect
              </button>
            )}
            <button className="px-6 py-2.5 bg-white/5 text-white font-semibold rounded-full hover:bg-white/10 transition-colors border border-white/10">
              Share
            </button>
          </div>
        </motion.div>

        {/* Content Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-12">
            {isRider ? (
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-orange-500/10 rounded-xl">
                    <Bike className="w-5 h-5 text-orange-400" />
                  </div>
                  <h2 className="text-2xl font-bold">Virtual Garage</h2>
                </div>
                
                {data.garage && data.garage.length > 0 ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {data.garage.map((moto: any) => (
                      <div key={moto.id} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors">
                        <div className="text-sm font-medium text-orange-400 mb-1">{moto.year}</div>
                        <h3 className="text-xl font-bold mb-1">{moto.make}</h3>
                        <p className="text-zinc-400">{moto.model}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center">
                    <Wrench className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                    <h3 className="text-lg font-medium mb-1">Empty Garage</h3>
                    <p className="text-zinc-500 text-sm">No motorcycles added yet.</p>
                  </div>
                )}
              </section>
            ) : (
              <div className="space-y-12">
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-orange-500/10 rounded-xl">
                      <Building2 className="w-5 h-5 text-orange-400" />
                    </div>
                    <h2 className="text-2xl font-bold">About Us</h2>
                  </div>
                  <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 sm:p-8">
                    <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      {data.profile.details || "No details provided."}
                    </p>
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500/10 rounded-xl">
                        <Calendar className="w-5 h-5 text-orange-400" />
                      </div>
                      <h2 className="text-2xl font-bold">Hosted Events</h2>
                    </div>
                    {isOwner && (
                      <button 
                        onClick={() => setIsCreatingEvent(!isCreatingEvent)}
                        className="flex items-center gap-2 text-orange-500 hover:text-orange-400 font-bold text-sm transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {isCreatingEvent ? 'Cancel' : 'Create Event'}
                      </button>
                    )}
                  </div>

                  {isCreatingEvent && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-zinc-900/50 border border-orange-500/20 rounded-3xl p-6 mb-8 overflow-hidden"
                    >
                      <form onSubmit={handleEventSubmit} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <input
                            type="text"
                            placeholder="Event Title"
                            required
                            value={eventData.title}
                            onChange={(e) => setEventData({...eventData, title: e.target.value})}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 transition-all"
                          />
                          <input
                            type="date"
                            required
                            value={eventData.date}
                            onChange={(e) => setEventData({...eventData, date: e.target.value})}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 transition-all"
                          />
                          <input
                            type="text"
                            placeholder="Time (e.g. 08:00 AM)"
                            value={eventData.time}
                            onChange={(e) => setEventData({...eventData, time: e.target.value})}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 transition-all"
                          />
                          <input
                            type="text"
                            placeholder="Location"
                            value={eventData.location}
                            onChange={(e) => setEventData({...eventData, location: e.target.value})}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-orange-500 transition-all"
                          />
                        </div>
                        <textarea
                          placeholder="Event Description"
                          rows={3}
                          value={eventData.description}
                          onChange={(e) => setEventData({...eventData, description: e.target.value})}
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-orange-500 transition-all resize-none"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full bg-orange-500 text-zinc-950 py-3 rounded-xl font-bold hover:bg-orange-400 transition-colors disabled:opacity-50"
                        >
                          {isSubmitting ? 'Creating...' : 'Publish Event'}
                        </button>
                      </form>
                    </motion.div>
                  )}

                  <div className="grid gap-4">
                    {data.events && data.events.length > 0 ? (
                      data.events.map((event: any) => (
                        <div key={event.id} className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 flex items-center gap-6">
                          <div className="w-16 h-16 bg-zinc-950 rounded-xl flex flex-col items-center justify-center border border-white/5 shrink-0">
                            <span className="text-orange-500 text-[10px] font-bold uppercase tracking-tighter">
                              {new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}
                            </span>
                            <span className="text-xl font-bold leading-none">
                              {new Date(event.date).getDate() + 1}
                            </span>
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg mb-1">{event.title}</h3>
                            <div className="flex items-center gap-3 text-xs text-zinc-500">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {event.time}
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {event.location}
                              </div>
                            </div>
                          </div>
                          {event.is_promoted === 1 && (
                            <div className="px-2 py-1 bg-orange-500/10 text-orange-400 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-orange-500/20">
                              Promoted
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-8 text-center">
                        <Calendar className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                        <h3 className="text-lg font-medium mb-1">No Events</h3>
                        <p className="text-zinc-500 text-sm">This business hasn't scheduled any events yet.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {/* Feed Section */}
            <section className="space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-xl">
                    <MessageSquare className="w-5 h-5 text-orange-400" />
                  </div>
                  <h2 className="text-2xl font-bold">Updates & Blog</h2>
                </div>
              </div>

              {isOwner && (
                <div className="bg-zinc-900/50 border border-orange-500/20 rounded-3xl p-6">
                  <form onSubmit={handlePostSubmit}>
                    <textarea
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      placeholder="What's on your mind? Share a ride update or shop news..."
                      className="w-full bg-zinc-950 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-orange-500 transition-all resize-none mb-4 min-h-[100px]"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button type="button" className="p-2 text-zinc-500 hover:text-orange-400 transition-colors rounded-lg hover:bg-white/5">
                          <ImageIcon className="w-5 h-5" />
                        </button>
                        <button type="button" className="p-2 text-zinc-500 hover:text-orange-400 transition-colors rounded-lg hover:bg-white/5">
                          <Tag className="w-5 h-5" />
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting || !postContent.trim()}
                        className="bg-orange-500 text-zinc-950 px-6 py-2 rounded-full font-bold hover:bg-orange-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSubmitting ? 'Posting...' : (
                          <>
                            Post <Send className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="space-y-8">
                {data.posts && data.posts.length > 0 ? (
                  data.posts.map((post: any) => (
                    <article key={post.id} className="bg-zinc-900/50 border border-white/5 rounded-3xl overflow-hidden">
                      <div className="p-6">
                        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
                          <span>{new Date(post.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap mb-6">{post.content}</p>
                        
                        {post.image_url && (
                          <div className="rounded-2xl overflow-hidden mb-6">
                            <img src={post.image_url} alt="" className="w-full aspect-video object-cover" referrerPolicy="no-referrer" />
                          </div>
                        )}

                        {post.tagged_motorcycle_id && (
                          <div className="flex items-center gap-2 text-sm text-orange-400 bg-orange-500/5 px-3 py-2 rounded-xl border border-orange-500/10 w-fit">
                            <Bike className="w-4 h-4" />
                            <span>{post.year} {post.make} {post.model}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="px-6 py-4 border-t border-white/5 flex items-center gap-6">
                        <button className="flex items-center gap-2 text-zinc-500 hover:text-orange-500 transition-colors">
                          <Heart className="w-4 h-4" />
                          <span className="text-xs font-bold">12</span>
                        </button>
                        <button className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors">
                          <MessageSquare className="w-4 h-4" />
                          <span className="text-xs font-bold">3</span>
                        </button>
                        <button className="ml-auto text-zinc-500 hover:text-white transition-colors">
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="text-center py-12 bg-zinc-900/30 rounded-3xl border border-dashed border-white/5">
                    <MessageSquare className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                    <p className="text-zinc-500">No posts yet.</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
              <h3 className="font-semibold mb-4">Network Stats</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Connections</span>
                  <span className="font-bold">142</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Joined</span>
                  <span className="font-medium text-sm">
                    {new Date(data.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>

            {!isRider && (
              <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6">
                <h3 className="font-semibold mb-4">Contact Info</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-zinc-500" />
                    <span className="text-zinc-300">+1 (555) 0123-4567</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="w-4 h-4 text-zinc-500" />
                    <a href="#" className="text-orange-400 hover:underline">www.{data.username}.com</a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
