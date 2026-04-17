import { fetchWithAuth } from '../utils/api';
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, Heart, MessageSquare, Share2, Bike, Calendar, MapPin, ArrowRight, Search, Filter, Plus, X, ImageIcon, Send, Upload, ChevronRight, Pin, PinOff, CornerDownRight } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';

import { useLanguage } from '../contexts/LanguageContext';
import PremiumBadge from '../components/PremiumBadge';

export default function MotorFeed() {
  const { t } = useLanguage();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const { showNotification } = useNotification();

  // Create Post State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [postContent, setPostContent] = useState('');
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postPreview, setPostPreview] = useState<string | null>(null);
  const [taggedMotorcycleId, setTaggedMotorcycleId] = useState('');
  const [motorcycles, setMotorcycles] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedComments, setExpandedComments] = useState<{[key: number]: boolean}>({});
  const [postComments, setPostComments] = useState<{[key: number]: any[]}>({});
  const [commentLoading, setCommentLoading] = useState<{[key: number]: boolean}>({});
  const [newComment, setNewComment] = useState<{[key: number]: string}>({});
  const [isCommenting, setIsCommenting] = useState<{[key: number]: boolean}>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mention State
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setIsCreateModalOpen(true);
      // Clean up the URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (storedUser && token) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {}
    }
  }, []);

  const fetchPosts = async () => {
    try {
      const viewerParam = currentUser ? `?user_id=${currentUser.id}` : '';
      const res = await fetchWithAuth(`/api/posts${viewerParam}`);
      if (!res.ok) throw new Error(t('feed.fetchError'));
      const data = await res.json();
      setPosts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMotorcycles = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth(`/api/profile/${encodeURIComponent(currentUser.username)}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.garage) {
        setMotorcycles(data.garage);
      }
    } catch (err) {
      console.error('Failed to fetch motorcycles:', err);
    }
  };

  useEffect(() => {
    fetchPosts();
    if (currentUser) {
      fetchMotorcycles();
    }
  }, [currentUser]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || (!postContent.trim() && !postImage)) return;

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('username', currentUser.username);
    formData.append('content', postContent);
    if (postImage) formData.append('image', postImage);
    if (taggedMotorcycleId) formData.append('tagged_motorcycle_id', taggedMotorcycleId);
    formData.append('privacy_level', 'public');

    try {
      const res = await fetchWithAuth('/api/posts', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        showNotification('success', t('feed.post.success'));
        setPostContent('');
        setPostImage(null);
        setPostPreview(null);
        setTaggedMotorcycleId('');
        setIsCreateModalOpen(false);
        fetchPosts();
      } else {
        const err = await res.json();
        showNotification('error', err.error || t('feed.post.error'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('feed.post.errorGeneric'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPostImage(file);
      setPostPreview(URL.createObjectURL(file));
    }
  };

  const handleLike = async (postId: number) => {
    if (!currentUser) return;
    
    // Optimistic update
    setPosts(prevPosts => prevPosts.map((post: any) => {
      if (post.id === postId) {
        const newHasLiked = !post.has_liked;
        return {
          ...post,
          has_liked: newHasLiked,
          likes_count: (post.likes_count || 0) + (newHasLiked ? 1 : -1)
        };
      }
      return post;
    }));

    try {
      const res = await fetchWithAuth(`/api/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id }),
      });
      if (!res.ok) {
        // Revert if failed
        setPosts(prevPosts => prevPosts.map((post: any) => {
          if (post.id === postId) {
            const revertedHasLiked = !post.has_liked;
            return {
              ...post,
              has_liked: revertedHasLiked,
              likes_count: Math.max(0, (post.likes_count || 0) + (revertedHasLiked ? 1 : -1))
            };
          }
          return post;
        }));
      }
    } catch (err) {
      console.error(err);
      // Revert if failed
      setPosts(prevPosts => prevPosts.map((post: any) => {
        if (post.id === postId) {
          const revertedHasLiked = !post.has_liked;
          return {
            ...post,
            has_liked: revertedHasLiked,
            likes_count: Math.max(0, (post.likes_count || 0) + (revertedHasLiked ? 1 : -1))
          };
        }
        return post;
      }));
    }
  };

  const handlePin = async (postId: number) => {
    if (!currentUser) return;

    // Optimistic update
    const previousPosts = [...posts];
    setPosts(prev => {
      const isCurrentlyPinned = prev.find(p => p.id === postId)?.is_pinned === 1;
      return prev.map(p => ({
        ...p,
        is_pinned: p.id === postId ? (isCurrentlyPinned ? 0 : 1) : 0
      })).sort((a, b) => {
        if (b.is_pinned !== a.is_pinned) return b.is_pinned - a.is_pinned;
        return String(b.created_at).localeCompare(String(a.created_at));
      });
    });

    try {
      const res = await fetchWithAuth(`/api/posts/${postId}/pin`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        showNotification('success', data.is_pinned ? t('feed.post.pinnedSuccess') : t('feed.post.unpinnedSuccess'));
      } else {
        setPosts(previousPosts);
        const err = await res.json();
        showNotification('error', err.error || t('feed.post.pinError'));
      }
    } catch (err) {
      setPosts(previousPosts);
      console.error(err);
      showNotification('error', t('feed.post.pinErrorGeneric'));
    }
  };

  const fetchComments = async (postId: number) => {
    if (commentLoading[postId]) return;
    
    setCommentLoading(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await fetchWithAuth(`/api/posts/${postId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setPostComments(prev => ({ ...prev, [postId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setCommentLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  const toggleComments = (postId: number) => {
    const isExpanded = !expandedComments[postId];
    setExpandedComments(prev => ({ ...prev, [postId]: isExpanded }));
    if (isExpanded && !postComments[postId]) {
      fetchComments(postId);
    }
  };

  const handleAddComment = async (postId: number) => {
    if (!currentUser || !newComment[postId]?.trim()) return;

    setIsCommenting(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await fetchWithAuth(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment[postId] }),
      });

      if (res.ok) {
        setNewComment(prev => ({ ...prev, [postId]: '' }));
        fetchComments(postId);
        // Update comment count in posts list
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p));
      } else {
        showNotification('error', t('feed.commentError'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('feed.commentErrorGeneric'));
    } finally {
      setIsCommenting(prev => ({ ...prev, [postId]: false }));
    }
  };

  const handleTextareaChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setPostContent(value);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol !== -1) {
      const query = textBeforeCursor.substring(lastAtSymbol + 1);
      // Only suggest if @ is at the start of a word or start of string
      const charBeforeAt = lastAtSymbol > 0 ? textBeforeCursor[lastAtSymbol - 1] : ' ';
      
      if (/\s/.test(charBeforeAt) && !/\s/.test(query)) {
        setMentionQuery(query);
        if (query.length >= 1) {
          try {
            const res = await fetchWithAuth(`/api/users/search?q=${query}`);
            if (res.ok) {
              const data = await res.json();
              setMentionSuggestions(data);
              setShowMentionSuggestions(data.length > 0);
            }
          } catch (err) {
            console.error('Failed to search users:', err);
          }
        } else {
          setMentionSuggestions([]);
          setShowMentionSuggestions(false);
        }
      } else {
        setShowMentionSuggestions(false);
      }
    } else {
      setShowMentionSuggestions(false);
    }
  };

  const insertMention = (username: string) => {
    if (!textareaRef.current) return;
    
    const cursorPosition = textareaRef.current.selectionStart;
    const textBeforeCursor = postContent.substring(0, cursorPosition);
    const textAfterCursor = postContent.substring(cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    
    const newContent = 
      textBeforeCursor.substring(0, lastAtSymbol) + 
      `@${username} ` + 
      textAfterCursor;
      
    setPostContent(newContent);
    setShowMentionSuggestions(false);
    
    // Focus back to textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = lastAtSymbol + username.length + 2;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const categories = [
    { id: 'all', label: t('feed.category.all') },
    { id: 'routes', label: t('feed.category.routes') },
    { id: 'events', label: t('feed.category.events') },
    { id: 'clubs', label: t('feed.category.clubs') },
    { id: 'bikes', label: t('feed.category.bikes') },
  ];

  const filteredPosts = posts.filter((post: any) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'events') return !!post.shared_event_id;
    if (activeCategory === 'bikes') return !!post.tagged_motorcycle_id;
    if (activeCategory === 'clubs') return post.service_category === 'club' || post.service_category === 'motoclub';
    if (activeCategory === 'routes') return false; // Not implemented yet
    return true;
  });

  const renderPostContent = (content: string) => {
    if (!content) return null;
    
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.substring(1);
        return (
          <Link 
            key={index} 
            to={`/profile/${username}`}
            className="text-primary hover:text-accent font-bold transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </Link>
        );
      }
      return part;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Feed Header */}
      <div className="px-4 pt-6 pb-4 border-b border-inverse/5 bg-engine/50 backdrop-blur-xl sticky top-0 z-20">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-display font-black uppercase italic tracking-tighter">
            <span className="text-primary">{t('feed.title.motor')}</span><span className="text-chrome">{t('feed.title.feed')}</span>
          </h1>
          <div className="flex gap-2">
            <button className="p-2 bg-oil rounded-xl border border-inverse/5 text-steel hover:text-chrome transition-colors" title={t('feed.search')}>
              <Search className="w-5 h-5" />
            </button>
            <button className="p-2 bg-oil rounded-xl border border-inverse/5 text-steel hover:text-chrome transition-colors" title={t('feed.filter')}>
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-primary text-inverse shadow-lg shadow-primary/20'
                  : 'bg-oil text-steel hover:text-chrome border border-inverse/5'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-28">
        <div className="max-w-2xl mx-auto flex flex-col gap-8">
          {/* Create Post Trigger */}
          {currentUser && (
            <div 
              onClick={() => setIsCreateModalOpen(true)}
              className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-oil border border-inverse/10 overflow-hidden shrink-0">
                {currentUser.profile_picture_url ? (
                  <img src={currentUser.profile_picture_url} alt={currentUser.username} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-steel font-bold uppercase text-xs">
                    {currentUser.username.charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1 bg-oil/50 border border-inverse/5 rounded-xl px-4 py-2.5 text-steel text-sm font-light group-hover:text-chrome transition-colors">
                {t('feed.create.placeholder').replace('{name}', currentUser.rider_name || currentUser.username)}
              </div>
              <div className="p-2 bg-primary/10 rounded-lg text-primary group-hover:bg-primary group-hover:text-inverse transition-all">
                <Plus className="w-5 h-5" />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-error/10 border border-error/20 text-error p-4 rounded-xl">
              {error}
            </div>
          )}

          {filteredPosts.length > 0 ? (
            filteredPosts.map((post: any) => (
              <motion.article 
                key={post.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ 
                  layout: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 }
                }}
                className="glass-card overflow-hidden group hover:border-inverse/10 transition-all"
              >
                <div className="p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-6">
                    <Link to={`/profile/${post.username}`} className="flex items-center gap-3 group/author">
                      <div className="w-10 h-10 rounded-full bg-oil border border-inverse/10 overflow-hidden">
                        {post.profile_picture_url ? (
                          <img src={post.profile_picture_url} alt={post.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-steel font-bold uppercase text-xs">
                            {post.username.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-chrome group-hover/author:text-primary transition-colors flex items-center gap-1.5">
                          {post.rider_name || post.company_name || post.username}
                          {post.plan === 'premium' && <PremiumBadge size={12} />}
                        </div>
                        <div className="text-[10px] text-steel font-mono uppercase tracking-widest">
                          @{post.username}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 text-[10px] font-mono font-black uppercase tracking-widest text-steel">
                      {post.is_pinned === 1 && (
                        <div className="flex items-center gap-1 text-primary mr-2">
                          <Pin className="w-3 h-3 fill-primary" />
                          <span>{t('feed.post.pinned')}</span>
                        </div>
                      )}
                      <Clock className="w-3 h-3" />
                      <span>{post.created_at ? new Date(post.created_at.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
                    </div>
                  </div>
                  
                  {post.content && (
                    <p className="text-chrome leading-relaxed whitespace-pre-wrap mb-6 font-light text-lg">
                      {renderPostContent(post.content)}
                    </p>
                  )}
                  
                  {post.image_url && (
                    <div className="rounded-3xl overflow-hidden mb-6 border border-inverse/5 shadow-2xl relative group/img">
                      <img src={post.image_url} alt="" className="w-full aspect-video object-cover grayscale group-hover/img:grayscale-0 transition-all duration-1000 scale-105 group-hover/img:scale-100" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-oil/40 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-500" />
                    </div>
                  )}

                  {post.shared_event_id && (
                    <Link to={`/events/${post.shared_event_id}`} className="block mb-6 group/event">
                      <div className="flex items-center gap-4 p-4 rounded-2xl border border-inverse/10 bg-oil/30 hover:bg-oil/60 hover:border-primary/30 transition-all duration-500 overflow-hidden relative group/card">
                        <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden relative shadow-xl">
                          <img src={post.shared_event_image_url} alt={post.shared_event_title} className="w-full h-full object-cover grayscale group-hover/event:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
                        </div>
                        
                        <div className="flex-1 min-w-0 py-1">
                          <div className="text-[9px] font-mono font-black text-primary uppercase tracking-widest mb-1">{t('profile.eventLabel')}</div>
                          <h4 className="text-lg font-display font-black uppercase italic tracking-tight text-chrome group-hover/card:text-primary transition-colors duration-500 mb-2 line-clamp-1">
                            {post.shared_event_title}
                          </h4>
                          <div className="flex items-center gap-4 text-steel text-[9px] font-mono uppercase tracking-widest">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-primary" /> 
                              {new Date(post.shared_event_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 text-primary" /> 
                              {post.shared_event_location}
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-primary opacity-0 group-hover/card:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                      </div>
                    </Link>
                  )}

                  {post.tagged_motorcycle_id && (
                    <div className="flex items-center gap-2 text-[9px] font-mono font-black text-primary bg-primary/5 px-4 py-2 rounded-xl border border-primary/10 w-fit uppercase tracking-widest italic mb-6">
                      <Bike className="w-3 h-3" />
                      <span>{post.year} {post.make} {post.model}</span>
                    </div>
                  )}
                </div>
                
                <div className="px-6 py-4 border-t border-inverse/5 flex flex-col bg-engine/30">
                  <div className="flex items-center gap-8">
                    <button 
                      onClick={() => handleLike(post.id)}
                      className={`flex items-center gap-2 transition-all group/btn px-3 py-1.5 rounded-full ${
                        post.has_liked 
                          ? 'bg-primary/10 text-primary border border-primary/20' 
                          : 'text-steel hover:text-primary hover:bg-primary/5 border border-transparent'
                      }`}
                    >
                      <Heart className={`w-4 h-4 transition-all ${post.has_liked ? 'fill-primary' : 'group-hover/btn:fill-primary'}`} />
                      <div className="flex flex-col items-start leading-none">
                        <span className="text-[10px] font-mono font-black tracking-widest">{post.likes_count || 0}</span>
                        <span className="text-[8px] font-mono uppercase tracking-[0.2em] opacity-60">{t('feed.post.respect')}</span>
                      </div>
                    </button>
                    <button 
                      onClick={() => toggleComments(post.id)}
                      className={`flex items-center gap-2 transition-all group/btn px-3 py-1.5 rounded-full ${
                        expandedComments[post.id]
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-steel hover:text-chrome hover:bg-inverse/5 border border-transparent'
                      }`}
                    >
                      <MessageSquare className={`w-5 h-5 transition-all ${expandedComments[post.id] ? 'text-primary' : 'group-hover/btn:text-primary'}`} />
                      <div className="flex flex-col items-start leading-none">
                        <span className="text-[10px] font-mono font-black tracking-widest">{post.comment_count || 0}</span>
                        <span className="text-[8px] font-mono uppercase tracking-[0.2em] opacity-60">{t('feed.post.comments')}</span>
                      </div>
                    </button>
                    {currentUser && post.user_id === currentUser.id && (
                      <button 
                        onClick={() => handlePin(post.id)}
                        className={`flex items-center gap-2 transition-all group/btn px-3 py-1.5 rounded-full ${
                          post.is_pinned === 1
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'text-steel hover:text-primary hover:bg-primary/5 border border-transparent'
                        }`}
                        title={post.is_pinned === 1 ? t('feed.post.unpin') : t('feed.post.pin')}
                      >
                        {post.is_pinned === 1 ? (
                          <PinOff className="w-4 h-4 transition-all fill-primary" />
                        ) : (
                          <Pin className={`w-4 h-4 transition-all group-hover/btn:fill-primary`} />
                        )}
                        <span className="text-[10px] font-mono font-black tracking-widest uppercase">
                          {post.is_pinned === 1 ? t('feed.post.unpin') : t('feed.post.pin')}
                        </span>
                      </button>
                    )}
                    <button className="flex items-center gap-2 text-steel hover:text-chrome transition-all group/btn ml-auto">
                      <Share2 className="w-5 h-5 group-hover/btn:text-primary transition-all" />
                    </button>
                  </div>

                  {/* Comment Section */}
                  <AnimatePresence>
                    {expandedComments[post.id] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-6 space-y-4">
                          {/* Comment Input */}
                          {currentUser && (
                            <div className="flex gap-3">
                              <div className="w-8 h-8 rounded-full bg-oil border border-inverse/10 overflow-hidden shrink-0">
                                {currentUser.profile_picture_url ? (
                                  <img src={currentUser.profile_picture_url} alt={currentUser.username} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-steel font-bold uppercase text-[10px]">
                                    {currentUser.username.charAt(0)}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 relative">
                                <input
                                  type="text"
                                  autoCapitalize="sentences"
                                  value={newComment[post.id] || ''}
                                  onChange={(e) => setNewComment(prev => ({ ...prev, [post.id]: e.target.value }))}
                                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                                  placeholder={t('feed.writeComment')}
                                  className="w-full bg-oil/50 border border-inverse/5 rounded-xl px-4 py-2 text-sm text-chrome placeholder:text-steel focus:border-primary/50 transition-all outline-none pr-10"
                                />
                                <button 
                                  onClick={() => handleAddComment(post.id)}
                                  disabled={isCommenting[post.id] || !newComment[post.id]?.trim()}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-primary hover:text-chrome disabled:opacity-50 transition-colors"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Comments List */}
                          <div className="space-y-4 max-h-64 overflow-y-auto no-scrollbar">
                            {commentLoading[post.id] ? (
                              <div className="flex justify-center py-4">
                                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              </div>
                            ) : postComments[post.id]?.length > 0 ? (
                              postComments[post.id].map((comment: any) => (
                                <div key={comment.id} className="flex gap-3 group/comment">
                                  <Link to={`/profile/${comment.username}`} className="shrink-0">
                                    <div className="w-8 h-8 rounded-full bg-oil border border-inverse/10 overflow-hidden">
                                      {comment.profile_picture_url ? (
                                        <img src={comment.profile_picture_url} alt={comment.username} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-steel font-bold uppercase text-[10px]">
                                          {comment.username.charAt(0)}
                                        </div>
                                      )}
                                    </div>
                                  </Link>
                                  <div className="flex-1 min-w-0">
                                    <div className="bg-oil/50 rounded-2xl px-4 py-2 border border-inverse/5">
                                      <div className="flex items-center justify-between mb-0.5">
                                        <Link to={`/profile/${comment.username}`} className="text-xs font-bold text-chrome hover:text-primary transition-colors flex items-center gap-1.5">
                                          {comment.username}
                                          {comment.plan === 'premium' && <PremiumBadge size={10} />}
                                        </Link>
                                        <span className="text-[8px] font-mono text-steel uppercase tracking-widest">
                                          {new Date(comment.created_at.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                      </div>
                                      <p className="text-sm text-chrome font-light leading-relaxed">
                                        {comment.content}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-center py-4">
                                <p className="text-[10px] font-mono text-steel uppercase tracking-widest">{t('feed.noComments')}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.article>
            ))
          ) : (
            <div className="text-center py-20 glass-card border-dashed">
              <MessageSquare className="w-12 h-12 text-engine mx-auto mb-4" />
              <p className="text-steel font-mono text-xs uppercase tracking-widest">{t('feed.post.noPosts')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Post Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute inset-0 bg-engine/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg glass-card overflow-hidden border-inverse/10 shadow-2xl"
            >
              <div className="p-6 border-b border-inverse/5 flex items-center justify-between bg-engine/50">
                <h2 className="text-xl font-display font-black uppercase italic tracking-tight">{t('feed.create.title').split(' ')[0]} <span className="text-primary">{t('feed.create.title').split(' ')[1]}</span></h2>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-2 hover:bg-inverse/5 rounded-lg text-steel hover:text-chrome transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePost} className="p-6 space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-oil border border-inverse/10 overflow-hidden shrink-0">
                    {currentUser.profile_picture_url ? (
                      <img src={currentUser.profile_picture_url} alt={currentUser.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-steel font-bold uppercase text-xs">
                        {currentUser.username.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 relative">
                    <textarea
                      ref={textareaRef}
                      autoCapitalize="sentences"
                      value={postContent || ''}
                      onChange={handleTextareaChange}
                      placeholder={t('feed.create.textarea')}
                      className="w-full bg-transparent border-none text-chrome placeholder:text-steel focus:ring-0 p-0 text-lg font-light resize-none min-h-[120px]"
                    />

                    <AnimatePresence>
                      {showMentionSuggestions && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute left-0 bottom-full mb-2 w-64 bg-engine border border-inverse/10 rounded-xl shadow-2xl overflow-hidden z-[60]"
                        >
                          <div className="p-2 border-b border-inverse/5 bg-oil/50">
                            <span className="text-[9px] font-mono font-black uppercase tracking-widest text-steel">{t('feed.mentions')}</span>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {mentionSuggestions.map((user) => (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => insertMention(user.username)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-inverse/5 transition-colors text-left group"
                              >
                                <div className="w-8 h-8 rounded-full bg-oil border border-inverse/10 overflow-hidden shrink-0">
                                  {user.profile_picture_url ? (
                                    <img src={user.profile_picture_url} alt={user.username} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-steel font-bold uppercase text-[10px]">
                                      {user.username.charAt(0)}
                                    </div>
                                  )}
                                </div>
                                <span className="text-sm font-mono text-chrome group-hover:text-primary transition-colors">@{user.username}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {postPreview && (
                  <div className="relative rounded-2xl overflow-hidden border border-inverse/10 group">
                    <img src={postPreview} alt="Preview" className="w-full aspect-video object-cover" />
                    <button 
                      type="button"
                      onClick={() => {
                        setPostImage(null);
                        setPostPreview(null);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-engine/60 backdrop-blur-md rounded-lg text-chrome hover:bg-error hover:text-chrome transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 bg-oil border border-inverse/5 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest text-steel hover:text-chrome hover:border-primary/30 transition-all"
                    >
                      <ImageIcon className="w-4 h-4 text-primary" />
                      {postImage ? t('feed.create.changePhoto') : t('feed.create.addPhoto')}
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/*" 
                      className="hidden" 
                    />

                    {motorcycles.length > 0 && (
                      <div className="relative flex-1">
                        <select
                          value={taggedMotorcycleId || ''}
                          onChange={(e) => setTaggedMotorcycleId(e.target.value)}
                          className="w-full bg-oil border border-inverse/5 rounded-xl px-4 py-2 text-[10px] font-mono font-black uppercase tracking-widest text-steel hover:text-chrome hover:border-primary/30 transition-all appearance-none outline-none"
                        >
                          <option value="">{t('feed.create.tagMotorcycle')}</option>
                          {motorcycles.map((moto) => (
                            <option key={moto.id} value={moto.id}>{moto.year} {moto.make} {moto.model}</option>
                          ))}
                        </select>
                        <Bike className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-primary pointer-events-none" />
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || (!postContent.trim() && !postImage)}
                  className="w-full bg-primary text-inverse font-display font-black uppercase italic text-xl py-4 rounded-2xl shadow-xl shadow-primary/20 hover:bg-inverse hover:text-inverse transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <span className="flex items-center justify-center gap-2">
                    {isSubmitting ? t('feed.create.posting') : t('feed.create.button')}
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
