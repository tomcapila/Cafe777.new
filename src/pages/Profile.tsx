import React, { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Calendar, Wrench, Bike, ShieldCheck, 
  ArrowLeft, Building2, Phone, Globe, MessageSquare, 
  Heart, Share2, Send, Image as ImageIcon, Tag, Plus, Clock, Star, Trash2, Edit2,
  User, Users, ArrowRight, X, Activity, Mountain, ChevronDown, MoreHorizontal, Pin, PinOff, Crown
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import LocationAutocomplete from '../components/LocationAutocomplete';
import { useNotification } from '../contexts/NotificationContext';
import { fetchWithAuth } from '../utils/api';
import { ChatWindow } from '../components/ChatWindow';
import { createChat, findChat } from '../services/messagingService';
import PremiumBadge from '../components/PremiumBadge';
import { useFeatureAccess } from '../hooks/useFeatureAccess';

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const { canAccess } = useFeatureAccess();
  
  useEffect(() => {
    const editEventId = searchParams.get('editEvent');
    if (editEventId) {
      // Need to fetch events first, then find the event and call handleEditEvent
      // This is tricky because fetchProfile is async.
      // I'll just set a flag and handle it after fetchProfile.
    }
  }, [searchParams]);
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postPrivacy, setPostPrivacy] = useState('public');
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postPreview, setPostPreview] = useState<string | null>(null);
  const [taggedMotorcycleId, setTaggedMotorcycleId] = useState('');
  const [eventData, setEventData] = useState({ 
    title: '', 
    description: '', 
    date: '', 
    time: '', 
    location: '', 
    image_url: '', 
    category: 'road_trip',
    participation_badge_id: null as number | null,
    participation_stamp_id: null as number | null
  });
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [createdBadges, setCreatedBadges] = useState<any[]>([]);
  const [createdStamps, setCreatedStamps] = useState<any[]>([]);
  const eventImageInputRef = React.useRef<HTMLInputElement>(null);
  const postImageInputRef = React.useRef<HTMLInputElement>(null);
  const motoImageInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingEventImage, setIsUploadingEventImage] = useState(false);
  const [motoData, setMotoData] = useState<{ make: string; model: string; year: string; last_service: string; last_km: string; last_shop: string; photo: File | null; image_url?: string }>({ make: '', model: '', year: '', last_service: '', last_km: '', last_shop: '', photo: null });
  const [maintenanceData, setMaintenanceData] = useState({ service: '', km: '', shop: '' });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);

  const handleMessage = async () => {
    if (!data || !currentUser) return;
    
    const participantIds = [currentUser.id, data.id];
    let existingChatId = await findChat(participantIds);
    
    if (existingChatId) {
      setChatId(existingChatId);
    } else {
      const newChatId = await createChat(participantIds, 'one-on-one', `${data.type === 'rider' ? data.profile.name : data.profile.company_name}`);
      setChatId(newChatId);
    }
    setIsChatOpen(true);
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isAddingMoto, setIsAddingMoto] = useState(false);
  const [editingMotoId, setEditingMotoId] = useState<number | null>(null);
  const [activeMaintenanceMotoId, setActiveMaintenanceMotoId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'updates');
  const [activeTooltipBadgeId, setActiveTooltipBadgeId] = useState<number | null>(null);
  const tooltipTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  const handleBadgeClick = (e: React.MouseEvent, badgeId: number) => {
    e.stopPropagation();
    if (activeTooltipBadgeId === badgeId) {
      setActiveTooltipBadgeId(null);
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    } else {
      setActiveTooltipBadgeId(badgeId);
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = setTimeout(() => {
        setActiveTooltipBadgeId(null);
      }, 3000);
    }
  };
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const [badges, setBadges] = useState<any[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<any>(null);
  const [passportStamps, setPassportStamps] = useState<any[]>([]);

  const tabContentVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (storedUser && token) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user from localStorage", e);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
  }, []);

  const isOwner = currentUser?.username?.toLowerCase() === username?.toLowerCase();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';
  const canEdit = isOwner || isAdmin;

  console.log('DEBUG: currentUser', currentUser);
  console.log('DEBUG: username', username);
  console.log('DEBUG: isOwner', isOwner);
  console.log('DEBUG: isAdmin', isAdmin);
  console.log('DEBUG: canEdit', canEdit);

  useEffect(() => {
    if (currentUser && isOwner) {
      fetchCreatedBadges();
      fetchCreatedStamps();
    }
  }, [currentUser, isOwner]);

  const fetchCreatedBadges = async () => {
    try {
      const res = await fetchWithAuth(`/api/badges?creator_id=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setCreatedBadges(data);
      }
    } catch (err) {
      console.error("Failed to fetch created badges", err);
    }
  };

  const fetchCreatedStamps = async () => {
    try {
      const res = await fetchWithAuth(`/api/ambassadors/${currentUser.id}/stamps`);
      if (res.ok) {
        const data = await res.json();
        setCreatedStamps(data);
      }
    } catch (err) {
      console.error("Failed to fetch created stamps", err);
    }
  };

  const fetchProfile = async (retryCount = 0) => {
    if (retryCount === 0) setLoading(true);
    try {
      const storedUser = localStorage.getItem('user');
      let viewerId = '';
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          viewerId = `?viewer_id=${parsed.id}`;
        } catch (e) {}
      }
      
      const res = await fetchWithAuth(`/api/profile/${encodeURIComponent(username!)}${viewerId}`);
      if (!res.ok) {
        if (retryCount < 3) {
          console.log(`Profile not found, retrying... (${retryCount + 1})`);
          setTimeout(() => fetchProfile(retryCount + 1), 1000);
          return;
        }
        throw new Error('Profile not found');
      }
      const result = await res.json();
      setData(result);

      if (result.type === 'rider') {
        fetchPassportStamps(result.id);
      }
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchPassportStamps = async (userId: number) => {
    try {
      const res = await fetchWithAuth(`/api/users/${userId}/passport`);
      if (res.ok) {
        const result = await res.json();
        setPassportStamps(result);
      }
    } catch (err) {
      console.error("Failed to fetch passport stamps", err);
    }
  };

  const fetchBadges = async () => {
    try {
      const res = await fetchWithAuth(`/api/users/${username}/badges`);
      if (res.ok) {
        const result = await res.json();
        setBadges(result);
      }
    } catch (err) {
      console.error("Failed to fetch badges", err);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchBadges();
  }, [username]);

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim() && !postImage) return;

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('username', currentUser.username);
    formData.append('content', postContent);
    if (postImage) formData.append('image', postImage);
    if (taggedMotorcycleId) formData.append('tagged_motorcycle_id', taggedMotorcycleId);
    formData.append('privacy_level', postPrivacy);

    try {
      const res = await fetchWithAuth('/api/posts', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setPostContent('');
        setPostImage(null);
        setPostPreview(null);
        setTaggedMotorcycleId('');
        showNotification('success', t('profile.postSuccess'));
        fetchProfile(); // Refresh posts
      } else {
        const err = await res.json();
        showNotification('error', err.error || t('profile.postFailed'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('profile.postError'));
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
    if (!currentUser || !data) return;

    // Optimistic update
    setData(prevData => {
      if (!prevData) return prevData;
      return {
        ...prevData,
        posts: prevData.posts.map((post: any) => {
          if (post.id === postId) {
            const newHasLiked = !post.has_liked;
            return {
              ...post,
              has_liked: newHasLiked,
              likes_count: (post.likes_count || 0) + (newHasLiked ? 1 : -1)
            };
          }
          return post;
        })
      };
    });

    try {
      const res = await fetchWithAuth(`/api/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id }),
      });
      if (!res.ok) {
        // Revert if failed
        setData(prevData => {
          if (!prevData) return prevData;
          return {
            ...prevData,
            posts: prevData.posts.map((post: any) => {
              if (post.id === postId) {
                const revertedHasLiked = !post.has_liked;
                return {
                  ...post,
                  has_liked: revertedHasLiked,
                  likes_count: Math.max(0, (post.likes_count || 0) + (revertedHasLiked ? 1 : -1))
                };
              }
              return post;
            })
          };
        });
      }
    } catch (err) {
      console.error(err);
      // Revert if failed
      setData(prevData => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          posts: prevData.posts.map((post: any) => {
            if (post.id === postId) {
              const revertedHasLiked = !post.has_liked;
              return {
                ...post,
                has_liked: revertedHasLiked,
                likes_count: Math.max(0, (post.likes_count || 0) + (revertedHasLiked ? 1 : -1))
              };
            }
            return post;
          })
        };
      });
    }
  };

  const handlePin = async (postId: number) => {
    if (!currentUser || !data) return;

    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';
    const canEdit = isOwner || isAdmin;
    
    // Optimistic update
    const previousData = { ...data };
    
    const updatedPosts = data.posts.map((p: any) => {
      const isCurrentlyPinned = p.id === postId && p.is_pinned === 1;
      const newPinnedStatus = p.id === postId ? (isCurrentlyPinned ? 0 : 1) : 0;
      return {
        ...p,
        is_pinned: newPinnedStatus,
        is_pinned_by_owner: canEdit ? newPinnedStatus : p.is_pinned_by_owner
      };
    }).sort((a: any, b: any) => {
      if (b.is_pinned_by_owner !== a.is_pinned_by_owner) return b.is_pinned_by_owner - a.is_pinned_by_owner;
      return String(b.created_at).localeCompare(String(a.created_at));
    });

    setData({ ...data, posts: updatedPosts });

    try {
      const res = await fetchWithAuth(`/api/posts/${postId}/pin`, {
        method: 'POST',
      });

      if (res.ok) {
        const result = await res.json();
        showNotification('success', result.is_pinned ? t('profile.pinSuccess') : t('profile.unpinSuccess'));
      } else {
        setData(previousData);
        const err = await res.json();
        showNotification('error', err.error || t('profile.pinFailed'));
      }
    } catch (err) {
      setData(previousData);
      console.error(err);
      showNotification('error', t('profile.pinError'));
    }
  };

  const handleFollow = async () => {
    if (!currentUser || !data) return;
    try {
      const res = await fetchWithAuth(`/api/users/${data.id}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower_id: currentUser.id }),
      });
      if (res.ok) {
        fetchProfile();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingEventId && !canAccess('create_event', currentUser?.plan, currentUser?.role, currentUser?.type)) {
      showNotification('error', t('admin.featureAccess.allowedPlan'));
      return;
    }
    
    if (!eventData.title.trim()) {
      setNotification({ message: t('profile.eventTitleRequired'), type: 'error' });
      return;
    }
    if (!eventData.date) {
      setNotification({ message: t('profile.eventDateRequired'), type: 'error' });
      return;
    }
    if (!eventData.time) {
      setNotification({ message: t('profile.eventTimeRequired'), type: 'error' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const url = editingEventId ? `/api/events/${editingEventId}` : '/api/events';
      const method = editingEventId ? 'PUT' : 'POST';
      
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          ...eventData
        }),
      });

      if (res.ok) {
        setEventData({ 
          title: '', 
          description: '', 
          date: '', 
          time: '', 
          location: '', 
          image_url: '', 
          category: 'road_trip',
          participation_badge_id: null,
          participation_stamp_id: null
        });
        setIsCreatingEvent(false);
        setEditingEventId(null);
        setNotification({ message: t('profile.eventSuccess'), type: 'success' });
        fetchProfile(); // Refresh events
        setTimeout(() => setNotification(null), 3000);
      } else {
        setNotification({ message: t('profile.eventFailed'), type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setNotification({ message: t('profile.eventError'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEventImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingEventImage(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetchWithAuth('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (res.ok) {
        setEventData(prev => ({ ...prev, image_url: result.url }));
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploadingEventImage(false);
    }
  };

  const handleEditEvent = (event: any) => {
    setEventData({
      title: event.title,
      description: event.description,
      date: event.date,
      time: event.time,
      location: event.location,
      image_url: event.image_url,
      category: event.category || 'road_trip',
      participation_badge_id: event.participation_badge_id,
      participation_stamp_id: event.participation_stamp_id
    });
    setEditingEventId(event.id);
    setIsCreatingEvent(true);
  };

  const removeRecommendation = async (id: number) => {
    try {
      const res = await fetchWithAuth(`/api/recommendations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProfile(); // Refresh profile
      }
    } catch (err) {
      console.error(err);
    }
  };

  const [newRec, setNewRec] = useState({ type: 'road', item_id: '', item_name: '', description: '' });

  const addRecommendation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          ...newRec
        }),
      });
      if (res.ok) {
        setNewRec({ type: 'road', item_id: '', item_name: '', description: '' });
        fetchProfile(); // Refresh profile
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMotoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('username', username || '');
      Object.keys(motoData).forEach(key => {
        if (motoData[key as keyof typeof motoData] !== undefined && motoData[key as keyof typeof motoData] !== null) {
          formData.append(key, motoData[key as keyof typeof motoData] as string | Blob);
        }
      });

      const url = editingMotoId ? `/api/motorcycles/${editingMotoId}` : '/api/motorcycles';
      const method = editingMotoId ? 'PUT' : 'POST';

      const res = await fetchWithAuth(url, {
        method,
        body: formData,
      });

      if (res.ok) {
        setMotoData({ make: '', model: '', year: '', last_service: '', last_km: '', last_shop: '', photo: null });
        if (motoImageInputRef.current) motoImageInputRef.current.value = '';
        setIsAddingMoto(false);
        setEditingMotoId(null);
        fetchProfile(); // Refresh garage
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMoto = async (motoId: number) => {
    if (!window.confirm(t('profile.confirmDeleteMoto') || 'Are you sure you want to delete this motorcycle?')) return;
    try {
      const res = await fetchWithAuth(`/api/motorcycles/${motoId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchProfile();
      }
    } catch (err) {
      console.error('Failed to delete motorcycle:', err);
    }
  };

  const handleMaintenanceSubmit = async (e: React.FormEvent, motoId: number) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/motorcycles/${motoId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maintenanceData),
      });

      if (res.ok) {
        setMaintenanceData({ service: '', km: '', shop: '' });
        setActiveMaintenanceMotoId(null);
        fetchProfile(); // Refresh garage
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRSVP = async (eventId: number) => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username }),
      });
      if (res.ok) {
        fetchProfile();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const [postComments, setPostComments] = useState<Record<number, any[]>>({});
  const [commentLoading, setCommentLoading] = useState<Record<number, boolean>>({});
  const [newComment, setNewComment] = useState<Record<number, string>>({});
  const [isCommenting, setIsCommenting] = useState<Record<number, boolean>>({});

  const fetchComments = async (postId: number) => {
    setCommentLoading(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await fetchWithAuth(`/api/posts/${postId}/comments`);
      if (res.ok) {
        const comments = await res.json();
        setPostComments(prev => ({ ...prev, [postId]: comments }));
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setCommentLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  const toggleComments = (postId: number) => {
    const isExpanded = !!expandedComments[postId];
    setExpandedComments(prev => ({ ...prev, [postId]: !isExpanded }));
    
    if (!isExpanded && !postComments[postId]) {
      fetchComments(postId);
    }
  };

  const handleAddComment = async (postId: number) => {
    const content = newComment[postId];
    if (!content?.trim() || !currentUser) return;

    setIsCommenting(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await fetchWithAuth(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (res.ok) {
        const result = await res.json();
        setNewComment(prev => ({ ...prev, [postId]: '' }));
        
        // Update local comments
        setPostComments(prev => ({
          ...prev,
          [postId]: [result.comment, ...(prev[postId] || [])]
        }));

        // Update post comment count
        setData((prevData: any) => {
          if (!prevData) return prevData;
          return {
            ...prevData,
            posts: prevData.posts.map((p: any) => 
              p.id === postId ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p
            )
          };
        });
        
        showNotification('success', t('feed.commentSuccess') || 'Comment added!');
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
      showNotification('error', t('feed.commentError') || 'Failed to add comment');
    } finally {
      setIsCommenting(prev => ({ ...prev, [postId]: false }));
    }
  };

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
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <ShieldCheck className="w-20 h-20 text-engine mb-8" />
        <h2 className="text-4xl font-display font-black uppercase italic mb-4">{t('profile.notFound')}</h2>
        <p className="text-steel mb-10 font-light">{t('profile.notFoundDesc')}</p>
        <Link to="/" className="btn-secondary">
          <ArrowLeft className="w-4 h-4 mr-2 inline" />
          {t('profile.backHome')}
        </Link>
      </div>
    );
  }

  const isRider = data.type === 'rider';

  return (
    <div className="pb-24">
      {/* Cover Photo */}
      <div className="h-64 sm:h-80 w-full bg-carbon relative overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-luminosity grayscale scale-105 blur-[2px]" 
            style={{ backgroundImage: `url(${data.cover_photo_url || 'https://picsum.photos/seed/moto/1920/1080'})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-asphalt/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-asphalt/80 via-transparent to-asphalt/80" />
          <div className="absolute inset-0 grid-pattern opacity-20" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 sm:-mt-32 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row gap-6 md:items-end mb-12"
          >
            {/* Avatar */}
            <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-[2rem] border-4 border-asphalt bg-carbon overflow-hidden shrink-0 shadow-2xl relative group">
              <img 
                src={data.profile_picture_url} 
                alt={username} 
                className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 scale-110 group-hover:scale-100"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 border border-white/10 rounded-[2rem] pointer-events-none" />
            </div>

            {/* Header Info */}
            <div className="flex-1 pb-2">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-4xl sm:text-6xl font-display font-black tracking-tighter uppercase italic leading-none flex items-center gap-3">
                  {data.profile ? (isRider ? data.profile.name : data.profile.company_name) : data.username}
                  {data.plan === 'premium' && <PremiumBadge size={24} className="ml-2" />}
                </h1>
                {isRider && !data.ambassador && (
                  <div className="p-1.5 bg-primary/10 rounded-lg border border-primary/20 backdrop-blur-sm">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  </div>
                )}
                {data.ambassador && (
                  <div className="p-1.5 bg-accent/10 rounded-lg border border-accent/20 backdrop-blur-sm flex items-center gap-2" title={`${t('profile.ambassador')}: ${data.ambassador.category}`}>
                    <Star className="w-5 h-5 text-accent fill-accent" />
                    <span className="text-accent font-mono text-[10px] uppercase font-bold tracking-widest">{t('profile.ambassador')}</span>
                    <span className="text-accent/80 font-mono text-[10px] uppercase font-bold tracking-widest ml-2 border-l border-accent/20 pl-2">{t('profile.reputation')}: {data.ambassador.reputation_score}</span>
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-steel font-mono text-[9px] uppercase tracking-[0.2em] mb-4">
                <span className="text-primary font-black bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">@{data.username}</span>
                {data.is_mock === 1 && (
                  <span className="bg-asphalt border border-white/10 text-steel px-2 py-0.5 rounded-full font-bold animate-pulse">
                    {t('profile.demoAccount')}
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-steel" />
                  <span className="text-chrome">{data.profile ? (isRider ? data.profile.city : data.profile.full_address) : ''}</span>
                </div>
                {isRider && data.profile?.age && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-steel" />
                    <span className="text-chrome">{data.profile.age} {t('profile.yearsOld')}</span>
                  </div>
                )}
                <div className="flex items-center gap-4 ml-auto">
                  <div className="flex flex-col items-center" title={`Referral Code: ${data.referral_code || 'N/A'}`}>
                    <span className="text-primary text-base font-bold">{data.referral_count || 0}</span>
                    <span className="text-[8px] text-primary">{t('profile.referrals')}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-white text-base font-bold">{data.followers_count || 0}</span>
                    <span className="text-[8px] text-steel">{t('profile.followers')}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-white text-base font-bold">{data.following_count || 0}</span>
                    <span className="text-[8px] text-steel">{t('profile.following')}</span>
                  </div>
                </div>
              </div>

              {/* Biker Passport Progress */}
              {(badges.length > 0 || passportStamps.length > 0) && (
                <div 
                  className="flex items-center gap-4 cursor-pointer group/badges mt-2"
                  onClick={() => setActiveTab('biker_passport')}
                >
                  <div className="flex items-center gap-2 bg-asphalt/50 px-3 py-1.5 rounded-xl border border-white/5 hover:border-primary/30 transition-colors">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-white">{passportStamps.length} <span className="text-[10px] text-steel font-mono uppercase tracking-widest">Stamps</span></span>
                  </div>
                  <div className="flex items-center gap-2 bg-asphalt/50 px-3 py-1.5 rounded-xl border border-white/5 hover:border-accent/30 transition-colors">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    <span className="text-xs font-bold text-white">{badges.length} <span className="text-[10px] text-steel font-mono uppercase tracking-widest">Badges</span></span>
                  </div>
                  
                  {/* Recent Badges Preview */}
                  {badges.length > 0 && (
                    <div className="flex -space-x-2 ml-2">
                      {badges.slice(0, 3).map((badge, idx) => {
                        const IconComponent = {
                          'MapPin': MapPin,
                          'Activity': Activity,
                          'Heart': Heart,
                          'Wrench': Wrench,
                          'Mountain': Mountain,
                          'Star': Star,
                          'Award': ShieldCheck
                        }[badge.icon as string] || ShieldCheck;

                        return (
                          <div 
                            key={badge.user_badge_id} 
                            className="w-7 h-7 rounded-full bg-asphalt border-2 border-carbon flex items-center justify-center shadow-lg overflow-hidden relative z-[4] hover:z-10 transition-transform hover:scale-110 cursor-pointer"
                            style={{ zIndex: 4 - idx }}
                            onClick={(e) => handleBadgeClick(e, badge.badge_id)}
                          >
                            {badge.icon && badge.icon.startsWith('/') ? (
                              <img src={badge.icon} alt={badge.name} className="w-full h-full object-cover" />
                            ) : (
                              <IconComponent className="w-3.5 h-3.5 text-accent" />
                            )}

                            <AnimatePresence>
                              {activeTooltipBadgeId === badge.badge_id && (
                                <motion.div
                                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                                  className="fixed sm:absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 p-3 bg-carbon/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[100] pointer-events-none"
                                >
                                  <div className="text-[10px] font-mono font-black text-accent uppercase tracking-widest mb-1">{badge.name}</div>
                                  <div className="text-[9px] text-steel leading-relaxed font-medium">
                                    {badge.description || t('profile.noBadgeDescription')}
                                  </div>
                                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-carbon border-r border-b border-white/10 rotate-45" />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pb-2">
              {canEdit ? (
                <Link 
                  to={`/edit-profile/${username}`} 
                  className="btn-secondary py-2 px-4 text-xs flex items-center gap-2 group"
                >
                  <Wrench className="w-4 h-4 text-steel group-hover:text-primary transition-colors" />
                  {t('profile.edit')}
                </Link>
              ) : (
                <>
                  <button onClick={handleFollow} className="btn-primary py-2 px-6 text-xs flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    {data.is_following ? t('profile.unfollow') : t('profile.follow')}
                  </button>
                  <button onClick={handleMessage} className="btn-secondary py-2 px-4 text-xs flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    {t('profile.message')}
                  </button>
                </>
              )}
            </div>

            {isChatOpen && chatId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-carbon border border-white/10 rounded-2xl w-full max-w-md h-[500px] flex flex-col">
                  <div className="p-4 border-b border-white/10 flex justify-between items-center bg-asphalt/50">
                    <h3 
                      className="text-chrome font-bold cursor-pointer hover:text-primary transition-colors"
                      onClick={() => {
                        setIsChatOpen(false);
                        navigate(`/profile/${data.username}`);
                      }}
                    >
                      {data.profile ? (isRider ? data.profile.name : data.profile.company_name) : data.username}
                    </h3>
                    <button onClick={() => setIsChatOpen(false)} className="text-steel hover:text-chrome">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <ChatWindow chatId={chatId} />
                </div>
              </div>
            )}
          </motion.div>

          {/* Tab Navigation */}
          <div className="sticky top-0 z-40 bg-asphalt/90 backdrop-blur-xl -mx-4 px-4 sm:mx-0 sm:px-0 py-3 mb-8 border-b border-white/5 shadow-lg">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 mask-linear-fade">
                {[
                  { id: 'updates', icon: MessageSquare, label: t('profile.updates') },
                  { id: 'garage', icon: Bike, label: t('profile.garage'), hidden: !isRider },
                  { id: 'about', icon: Building2, label: t('profile.aboutUs'), hidden: isRider },
                  { id: 'services', icon: Wrench, label: t('profile.services'), hidden: isRider },
                  { id: 'events', icon: Calendar, label: t('nav.events') },
                  { id: 'recommendations', icon: Star, label: t('profile.recommendations') },
                  { id: 'biker_passport', icon: MapPin, label: t('profile.bikerPassport') },
                ].filter(tab => !tab.hidden).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setShowMoreTabs(false);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                      activeTab === tab.id 
                        ? 'bg-primary text-asphalt shadow-[0_0_15px_rgba(255,85,0,0.3)]' 
                        : 'text-steel hover:text-chrome hover:bg-white/5'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Cascade Menu (Dropdown) */}
              <div className="relative shrink-0 ml-2">
                <button
                  onClick={() => setShowMoreTabs(!showMoreTabs)}
                  className={`p-2 rounded-lg border transition-all flex items-center gap-2 ${
                    showMoreTabs 
                      ? 'bg-primary/10 border-primary/30 text-primary' 
                      : 'bg-carbon border-white/5 text-steel hover:text-chrome hover:bg-white/5'
                  }`}
                  title={t('profile.allTabs')}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                <AnimatePresence>
                  {showMoreTabs && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowMoreTabs(false)}
                        className="fixed inset-0 z-40"
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-3 w-64 glass-card z-50 overflow-hidden border-white/10 shadow-2xl origin-top-right"
                      >
                         <div className="p-2 flex flex-col gap-1">
                          <div className="px-3 py-2 text-[9px] font-mono text-steel uppercase tracking-widest border-b border-white/5 mb-1">
                            {t('profile.navigation')}
                          </div>
                          {[
                            { id: 'updates', icon: MessageSquare, label: t('profile.updates') },
                            { id: 'garage', icon: Bike, label: t('profile.garage'), hidden: !isRider },
                            { id: 'about', icon: Building2, label: t('profile.aboutUs'), hidden: isRider },
                            { id: 'services', icon: Wrench, label: t('profile.services'), hidden: isRider },
                            { id: 'events', icon: Calendar, label: t('nav.events') },
                            { id: 'recommendations', icon: Star, label: t('profile.recommendations') },
                            { id: 'biker_passport', icon: MapPin, label: t('profile.bikerPassport') },
                          ].filter(tab => !tab.hidden).map(tab => (
                            <button
                              key={`menu-${tab.id}`}
                              onClick={() => {
                                setActiveTab(tab.id);
                                setShowMoreTabs(false);
                              }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest transition-all ${
                                activeTab === tab.id 
                                  ? 'bg-primary/10 text-primary border border-primary/20' 
                                  : 'text-steel hover:text-chrome hover:bg-white/5 border border-transparent'
                              }`}
                            >
                              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-primary' : 'text-steel'}`} />
                              {tab.label}
                              {activeTab === tab.id && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_rgba(255,85,0,0.5)]" />
                              )}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {activeTab === 'garage' && isRider && (
                <motion.div
                  key="garage"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={tabContentVariants}
                  transition={{ duration: 0.3 }}
                  className="space-y-12"
                >
                  <section>
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-2xl">
                        <Bike className="w-6 h-6 text-primary" />
                      </div>
                      <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">{t('profile.garage')}</h2>
                    </div>
                    {canEdit && (
                      <button 
                        onClick={() => {
                          setIsAddingMoto(!isAddingMoto);
                          if (isAddingMoto) {
                            setEditingMotoId(null);
                            setMotoData({ make: '', model: '', year: '', last_service: '', last_km: '', last_shop: '', photo: null });
                            if (motoImageInputRef.current) motoImageInputRef.current.value = '';
                          }
                        }}
                        className="flex items-center gap-2 text-primary hover:text-oil font-display font-bold text-xs uppercase tracking-widest transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        {isAddingMoto ? t('profile.cancel') : t('profile.addMoto')}
                      </button>
                    )}
                  </div>

                  {isAddingMoto && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="glass-card p-8 mb-12 border-primary/20"
                    >
                      <h3 className="text-xl font-display font-bold mb-6 uppercase italic tracking-tight">{editingMotoId ? t('profile.editMoto') || 'Edit Motorcycle' : t('profile.addMoto')}</h3>
                      <form onSubmit={handleMotoSubmit} className="space-y-6">
                        <div className="grid sm:grid-cols-3 gap-6">
                          <div className="space-y-2">
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-steel ml-1">{t('profile.make')}</label>
                            <input
                              type="text"
                              placeholder={t('profile.makePlaceholder')}
                              required
                              value={motoData.make || ''}
                              onChange={(e) => setMotoData({...motoData, make: e.target.value})}
                              className="input-field"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-steel ml-1">{t('profile.model')}</label>
                            <input
                              type="text"
                              placeholder={t('profile.modelPlaceholder')}
                              required
                              value={motoData.model || ''}
                              onChange={(e) => setMotoData({...motoData, model: e.target.value})}
                              className="input-field"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-steel ml-1">{t('profile.year')}</label>
                            <input
                              type="number"
                              placeholder={t('profile.year')}
                              required
                              value={motoData.year || ''}
                              onChange={(e) => setMotoData({...motoData, year: e.target.value})}
                              className="input-field"
                            />
                          </div>
                        </div>
                        <div className="pt-6 border-t border-white/5">
                          <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xs font-mono font-bold text-steel uppercase tracking-widest">Motorcycle Photo</h3>
                            <button
                              type="button"
                              onClick={() => {
                                if (motoData.make && motoData.model) {
                                  setMotoData({...motoData, image_url: `https://loremflickr.com/800/400/motorcycle,${motoData.make},${motoData.model}/all`});
                                  showNotification('success', 'Photo fetched successfully!');
                                } else {
                                  showNotification('error', 'Please enter make and model first.');
                                }
                              }}
                              className="text-[10px] font-mono font-bold text-primary hover:text-oil uppercase tracking-widest transition-all"
                            >
                              Fetch Photo
                            </button>
                          </div>
                          <div className="flex flex-col gap-4">
                            {(motoData.image_url || motoData.photo) && (
                              <div className="relative w-full h-48 rounded-xl overflow-hidden border border-white/10">
                                <img 
                                  src={motoData.photo ? URL.createObjectURL(motoData.photo) : motoData.image_url} 
                                  alt="Motorcycle preview" 
                                  className="w-full h-full object-cover" 
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMotoData({...motoData, image_url: undefined, photo: null});
                                    if (motoImageInputRef.current) motoImageInputRef.current.value = '';
                                  }}
                                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              ref={motoImageInputRef}
                              onChange={(e) => setMotoData({...motoData, photo: e.target.files?.[0] || null})}
                              className="input-field"
                            />
                          </div>
                        </div>
                        {!editingMotoId && (
                          <div className="pt-6 border-t border-white/5">
                            <h3 className="text-xs font-mono font-bold text-steel uppercase tracking-widest mb-6">{t('profile.initialLog')}</h3>
                            <div className="grid sm:grid-cols-3 gap-6">
                              <input
                                type="text"
                                placeholder={t('profile.service')}
                                value={motoData.last_service || ''}
                                onChange={(e) => setMotoData({...motoData, last_service: e.target.value})}
                                className="input-field"
                              />
                              <input
                                type="number"
                                placeholder={t('profile.kmPlaceholder')}
                                value={motoData.last_km || ''}
                                onChange={(e) => setMotoData({...motoData, last_km: e.target.value})}
                                className="input-field"
                              />
                              <input
                                type="text"
                                placeholder={t('profile.shop')}
                                value={motoData.last_shop || ''}
                                onChange={(e) => setMotoData({...motoData, last_shop: e.target.value})}
                                className="input-field"
                              />
                            </div>
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full btn-primary"
                        >
                          {isSubmitting ? (editingMotoId ? t('profile.updating') : t('profile.adding')) : (editingMotoId ? t('profile.updateMoto') : t('profile.addToGarage'))}
                        </button>
                      </form>
                    </motion.div>
                  )}
                  
                  {data.garage && data.garage.length > 0 ? (
                    <div className="grid sm:grid-cols-2 gap-8">
                      {data.garage.map((moto: any) => (
                        <div key={moto.id} className="glass-card group hover:border-primary/30 transition-all relative overflow-hidden flex flex-col">
                          {/* Card Header with Background */}
                          <div className="h-32 bg-asphalt relative overflow-hidden">
                            <div 
                              className="absolute inset-0 bg-cover bg-center opacity-20 group-hover:opacity-40 transition-opacity duration-700 grayscale group-hover:grayscale-0" 
                              style={{ backgroundImage: `url('${moto.image_url || `https://picsum.photos/seed/${moto.make}-${moto.model}/800/400`}')` }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-carbon to-transparent" />
                            
                            <div className="absolute bottom-4 left-6">
                              <div className="text-[10px] font-mono font-black text-primary mb-1 uppercase tracking-[0.2em]">{moto.year}</div>
                              <h3 className="text-2xl font-display font-black uppercase italic tracking-tight leading-none">{moto.make}</h3>
                              <p className="text-steel font-mono text-[10px] uppercase tracking-widest mt-1">{moto.model}</p>
                            </div>

                            {canEdit && (
                              <div className="absolute top-4 right-4 flex gap-2">
                                <button 
                                  onClick={() => {
                                    setEditingMotoId(moto.id);
                                    setMotoData({
                                      make: moto.make,
                                      model: moto.model,
                                      year: moto.year.toString(),
                                      last_service: '',
                                      last_km: '',
                                      last_shop: '',
                                      photo: null,
                                      image_url: moto.image_url
                                    });
                                    setIsAddingMoto(true);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="p-2 bg-carbon/80 backdrop-blur-md rounded-lg border border-white/5 text-steel hover:text-primary transition-all"
                                  title={t('profile.editMoto') || 'Edit Motorcycle'}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteMoto(moto.id)}
                                  className="p-2 bg-carbon/80 backdrop-blur-md rounded-lg border border-white/5 text-steel hover:text-red-500 transition-all"
                                  title={t('profile.deleteMoto') || 'Delete Motorcycle'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => setActiveMaintenanceMotoId(activeMaintenanceMotoId === moto.id ? null : moto.id)}
                                  className="p-2 bg-carbon/80 backdrop-blur-md rounded-lg border border-white/5 text-steel hover:text-primary transition-all"
                                  title={t('profile.addLog')}
                                >
                                  <Plus className={`w-4 h-4 transition-transform duration-300 ${activeMaintenanceMotoId === moto.id ? 'rotate-45 text-primary' : ''}`} />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="p-6 flex-1 flex flex-col">
                            {activeMaintenanceMotoId === moto.id && (
                              <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-6 p-5 bg-primary/5 rounded-2xl border border-primary/20"
                              >
                                <h4 className="text-[10px] font-mono font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <Wrench className="w-3 h-3" />
                                  {t('profile.newMaintenance')}
                                </h4>
                                <form onSubmit={(e) => handleMaintenanceSubmit(e, moto.id)} className="space-y-4">
                                  <input
                                    type="text"
                                    placeholder={t('profile.service')}
                                    required
                                    value={maintenanceData.service || ''}
                                    onChange={(e) => setMaintenanceData({...maintenanceData, service: e.target.value})}
                                    className="input-field py-2 text-sm"
                                  />
                                  <div className="grid grid-cols-2 gap-4">
                                    <input
                                      type="number"
                                      placeholder={t('profile.kmPlaceholder')}
                                      value={maintenanceData.km || ''}
                                      onChange={(e) => setMaintenanceData({...maintenanceData, km: e.target.value})}
                                      className="input-field py-2 text-sm"
                                    />
                                    <input
                                      type="text"
                                      placeholder={t('profile.shop')}
                                      value={maintenanceData.shop || ''}
                                      onChange={(e) => setMaintenanceData({...maintenanceData, shop: e.target.value})}
                                      className="input-field py-2 text-sm"
                                    />
                                  </div>
                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full btn-primary py-2 text-xs"
                                  >
                                    {isSubmitting ? t('profile.saving') : t('profile.saveLog')}
                                  </button>
                                </form>
                              </motion.div>
                            )}

                            {moto.maintenance_logs && moto.maintenance_logs.length > 0 ? (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 text-[10px] font-mono font-black text-steel uppercase tracking-widest">
                                    <Clock className="w-3 h-3" />
                                    {t('profile.maintenance')}
                                  </div>
                                  <span className="text-[9px] font-mono text-steel bg-white/5 px-2 py-0.5 rounded uppercase">
                                    {moto.maintenance_logs.length} {t('profile.logs')}
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {moto.maintenance_logs.slice(0, 3).map((log: any) => (
                                    <div key={log.id} className="bg-asphalt/40 p-4 rounded-2xl border border-white/5 group/log hover:border-primary/20 transition-all">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="font-display font-bold text-sm text-chrome group-hover/log:text-primary transition-colors">{log.service}</div>
                                        <div className="text-[9px] font-mono text-steel bg-carbon px-2 py-0.5 rounded uppercase">
                                          {new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </div>
                                      </div>
                                      <div className="flex gap-4 text-[10px] font-mono text-steel uppercase tracking-widest">
                                        {log.km && (
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-steel">KM:</span>
                                            <span className="text-steel">{log.km.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {log.shop && (
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-steel">{t('profile.shop')}:</span>
                                            <span className="text-steel truncate max-w-[80px]">{log.shop}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {moto.maintenance_logs.length > 3 && (
                                    <button className="w-full py-2 text-[10px] font-mono font-bold text-steel hover:text-primary uppercase tracking-widest transition-colors">
                                      {t('profile.viewAllHistory')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex-1 flex flex-col items-center justify-center py-8 text-center opacity-40">
                                <Wrench className="w-8 h-8 text-steel mb-3" />
                                <p className="text-[10px] font-mono uppercase tracking-widest text-steel">{t('profile.noMaintenance')}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-carbon/50 border border-white/5 rounded-2xl p-8 text-center">
                      <Wrench className="w-8 h-8 text-steel mx-auto mb-3" />
                      <h3 className="text-lg font-medium mb-1">{t('profile.emptyGarage')}</h3>
                      <p className="text-steel text-sm">{t('profile.noMoto')}</p>
                    </div>
                  )}
                </section>
              </motion.div>
            )}

            {activeTab === 'events' && isRider && (
              <motion.div
                key="events-rider"
                initial="initial"
                animate="animate"
                exit="exit"
                variants={tabContentVariants}
                transition={{ duration: 0.3 }}
                className="space-y-12"
              >
                <section>
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-2xl">
                        <Calendar className="w-6 h-6 text-primary" />
                      </div>
                      <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">{t('profile.myEvents')}</h2>
                    </div>
                    {canEdit && (
                      <button 
                        onClick={() => {
                          setIsCreatingEvent(!isCreatingEvent);
                          if (isCreatingEvent) {
                            setEditingEventId(null);
                            setEventData({ title: '', description: '', date: '', time: '', location: '', image_url: '', category: 'road_trip' });
                          }
                        }}
                        className="flex items-center gap-2 text-primary hover:text-oil font-display font-bold text-xs uppercase tracking-widest transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        {isCreatingEvent ? t('profile.cancel') : t('events.create')}
                      </button>
                    )}
                  </div>

                  {isCreatingEvent && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="glass-card p-8 mb-12 border-primary/20"
                    >
                      <h3 className="text-xl font-display font-bold mb-6 uppercase italic tracking-tight">{editingEventId ? t('profile.editEvent') : t('profile.createNewEvent')}</h3>
                      <form onSubmit={handleEventSubmit} className="space-y-6">
                        <div className="grid sm:grid-cols-2 gap-6">
                          <input
                            type="text"
                            placeholder={t('profile.eventTitle')}
                            required
                            value={eventData.title || ''}
                            onChange={(e) => setEventData({...eventData, title: e.target.value})}
                            className="input-field"
                          />
                          <select
                            required
                            value={eventData.category || 'road_trip'}
                            onChange={(e) => setEventData({...eventData, category: e.target.value})}
                            className="input-field appearance-none"
                          >
                            <option value="road_trip">{t('events.category.road_trip')}</option>
                            <option value="club_meetup">{t('events.category.club_meetup')}</option>
                            <option value="shop_event">{t('events.category.shop_event')}</option>
                            <option value="track_day">{t('events.category.track_day')}</option>
                            <option value="other">{t('events.category.other')}</option>
                          </select>
                          <input
                            type="date"
                            required
                            value={eventData.date || ''}
                            onChange={(e) => setEventData({...eventData, date: e.target.value})}
                            className="input-field"
                          />
                          <input
                            type="text"
                            placeholder={t('profile.eventTimePlaceholder')}
                            value={eventData.time || ''}
                            onChange={(e) => setEventData({...eventData, time: e.target.value})}
                            className="input-field"
                          />
                          <LocationAutocomplete
                            value={eventData.location}
                            onChange={(value) => setEventData({...eventData, location: value})}
                            placeholder={t('profile.eventLocation')}
                          />
                          
                          <div className="space-y-2">
                            <label className="block text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('event.field.participationBadge')}</label>
                            <select
                              value={eventData.participation_badge_id || ''}
                              onChange={(e) => setEventData({...eventData, participation_badge_id: e.target.value ? parseInt(e.target.value) : null})}
                              className="input-field appearance-none"
                            >
                              <option value="">{t('event.modal.noBadge')}</option>
                              {createdBadges.map(badge => (
                                <option key={badge.badge_id} value={badge.badge_id}>{badge.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('event.field.participationStamp')}</label>
                            <select
                              value={eventData.participation_stamp_id || ''}
                              onChange={(e) => setEventData({...eventData, participation_stamp_id: e.target.value ? parseInt(e.target.value) : null})}
                              className="input-field appearance-none"
                            >
                              <option value="">{t('event.modal.noBadge')}</option>
                              {createdStamps.map(stamp => (
                                <option key={stamp.id} value={stamp.id}>{stamp.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <label className="block text-[10px] font-mono font-bold text-steel uppercase tracking-widest ml-1">{t('profile.eventImage')}</label>
                          <div className="flex items-center gap-6">
                            <div 
                              onClick={() => eventImageInputRef.current?.click()}
                              className="w-32 h-32 rounded-3xl bg-asphalt border border-white/5 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-all overflow-hidden relative group shadow-xl"
                            >
                              {eventData.image_url ? (
                                <>
                                  <img src={eventData.image_url} alt="Event" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <ImageIcon className="w-8 h-8 text-white" />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <ImageIcon className="w-8 h-8 text-engine mb-2" />
                                  <span className="text-[10px] text-steel font-mono uppercase tracking-widest">{t('profile.upload')}</span>
                                </>
                              )}
                              {isUploadingEventImage && (
                                <div className="absolute inset-0 bg-asphalt/80 flex items-center justify-center">
                                  <Clock className="w-6 h-6 text-primary animate-spin" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-steel mb-4 font-light leading-relaxed">{t('profile.uploadDesc')}</p>
                              <input 
                                type="file" 
                                ref={eventImageInputRef}
                                onChange={handleEventImageUpload}
                                accept="image/*"
                                className="hidden"
                              />
                              {eventData.image_url && (
                                <button 
                                  type="button"
                                  onClick={() => setEventData(prev => ({ ...prev, image_url: '' }))}
                                  className="text-[10px] font-mono font-bold text-accent uppercase tracking-widest hover:text-red-400 transition-colors"
                                >
                                  {t('profile.removeImage')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <textarea
                          placeholder={t('profile.eventDescription')}
                          rows={4}
                          value={eventData.description || ''}
                          onChange={(e) => setEventData({...eventData, description: e.target.value})}
                          className="input-field resize-none"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting || isUploadingEventImage}
                          className="w-full btn-primary py-4"
                        >
                          {isSubmitting ? (editingEventId ? t('profile.updating') : t('profile.creating')) : (editingEventId ? t('profile.updateEvent') : t('profile.publishEvent'))}
                        </button>
                      </form>
                    </motion.div>
                  )}

                  <div className="grid gap-8">
                    {/* Created Events */}
                    {data.events && data.events.length > 0 && (
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 px-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <h3 className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.3em]">{t('profile.hostedBy')} {isOwner ? t('profile.me') : data.username}</h3>
                        </div>
                        <div className="grid gap-4">
                          {data.events.map((event: any) => (
                            <EventCard 
                              key={event.id} 
                              event={event} 
                              onRSVP={handleRSVP} 
                              onEdit={handleEditEvent}
                              isOwner={canEdit}
                              currentUsername={currentUser?.username}
                              hasRSVPd={data.rsvpd_events?.some((re: any) => re.id === event.id)}
                              t={t}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RSVP'd Events */}
                    {data.rsvpd_events && data.rsvpd_events.length > 0 && (
                      <div className="space-y-6">
                        <div className="flex items-center gap-3 px-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <h3 className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.3em]">{t('profile.attending')}</h3>
                        </div>
                        <div className="grid gap-4">
                          {data.rsvpd_events.map((event: any) => (
                            <EventCard 
                              key={event.id} 
                              event={event} 
                              onRSVP={handleRSVP} 
                              currentUsername={currentUser?.username}
                              hasRSVPd={true}
                              t={t}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {(!data.events || data.events.length === 0) && (!data.rsvpd_events || data.rsvpd_events.length === 0) && (
                      <div className="bg-carbon/50 border border-white/5 rounded-2xl p-8 text-center">
                        <Calendar className="w-8 h-8 text-steel mx-auto mb-3" />
                        <h3 className="text-lg font-medium mb-1">{t('profile.noEvents')}</h3>
                        <p className="text-steel text-sm">{t('profile.noEventsDesc')}</p>
                      </div>
                    )}
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'about' && !isRider && (
              <motion.div
                key="about"
                initial="initial"
                animate="animate"
                exit="exit"
                variants={tabContentVariants}
                transition={{ duration: 0.3 }}
                className="space-y-12"
              >
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-primary/10 rounded-2xl">
                      <Building2 className="w-6 h-6 text-primary" />
                    </div>
                    <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">{t('profile.aboutUs')}</h2>
                  </div>
                  
                  <div className="grid md:grid-cols-3 gap-8">
                    <div className="md:col-span-1 glass-card p-8 space-y-8 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                      <div className="space-y-2 relative z-10">
                        <h4 className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-steel">{t('profile.category')}</h4>
                        <p className="text-lg font-display font-black uppercase italic text-primary">{data.profile ? (t(`category.${data.profile.service_category}`) || data.profile.service_category) : ''}</p>
                      </div>
                      <div className="space-y-2 relative z-10">
                        <h4 className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-steel">{t('profile.address')}</h4>
                        <p className="text-sm text-chrome font-light leading-relaxed">{data.profile?.full_address}</p>
                      </div>
                    </div>
                    <div className="md:col-span-2 glass-card p-10 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                      <p className="text-xl text-chrome leading-relaxed font-light relative z-10 italic">
                        {data.profile?.details || t('profile.noDetails')}
                      </p>
                    </div>
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'services' && !isRider && (
              <motion.div
                key="services"
                initial="initial"
                animate="animate"
                exit="exit"
                variants={tabContentVariants}
                transition={{ duration: 0.3 }}
                className="space-y-12"
              >
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-primary/10 rounded-2xl">
                      <Wrench className="w-6 h-6 text-primary" />
                    </div>
                    <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">{t('profile.services')}</h2>
                  </div>
                  
                  <div className="glass-card p-8">
                    {data.services ? (
                      <div className="flex flex-wrap gap-3">
                        {data.services.split(',').map((service: string, index: number) => (
                          <span 
                            key={index}
                            className="px-4 py-2 bg-asphalt/50 border border-white/10 rounded-xl text-sm font-medium text-chrome flex items-center gap-2"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            {service.trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Wrench className="w-12 h-12 text-steel mx-auto mb-4 opacity-50" />
                        <p className="text-steel font-light">{t('profile.noDetails')}</p>
                      </div>
                    )}
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'events' && !isRider && (
              <motion.div
                key="events-shop"
                initial="initial"
                animate="animate"
                exit="exit"
                variants={tabContentVariants}
                transition={{ duration: 0.3 }}
                className="space-y-12"
              >
                <section>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-xl">
                        <Calendar className="w-5 h-5 text-accent" />
                      </div>
                      <h2 className="text-2xl font-bold">{t('admin.tab.events')}</h2>
                    </div>
                    {canEdit && (
                      <button 
                        onClick={() => setIsCreatingEvent(!isCreatingEvent)}
                        className="flex items-center gap-2 text-primary hover:text-accent font-bold text-sm transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {isCreatingEvent ? t('profile.cancel') : t('events.create')}
                      </button>
                    )}
                  </div>

                  {isCreatingEvent && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-carbon/50 border border-primary/20 rounded-3xl p-6 mb-8 overflow-hidden"
                    >
                      <form onSubmit={handleEventSubmit} className="space-y-4">
                        {notification && (
                          <div className={`p-4 rounded-xl text-sm font-bold ${notification.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {notification.message}
                          </div>
                        )}
                        <div className="grid sm:grid-cols-2 gap-4">
                          <input
                            type="text"
                            placeholder={t('event.field.title')}
                            required
                            value={eventData.title || ''}
                            onChange={(e) => setEventData({...eventData, title: e.target.value})}
                            className="w-full bg-asphalt border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-primary transition-all"
                          />
                          <select
                            required
                            value={eventData.category || 'road_trip'}
                            onChange={(e) => setEventData({...eventData, category: e.target.value})}
                            className="w-full bg-asphalt border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-primary transition-all appearance-none"
                          >
                            <option value="road_trip">{t('events.category.road_trip')}</option>
                            <option value="club_meetup">{t('events.category.club_meetup')}</option>
                            <option value="shop_event">{t('events.category.shop_event')}</option>
                            <option value="track_day">{t('events.category.track_day')}</option>
                            <option value="other">{t('events.category.other')}</option>
                          </select>
                          <input
                            type="date"
                            required
                            value={eventData.date || ''}
                            onChange={(e) => setEventData({...eventData, date: e.target.value})}
                            className="w-full bg-asphalt border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-primary transition-all"
                          />
                          <input
                            type="text"
                            placeholder={t('event.field.time')}
                            value={eventData.time || ''}
                            onChange={(e) => setEventData({...eventData, time: e.target.value})}
                            className="w-full bg-asphalt border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-primary transition-all"
                          />
                          <LocationAutocomplete
                            value={eventData.location}
                            onChange={(value) => setEventData({...eventData, location: value})}
                            placeholder={t('event.field.location')}
                          />
                        </div>
                        <textarea
                          placeholder={t('event.field.description')}
                          rows={3}
                          value={eventData.description || ''}
                          onChange={(e) => setEventData({...eventData, description: e.target.value})}
                          className="w-full bg-asphalt border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-primary transition-all resize-none"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full bg-primary text-asphalt py-3 rounded-xl font-bold hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          {isSubmitting ? t('event.btn.creating') : t('event.btn.publish')}
                        </button>
                      </form>
                    </motion.div>
                  )}

                  <div className="grid gap-6">
                    {/* Created Events */}
                    {data.events && data.events.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-steel uppercase tracking-widest px-2">{t('profile.hostedBy')} {isOwner ? t('profile.me') : data.username}</h3>
                        <div className="grid gap-4">
                          {data.events.map((event: any) => (
                            <EventCard 
                              key={event.id} 
                              event={event} 
                              onRSVP={handleRSVP} 
                              currentUsername={currentUser?.username}
                              hasRSVPd={data.rsvpd_events?.some((re: any) => re.id === event.id)}
                              isOwner={canEdit}
                              t={t}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RSVP'd Events */}
                    {data.rsvpd_events && data.rsvpd_events.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-steel uppercase tracking-widest px-2">{t('profile.attending')}</h3>
                        <div className="grid gap-4">
                          {data.rsvpd_events.map((event: any) => (
                            <EventCard 
                              key={event.id} 
                              event={event} 
                              onRSVP={handleRSVP} 
                              currentUsername={currentUser?.username}
                              hasRSVPd={true}
                              t={t}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {(!data.events || data.events.length === 0) && (!data.rsvpd_events || data.rsvpd_events.length === 0) && (
                      <div className="bg-carbon/50 border border-white/5 rounded-2xl p-8 text-center">
                        <Calendar className="w-8 h-8 text-steel mx-auto mb-3" />
                        <h3 className="text-lg font-medium mb-1">{t('profile.noEvents')}</h3>
                        <p className="text-steel text-sm">{t('profile.noEventsDesc')}</p>
                      </div>
                    )}
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'updates' && (
              <motion.div
                key="updates"
                initial="initial"
                animate="animate"
                exit="exit"
                variants={tabContentVariants}
                transition={{ duration: 0.3 }}
                className="space-y-12"
              >
                {/* Feed Section */}
                <section className="space-y-12">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-primary/10 rounded-2xl">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">{t('profile.updates')}</h2>
              </div>

              {canEdit && (
                <div className="glass-card p-6 sm:p-8 border-primary/20 shadow-xl shadow-primary/5 mb-12">
                  <form onSubmit={handlePostSubmit}>
                    <div className="flex gap-6">
                      <div className="w-14 h-14 rounded-[1.25rem] bg-asphalt border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                        {data.profile?.avatar_url ? (
                          <img src={data.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-6 h-6 text-steel" />
                        )}
                      </div>
                      <div className="flex-1 space-y-6">
                        <textarea
                          value={postContent || ''}
                          onChange={(e) => setPostContent(e.target.value)}
                          placeholder={t('profile.whatsOnMind')}
                          className="w-full bg-transparent border-none focus:ring-0 text-xl text-chrome placeholder:text-steel resize-none p-0 font-light"
                          rows={3}
                        />

                        {postPreview && (
                          <div className="relative rounded-2xl overflow-hidden border border-white/10 group">
                            <img src={postPreview} alt="Preview" className="w-full aspect-video object-cover" />
                            <button 
                              type="button"
                              onClick={() => {
                                setPostImage(null);
                                setPostPreview(null);
                              }}
                              className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-lg text-white hover:bg-red-500 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6 border-t border-white/5">
                          <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
                            <button 
                              type="button" 
                              onClick={() => postImageInputRef.current?.click()}
                              className="p-2.5 text-steel hover:text-primary transition-all rounded-xl hover:bg-primary/5"
                            >
                              <ImageIcon className="w-5 h-5" />
                            </button>
                            <input 
                              type="file" 
                              ref={postImageInputRef} 
                              onChange={handleFileChange} 
                              accept="image/*" 
                              className="hidden" 
                            />
                            
                            {data.garage && data.garage.length > 0 && (
                              <div className="relative">
                                <select
                                  value={taggedMotorcycleId || ''}
                                  onChange={(e) => setTaggedMotorcycleId(e.target.value)}
                                  className="bg-carbon border border-white/10 rounded-lg px-3 py-1.5 text-xs text-steel focus:outline-none focus:border-primary/50 appearance-none pr-8"
                                >
                                  <option value="">{t('profile.tagBike')}</option>
                                  {data.garage.map((moto: any) => (
                                    <option key={moto.id} value={moto.id}>{moto.year} {moto.make}</option>
                                  ))}
                                </select>
                                <Bike className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-primary pointer-events-none" />
                              </div>
                            )}

                            <select
                              value={postPrivacy || ''}
                              onChange={(e) => setPostPrivacy(e.target.value)}
                              className="bg-carbon border border-white/10 rounded-lg px-3 py-1.5 text-xs text-steel focus:outline-none focus:border-primary/50"
                            >
                              <option value="public">{t('profile.public')}</option>
                              <option value="followers">{t('profile.followersOnly')}</option>
                            </select>
                          </div>
                          <button
                            type="submit"
                            disabled={isSubmitting || (!postContent.trim() && !postImage)}
                            className="btn-primary py-2.5 px-10 text-xs font-black uppercase tracking-[0.2em] italic w-full sm:w-auto"
                          >
                            {isSubmitting ? t('profile.posting') : t('profile.post')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              )}

              <div className="flex flex-col gap-12">
                {data.posts && data.posts.length > 0 ? (
                  data.posts.map((post: any) => (
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
                      className="glass-card overflow-hidden group hover:border-white/10 transition-all"
                    >
                      <div className="p-6 sm:p-10">
                        <div className="flex items-start sm:items-center justify-between mb-8 sm:mb-10 gap-4">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-steel">
                            {post.is_pinned_by_owner === 1 && (
                              <div className="flex items-center gap-1 text-primary mr-2">
                                <Pin className="w-3 h-3 fill-primary" />
                                <span>{t('profile.pinned')}</span>
                              </div>
                            )}
                            <Clock className="w-4 h-4" />
                            <span>{new Date(post.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                            {post.privacy_level === 'followers' && (
                              <span className="bg-engine text-steel px-2 py-1 rounded ml-2">{t('profile.followersOnly')}</span>
                            )}
                          </div>
                          <button className="text-steel hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg">
                            <Share2 className="w-4 h-4" />
                          </button>
                        </div>
                        
                        {post.content && (
                          <p className="text-chrome leading-relaxed whitespace-pre-wrap mb-8 sm:mb-10 font-light text-lg sm:text-2xl break-words">
                            {renderPostContent(post.content)}
                          </p>
                        )}
                        
                        {post.image_url && (
                          <div className="rounded-[2.5rem] overflow-hidden mb-10 border border-white/5 shadow-2xl relative group/img">
                            <img src={post.image_url} alt="" className="w-full aspect-video object-cover grayscale group-hover/img:grayscale-0 transition-all duration-1000 scale-105 group-hover/img:scale-100" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-500" />
                          </div>
                        )}

                        {post.shared_event_id && (
                          <Link to={`/events/${post.shared_event_id}`} className="block mb-10 group/event">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8 p-4 sm:p-6 rounded-[2rem] border border-white/10 bg-carbon/30 hover:bg-carbon/60 hover:border-primary/30 transition-all duration-500 overflow-hidden relative group/card">
                              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />
                              
                              <div className="w-full sm:w-32 h-48 sm:h-32 shrink-0 rounded-2xl overflow-hidden relative shadow-2xl">
                                <img src={post.shared_event_image_url} alt={post.shared_event_title} className="w-full h-full object-cover grayscale group-hover/event:grayscale-0 transition-all duration-700 scale-110 group-hover/card:scale-100" referrerPolicy="no-referrer" />
                                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl" />
                              </div>
                              
                              <div className="flex-1 min-w-0 py-2 relative z-10">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="text-[10px] font-mono font-black text-primary uppercase tracking-[0.2em] px-3 py-1 rounded-full bg-primary/10 border border-primary/20">{t('profile.eventLabel')}</div>
                                  <div className="h-px w-8 bg-white/10" />
                                </div>
                                
                                <h4 className="text-2xl sm:text-3xl font-display font-black uppercase italic tracking-tight text-white group-hover/card:text-primary transition-colors duration-500 mb-4 line-clamp-1">
                                  {post.shared_event_title}
                                </h4>
                                
                                <div className="flex flex-wrap items-center gap-6 text-steel text-xs font-mono uppercase tracking-widest">
                                  {post.shared_event_date && (
                                    <span className="flex items-center gap-2 text-steel">
                                      <Calendar className="w-4 h-4 text-primary" /> 
                                      {new Date(post.shared_event_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                  )}
                                  {post.shared_event_location && (
                                    <span className="flex items-center gap-2 truncate max-w-[200px]">
                                      <MapPin className="w-4 h-4 text-primary" /> 
                                      {post.shared_event_location}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0 translate-x-4 transition-all duration-500">
                                <ArrowRight className="w-8 h-8 text-primary" />
                              </div>
                            </div>
                          </Link>
                        )}

                        {post.tagged_motorcycle_id && (
                          <div className="flex items-center gap-3 text-[10px] font-mono font-black text-primary bg-primary/5 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-primary/10 w-fit max-w-full uppercase tracking-[0.2em] italic mt-6">
                            <Bike className="w-4 h-4 shrink-0" />
                            <span className="truncate">{post.year} {post.make} {post.model}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="px-6 sm:px-10 py-6 sm:py-8 border-t border-white/5 flex flex-wrap items-center gap-6 sm:gap-12 bg-asphalt/30">
                        <button 
                          onClick={() => handleLike(post.id)}
                          className={`flex items-center gap-3 transition-all group/btn px-4 py-2 rounded-full ${
                            post.has_liked 
                              ? 'bg-primary/10 text-primary border border-primary/20' 
                              : 'text-steel hover:text-primary hover:bg-primary/5 border border-transparent'
                          }`}
                        >
                          <Heart className={`w-5 h-5 transition-all ${post.has_liked ? 'fill-primary' : 'group-hover/btn:fill-primary'}`} />
                          <div className="flex flex-col items-start leading-none">
                            <span className="text-[11px] font-mono font-black tracking-widest">{post.likes_count || 0}</span>
                            <span className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-60">{t('profile.respect')}</span>
                          </div>
                        </button>
                        <button 
                          onClick={() => toggleComments(post.id)}
                          className={`flex items-center gap-3 transition-all group/btn px-4 py-2 rounded-full ${
                            expandedComments[post.id]
                              ? 'bg-primary/10 text-primary border border-primary/20'
                              : 'text-steel hover:text-white hover:bg-white/5 border border-transparent'
                          }`}
                        >
                          <MessageSquare className={`w-6 h-6 transition-all ${expandedComments[post.id] ? 'text-primary' : 'group-hover/btn:text-primary'}`} />
                          <div className="flex flex-col items-start leading-none">
                            <span className="text-[11px] font-mono font-black tracking-widest">{post.comment_count || 0}</span>
                            <span className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-60">{t('profile.comments') || 'Comments'}</span>
                          </div>
                        </button>
                        {canEdit && (
                          <button 
                            onClick={() => handlePin(post.id)}
                            className={`flex items-center gap-3 transition-all group/btn px-4 py-2 rounded-full ${
                              post.is_pinned === 1
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : 'text-steel hover:text-primary hover:bg-primary/5 border border-transparent'
                            }`}
                            title={post.is_pinned === 1 ? t('profile.unpinPost') : t('profile.pinPost')}
                          >
                            {post.is_pinned === 1 ? (
                              <PinOff className="w-5 h-5 transition-all fill-primary" />
                            ) : (
                              <Pin className={`w-5 h-5 transition-all group-hover/btn:fill-primary`} />
                            )}
                            <span className="text-sm font-mono font-black tracking-widest uppercase">
                              {post.is_pinned === 1 ? t('profile.unpin') : t('profile.pin')}
                            </span>
                          </button>
                        )}
                        <button className="flex items-center gap-3 text-steel hover:text-white transition-all group/btn ml-auto">
                          <Share2 className="w-6 h-6 group-hover/btn:text-primary transition-all" />
                        </button>
                      </div>

                      {/* Comments Section */}
                      <AnimatePresence>
                        {expandedComments[post.id] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-white/5 bg-carbon/20 overflow-hidden"
                          >
                            <div className="p-6 sm:p-10 space-y-8">
                              {/* Comment Input */}
                              {currentUser && (
                                <div className="flex gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-asphalt shrink-0 overflow-hidden border border-white/5">
                                    <img src={currentUser.profile_picture_url} alt="" className="w-full h-full object-cover" />
                                  </div>
                                  <div className="flex-1 relative">
                                    <textarea
                                      value={newComment[post.id] || ''}
                                      onChange={(e) => setNewComment(prev => ({ ...prev, [post.id]: e.target.value }))}
                                      placeholder={t('feed.writeComment') || "Write a comment..."}
                                      className="w-full bg-asphalt/50 border border-white/10 rounded-2xl py-3 px-4 text-sm text-chrome placeholder:text-steel focus:outline-none focus:border-primary/50 transition-all resize-none"
                                      rows={1}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          handleAddComment(post.id);
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() => handleAddComment(post.id)}
                                      disabled={isCommenting[post.id] || !newComment[post.id]?.trim()}
                                      className="absolute right-2 bottom-2 p-1.5 text-primary hover:text-accent disabled:opacity-50 transition-colors"
                                    >
                                      <Send className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Comments List */}
                              <div className="space-y-6">
                                {commentLoading[post.id] ? (
                                  <div className="flex justify-center py-4">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                  </div>
                                ) : postComments[post.id]?.length > 0 ? (
                                  postComments[post.id].map((comment: any) => (
                                    <div key={comment.id} className="flex gap-4 group/comment">
                                      <Link to={`/profile/${comment.username}`} className="shrink-0">
                                        <div className="w-10 h-10 rounded-xl bg-asphalt overflow-hidden border border-white/5 group-hover/comment:border-primary/30 transition-colors">
                                          <img src={comment.profile_picture_url} alt="" className="w-full h-full object-cover" />
                                        </div>
                                      </Link>
                                      <div className="flex-1 space-y-1">
                                        <div className="flex items-center justify-between">
                                          <Link to={`/profile/${comment.username}`} className="text-xs font-mono font-black text-chrome hover:text-primary transition-colors uppercase tracking-widest">
                                            {comment.name || comment.username}
                                          </Link>
                                          <span className="text-[9px] font-mono text-steel uppercase">
                                            {new Date(comment.created_at).toLocaleDateString()}
                                          </span>
                                        </div>
                                        <p className="text-sm text-steel leading-relaxed">
                                          {comment.content}
                                        </p>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-center py-8">
                                    <p className="text-xs font-mono text-steel uppercase tracking-widest opacity-40">
                                      {t('feed.noComments') || "No comments yet"}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.article>
                  ))
                ) : (
                  <div className="text-center py-32 glass-card border-dashed border-white/5 bg-transparent">
                    <MessageSquare className="w-16 h-16 text-carbon mx-auto mb-8" />
                    <p className="text-steel font-mono text-[10px] font-black uppercase tracking-[0.4em]">{t('profile.noUpdates')}</p>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}

        {activeTab === 'biker_passport' && (
          <motion.div
            key="biker_passport"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={tabContentVariants}
            transition={{ duration: 0.3 }}
            className="space-y-12"
          >
            {/* Header / Summary */}
            <section className="glass-card p-8 border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                <div className="w-32 h-32 rounded-full border-4 border-primary/20 flex items-center justify-center bg-asphalt shadow-xl shadow-primary/10">
                  <MapPin className="w-12 h-12 text-primary" />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-4xl font-display font-black uppercase italic tracking-tight mb-2">{t('profile.bikerPassport')}</h2>
                  <p className="text-steel font-mono text-sm uppercase tracking-widest mb-6">Digital Motorcycle Journey Log</p>
                  
                  <div className="flex flex-wrap justify-center md:justify-start gap-6">
                    <div className="bg-asphalt/50 px-6 py-3 rounded-2xl border border-white/5">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">Total Stamps</div>
                      <div className="font-display font-black text-2xl text-primary italic">{passportStamps.length}</div>
                    </div>
                    <div className="bg-asphalt/50 px-6 py-3 rounded-2xl border border-white/5">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">Badges Earned</div>
                      <div className="font-display font-black text-2xl text-accent italic">{badges.length}</div>
                    </div>
                    <div className="bg-asphalt/50 px-6 py-3 rounded-2xl border border-white/5">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">Rare Items</div>
                      <div className="font-display font-black text-2xl text-blue-400 italic">
                        {passportStamps.filter(s => s.rarity === 'rare' || s.rarity === 'epic' || s.rarity === 'legendary').length + badges.filter((b: any) => b.category === 'rare' || b.category === 'epic' || b.category === 'legendary').length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Stamps Section */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-primary/10 rounded-2xl">
                  <MapPin className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-display font-black uppercase italic tracking-tight">Travel Stamps</h3>
              </div>
              
              {passportStamps.length === 0 ? (
                <div className="glass-card p-12 text-center border-white/5">
                  <MapPin className="w-16 h-16 text-engine mx-auto mb-6" />
                  <h3 className="text-2xl font-display font-black uppercase italic mb-2">{t('profile.noStamps')}</h3>
                  <p className="text-steel font-light">{t('profile.noStampsDesc')}</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {passportStamps.map((stamp) => {
                    const IconComponent = {
                      'MapPin': MapPin,
                      'Activity': Activity,
                      'Heart': Heart,
                      'Star': Star,
                      'Mountain': Mountain,
                      'Bike': Bike,
                      'Building2': Building2,
                      'Calendar': Calendar,
                      'ShieldCheck': ShieldCheck
                    }[stamp.icon] || MapPin;

                    const rarityColors = {
                      common: 'text-steel bg-steel/10 border-steel/20',
                      rare: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
                      epic: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
                      legendary: 'text-accent bg-accent/10 border-accent/20'
                    };

                    return (
                      <div key={stamp.id} className="glass-card p-6 border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all duration-500 group-hover:bg-primary/10" />
                        
                        <div className="relative z-10 flex flex-col items-center text-center">
                          <div className={`p-4 rounded-2xl mb-4 border ${rarityColors[stamp.rarity as keyof typeof rarityColors]}`}>
                            <IconComponent className="w-8 h-8" />
                          </div>
                          
                          <h4 className="font-display font-black uppercase italic text-lg mb-1">{stamp.name}</h4>
                          <p className="text-xs text-steel mb-4 line-clamp-2">{stamp.description}</p>
                          
                          <div className="w-full pt-4 border-t border-white/5 flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
                              <span className="text-steel">{t('profile.issuedBy')}</span>
                              <span className="text-white font-bold">{stamp.ambassador_name || t('profile.platform')}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
                              <span className="text-steel">{t('profile.date')}</span>
                              <span className="text-chrome">{new Date(stamp.collected_at).toLocaleDateString(t('locale'))}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Achievements Section */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-accent/10 rounded-2xl">
                  <ShieldCheck className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-2xl font-display font-black uppercase italic tracking-tight">{t('profile.achievements')}</h3>
              </div>
              
              {badges.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {badges.map((badge: any) => {
                    const IconComponent = {
                      'MapPin': MapPin,
                      'Activity': Activity,
                      'Heart': Heart,
                      'Wrench': Wrench,
                      'Mountain': Mountain
                    }[badge.icon as string] || ShieldCheck;

                    return (
                      <div 
                        key={badge.user_badge_id} 
                        className="glass-card p-6 flex flex-col items-center text-center cursor-pointer hover:border-accent/50 transition-all group"
                        onClick={() => setSelectedBadge(badge)}
                      >
                      <div className="w-20 h-20 rounded-full bg-asphalt border-2 border-accent/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-accent/10 overflow-hidden">
                        {badge.icon && badge.icon.startsWith('/') ? (
                          <img src={badge.icon} alt={badge.name} className="w-full h-full object-cover" />
                        ) : (
                          <IconComponent className="w-10 h-10 text-accent" />
                        )}
                      </div>
                        <h3 className="text-sm font-bold text-white mb-1">{badge.name}</h3>
                        <p className="text-[10px] font-mono text-steel uppercase tracking-widest mb-3">{badge.category}</p>
                        <div className="text-[10px] text-steel mb-1">
                          {new Date(badge.awarded_date).toLocaleDateString(t('locale'))}
                        </div>
                        <div className="text-[10px] text-accent font-bold capitalize">
                          {t('profile.by')}: {badge.creator_username ? `@${badge.creator_username}` : t('profile.platform')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-32 glass-card border-dashed border-white/5 bg-transparent">
                  <ShieldCheck className="w-16 h-16 text-carbon mx-auto mb-8" />
                  <p className="text-steel font-mono text-[10px] font-black uppercase tracking-[0.4em]">{t('profile.noAchievements')}</p>
                </div>
              )}
            </section>

            {/* Legendary Roads Section */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-engine/10 rounded-2xl">
                  <Mountain className="w-6 h-6 text-engine" />
                </div>
                <h3 className="text-2xl font-display font-black uppercase italic tracking-tight">Legendary Roads</h3>
              </div>
              
              <div className="glass-card p-12 text-center border-white/5">
                <Mountain className="w-16 h-16 text-steel mx-auto mb-6 opacity-50" />
                <h3 className="text-2xl font-display font-black uppercase italic mb-2 text-steel">Coming Soon</h3>
                <p className="text-steel font-light">Conquer the world's most famous motorcycle routes to earn legendary stamps.</p>
              </div>
            </section>
          </motion.div>
        )}

        {activeTab === 'recommendations' && (
          <motion.div
            key="recommendations"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={tabContentVariants}
            transition={{ duration: 0.3 }}
            className="space-y-12"
          >
            <section>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-2xl">
                    <Star className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-3xl font-display font-black uppercase italic tracking-tight">{t('profile.recommendations')}</h2>
                </div>
                {canEdit && (
                  <button 
                    onClick={() => {
                      const form = document.getElementById('add-recommendation-form');
                      form?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="btn-primary py-2 px-6 text-[10px] uppercase tracking-widest italic"
                  >
                    {t('profile.addNew')}
                  </button>
                )}
              </div>
              
              <div className="grid md:grid-cols-2 gap-8 mb-12">
                {data.recommendations && data.recommendations.length > 0 ? (
                  data.recommendations.map((rec: any) => (
                    <div key={rec.id} className="glass-card p-8 group hover:border-primary/30 transition-all relative">
                      {canEdit && (
                        <button 
                          onClick={() => removeRecommendation(rec.id)} 
                          className="absolute top-6 right-6 text-steel hover:text-red-500 transition-colors p-2 hover:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <div className="flex items-start gap-6 mb-6">
                        <div className="w-16 h-16 rounded-2xl bg-asphalt flex items-center justify-center shrink-0 border border-white/5 group-hover:border-primary/30 transition-colors">
                          {rec.type === 'road' ? <MapPin className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-primary" />}
                        </div>
                        <div>
                          <h3 className="text-xl font-display font-black uppercase italic tracking-tight mb-1">{rec.item_name}</h3>
                          <div className="text-[10px] font-mono font-black text-primary uppercase tracking-widest">
                            {rec.type === 'road' ? t('profile.roadRoute') : t('profile.shopPlace')}
                          </div>
                        </div>
                      </div>
                      <p className="text-steel mb-6 leading-relaxed">{rec.item_description}</p>
                      {rec.description && (
                        <div className="bg-asphalt/50 p-6 rounded-2xl border border-white/5 mb-6">
                          <p className="text-sm text-chrome italic">"{rec.description}"</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-6 border-t border-white/5">
                        <span className="text-[10px] font-mono text-steel uppercase tracking-widest">
                          {new Date(rec.created_at).toLocaleDateString(t('locale'))}
                        </span>
                        <Link 
                          to={rec.type === 'road' ? `/roads?routeId=${rec.item_id}` : `/map?placeId=${rec.item_id}`}
                          className="btn-primary py-2 px-6 text-[10px] uppercase tracking-widest italic"
                        >
                          {t('profile.viewDetails')}
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 text-center py-20 glass-card border-dashed">
                    <Star className="w-12 h-12 text-engine mx-auto mb-4" />
                    <p className="text-steel font-mono text-xs uppercase tracking-widest">{t('profile.noRecommendations')}</p>
                  </div>
                )}
              </div>

              {canEdit && (
                <div id="add-recommendation-form" className="glass-card p-10 border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-primary/20 rounded-2xl">
                      <Plus className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-2xl font-display font-black uppercase italic tracking-tight">{t('profile.addNewRecommendation')}</h3>
                  </div>
                  
                  <form onSubmit={addRecommendation} className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono font-black uppercase tracking-widest text-steel ml-1">{t('profile.type')}</label>
                        <select 
                          value={newRec.type || ''} 
                          onChange={(e) => setNewRec({...newRec, type: e.target.value})} 
                          className="w-full bg-asphalt border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:border-primary/50 transition-all"
                        >
                          <option value="road">{t('profile.roadRoute')}</option>
                          <option value="shop">{t('profile.shopPlace')}</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono font-black uppercase tracking-widest text-steel ml-1">{t('profile.itemId')}</label>
                        <input 
                          type="text" 
                          placeholder={t('profile.itemIdPlaceholder')} 
                          value={newRec.item_id || ''} 
                          onChange={(e) => setNewRec({...newRec, item_id: e.target.value})} 
                          className="w-full bg-asphalt border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:border-primary/50 transition-all" 
                          required 
                        />
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono font-black uppercase tracking-widest text-steel ml-1">{t('profile.name')}</label>
                        <input 
                          type="text" 
                          placeholder={t('profile.displayName')} 
                          value={newRec.item_name || ''} 
                          onChange={(e) => setNewRec({...newRec, item_name: e.target.value})} 
                          className="w-full bg-asphalt border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:border-primary/50 transition-all" 
                          required 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono font-black uppercase tracking-widest text-steel ml-1">{t('profile.personalNote')}</label>
                        <textarea 
                          placeholder={t('profile.personalNotePlaceholder')} 
                          value={newRec.description || ''} 
                          onChange={(e) => setNewRec({...newRec, description: e.target.value})} 
                          className="w-full bg-asphalt border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:border-primary/50 transition-all resize-none" 
                          rows={1}
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2 pt-4">
                      <button 
                        type="submit" 
                        className="w-full btn-primary py-5 rounded-2xl text-xs font-black uppercase tracking-[0.3em] italic"
                      >
                        {t('profile.publishRecommendation')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </section>
          </motion.div>
        )}


      </AnimatePresence>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-4 space-y-8">
            <div className="glass-card overflow-hidden">
              <div className="p-8 border-b border-white/5 bg-asphalt/30">
                <h3 className="font-display font-black uppercase italic tracking-tight text-xl flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  {t('profile.networkStats')}
                </h3>
              </div>
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-asphalt/50 p-4 rounded-2xl border border-white/5 text-center">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">{t('profile.connections')}</div>
                    <div className="font-display font-black text-2xl text-primary italic">142</div>
                  </div>
                  <div className="bg-asphalt/50 p-4 rounded-2xl border border-white/5 text-center">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">{t('profile.reputation')}</div>
                    <div className="font-display font-black text-2xl text-oil italic">4.9</div>
                  </div>
                </div>

                {data.referral_code && (
                  <div className="bg-primary/5 p-4 rounded-2xl border border-primary/20 flex flex-col items-center justify-center gap-2">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold">{t('profile.yourReferralCode')}</div>
                    <div className="font-mono text-xl text-white tracking-[0.2em] bg-asphalt px-4 py-2 rounded-lg border border-white/10 select-all">
                      {data.referral_code}
                    </div>
                    <div className="text-[9px] text-steel text-center mt-1">{t('profile.referralDesc')}</div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
                    <span className="text-steel flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      {t('profile.joined')}
                    </span>
                    <span className="text-chrome font-bold">
                      {new Date(data.created_at).toLocaleDateString(t('locale'), { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  
                  {!isRider && (
                    <>
                      <div className="h-px bg-white/5" />
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest group cursor-pointer">
                          <div className="w-8 h-8 rounded-lg bg-asphalt flex items-center justify-center border border-white/5 group-hover:border-primary/30 transition-colors">
                            <Phone className="w-3.5 h-3.5 text-steel" />
                          </div>
                          <span className="text-steel group-hover:text-white transition-colors">+{data.profile.phone || '1 (555) 0123-4567'}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest group cursor-pointer">
                          <div className="w-8 h-8 rounded-lg bg-asphalt flex items-center justify-center border border-white/5 group-hover:border-primary/30 transition-colors">
                            <Globe className="w-3.5 h-3.5 text-steel" />
                          </div>
                          <a href={data.profile.website || "#"} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-oil transition-colors">{data.profile.website || `www.${data.username}.com`}</a>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Badge Detail Modal */}
      <AnimatePresence>
        {selectedBadge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedBadge(null)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-carbon border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-primary/20 to-transparent opacity-50" />
              
              <button 
                onClick={() => setSelectedBadge(null)}
                className="absolute top-4 right-4 p-2 bg-asphalt/50 hover:bg-engine rounded-full text-steel hover:text-white transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="relative z-10 flex flex-col items-center text-center mt-4">
                <div className="w-32 h-32 rounded-full bg-asphalt border-4 border-primary/30 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(242,125,38,0.2)] overflow-hidden">
                  {(() => {
                    if (selectedBadge.icon && selectedBadge.icon.startsWith('/')) {
                      return <img src={selectedBadge.icon} alt={selectedBadge.name} className="w-full h-full object-cover" />;
                    }
                    const IconComponent = {
                      'MapPin': MapPin,
                      'Activity': Activity,
                      'Heart': Heart,
                      'Wrench': Wrench,
                      'Mountain': Mountain
                    }[selectedBadge.icon as string] || ShieldCheck;
                    return <IconComponent className="w-16 h-16 text-primary" />;
                  })()}
                </div>
                
                <h2 className="text-3xl font-display font-black uppercase italic tracking-tight text-white mb-2">
                  {selectedBadge.name}
                </h2>
                
                <div className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest mb-6 border border-primary/20">
                  {selectedBadge.category}
                </div>
                
                <p className="text-chrome mb-8 leading-relaxed">
                  {selectedBadge.description}
                </p>
                
                <div className="w-full bg-asphalt/50 rounded-2xl p-6 border border-white/5 space-y-4 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-steel uppercase tracking-widest">{t('profile.earnedOn')}</span>
                    <span className="text-sm font-bold text-white">{new Date(selectedBadge.awarded_date).toLocaleDateString(t('locale'))}</span>
                  </div>
                  <div className="h-px bg-white/5 w-full" />
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono text-steel uppercase tracking-widest">{t('profile.issuedBy')}</span>
                    <span className="text-sm font-bold text-primary capitalize">
                      {selectedBadge.creator_username ? `@${selectedBadge.creator_username}` : t('profile.platform')}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EventCard({ event, onRSVP, onEdit, isOwner, currentUsername, hasRSVPd, t }: any) {
  return (
    <div className="glass-card p-6 flex items-center gap-8 group hover:border-primary/30 transition-all relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="w-24 h-24 bg-asphalt rounded-[1.5rem] flex flex-col items-center justify-center border border-white/5 shrink-0 group-hover:border-primary/30 transition-all shadow-2xl relative z-10 overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="text-primary text-[10px] font-mono font-black uppercase tracking-[0.2em] mb-1 relative z-10">
          {new Date(event.date + 'T12:00:00').toLocaleDateString(t('locale'), { month: 'short' })}
        </span>
        <span className="text-3xl font-display font-black leading-none italic relative z-10">
          {new Date(event.date + 'T12:00:00').getDate()}
        </span>
      </div>

      <div className="flex-1 relative z-10">
        <Link to={`/events/${event.id}`} className="block group/title">
          <h3 className="font-display font-black uppercase italic text-2xl mb-3 tracking-tight group-hover/title:text-primary transition-colors leading-none">{event.title}</h3>
        </Link>
        <div className="flex flex-wrap items-center gap-6 text-[10px] font-mono font-black uppercase tracking-[0.2em] text-steel">
          <div className="flex items-center gap-2.5">
            <Clock className="w-3.5 h-3.5 text-engine" />
            <span className="text-steel">{event.time}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <MapPin className="w-3.5 h-3.5 text-engine" />
            <span className="text-steel truncate max-w-[150px]">{event.location}</span>
          </div>
          <div className="flex items-center gap-2.5 text-primary">
            <Users className="w-3.5 h-3.5" />
            <span>{event.rsvp_count || 0} {t('profile.rsvps')}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 relative z-10">
        {event.is_promoted === 1 && (
          <div className="badge-primary italic font-black">
            {t('events.promoted')}
          </div>
        )}
        {isOwner && (
          <button 
            onClick={() => onEdit(event)}
            className="p-3 text-steel hover:text-primary transition-all rounded-xl hover:bg-primary/5 border border-transparent hover:border-primary/20"
            title={t('event.modal.editTitle')}
          >
            <Wrench className="w-4 h-4" />
          </button>
        )}
        {currentUsername && (
          <button 
            onClick={() => onRSVP(event.id)}
            className={`px-8 py-3 text-[10px] font-display font-black uppercase italic tracking-[0.2em] rounded-full border transition-all ${
              hasRSVPd 
                ? 'bg-primary text-asphalt border-primary hover:bg-oil' 
                : 'bg-white/5 text-white border-white/10 hover:bg-white/10'
            }`}
          >
            {hasRSVPd ? t('events.attending') : t('events.rsvp')}
          </button>
        )}
        <Link to={`/events/${event.id}`} className="p-3 text-engine hover:text-white transition-all transform group-hover:translate-x-1">
          <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    </div>
  );
}
