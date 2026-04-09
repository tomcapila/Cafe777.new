import { fetchWithAuth } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldAlert, Trash2, Ban, CheckCircle, Search, UserX, Settings, Users, Calendar, Star, ShieldCheck, XCircle, Camera, MapPin, Activity, Heart, Wrench, Mountain, ToggleLeft, ToggleRight, Trophy, Plus, Edit2, Shield, Image } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useFeatureFlags } from '../contexts/FeatureFlagContext';
import { useNotification } from '../contexts/NotificationContext';

export default function Admin() {
  const { t } = useLanguage();
  const { flags, toggleFlag } = useFeatureFlags();
  const { showNotification } = useNotification();
  const [users, setUsers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [eventPhotos, setEventPhotos] = useState<any[]>([]);
  const [ambassadorApps, setAmbassadorApps] = useState<any[]>([]);
  const [selectedContestFilter, setSelectedContestFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'users' | 'events' | 'submissions' | 'event_photos' | 'settings' | 'badges' | 'contests' | 'ambassadors'>(
    (searchParams.get('tab') as any) || 'users'
  );
  const [settings, setSettings] = useState<any>({});
  const [featureAccess, setFeatureAccess] = useState<any[]>([]);
  const [contestSettings, setContestSettings] = useState({ enabled: false, allowedTypes: ['premium'] });
  const [badges, setBadges] = useState<any[]>([]);
  const [stamps, setStamps] = useState<any[]>([]);
  const [editingBadge, setEditingBadge] = useState<any | null>(null);
  const [contests, setContests] = useState<any[]>([]);
  const [isCreatingContest, setIsCreatingContest] = useState(false);
  const [editingContest, setEditingContest] = useState<any>(null);
  const [newContest, setNewContest] = useState({ title: '', description: '', start_date: '', voting_start_date: '', end_date: '', prize_description: '', prize_badge_id: null as number | null, status: 'draft' });
  const [newBadge, setNewBadge] = useState({ item_type: 'badge', name: '', description: '', icon: 'ShieldCheck', category: 'General', creator_type: 'platform', creator_id: '' });
  const [isCreatingBadge, setIsCreatingBadge] = useState(false);
  const [shopSearchTerm, setShopSearchTerm] = useState('');
  const [isUploadingBadgeIcon, setIsUploadingBadgeIcon] = useState(false);
  const [awardingBadgeId, setAwardingBadgeId] = useState<number | null>(null);
  const [awardSearchTerm, setAwardSearchTerm] = useState('');
  const [selectedUserIdToAward, setSelectedUserIdToAward] = useState<number | null>(null);
  const [awardMessage, setAwardMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [badgeSearchTerm, setBadgeSearchTerm] = useState('');
  const [isBadgeSelectorOpen, setIsBadgeSelectorOpen] = useState(false);

  const handleAwardBadge = async () => {
    if (!awardingBadgeId || !selectedUserIdToAward) return;
    try {
      const res = await fetchWithAuth('/api/badges/award', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({
          user_id: selectedUserIdToAward,
          badge_id: awardingBadgeId,
          awarded_by: currentUser.id
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAwardMessage({ type: 'success', text: t('admin.notification.badgeAwarded') });
        setTimeout(() => {
          setAwardingBadgeId(null);
          setSelectedUserIdToAward(null);
          setAwardSearchTerm('');
          setAwardMessage(null);
        }, 2000);
      } else {
        setAwardMessage({ type: 'error', text: data.error || t('admin.notification.badgeFailed') });
      }
    } catch (err) {
      console.error(err);
      setAwardMessage({ type: 'error', text: t('admin.notification.error') });
    }
  };

  const handleBadgeIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploadingBadgeIcon(true);
    try {
      const res = await fetchWithAuth('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setNewBadge({ ...newBadge, icon: data.url });
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploadingBadgeIcon(false);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['users', 'events', 'submissions', 'event_photos', 'settings', 'badges', 'contests', 'ambassadors'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as any);
    setSearchParams({ tab });
  };

  const fetchSettings = async () => {
    try {
      const res = await fetchWithAuth('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchContestPromotionSettings = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/photo-contest-settings');
      if (res.ok) {
        const data = await res.json();
        setContestSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch contest promotion settings', err);
    }
  };

  const updateContestPromotionSettings = async (enabled: boolean, allowedTypes: string[]) => {
    try {
      const res = await fetchWithAuth('/api/admin/photo-contest-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, allowedTypes }),
      });
      if (res.ok) {
        showNotification('success', t('admin.notification.settingsUpdated'));
        fetchContestPromotionSettings();
      } else {
        showNotification('error', t('admin.notification.error'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('admin.notification.error'));
    }
  };

  const fetchStamps = async () => {
    try {
      const res = await fetchWithAuth('/api/stamps');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setStamps(data);
        } else {
          console.error('Stamps data is not an array:', data);
          setStamps([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBadges = async () => {
    try {
      const res = await fetchWithAuth('/api/badges');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setBadges(data);
        } else {
          console.error('Badges data is not an array:', data);
          setBadges([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFeatureAccess = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/feature-access', {
        headers: { 'x-admin-role': currentUser.role }
      });
      if (res.ok) {
        const data = await res.json();
        setFeatureAccess(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePlanChange = async (id: number, newPlan: string) => {
    try {
      const res = await fetchWithAuth(`/api/admin/users/${id}/plan`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ plan: newPlan }),
      });
      if (res.ok) {
        setUsers(users.map((u) => (u.id === id ? { ...u, plan: newPlan } : u)));
        showNotification('success', t('admin.notification.planUpdated'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('admin.notification.error'));
    }
  };

  const handleFeatureAccessChange = async (featureKey: string, allowedPlan: string) => {
    try {
      const res = await fetchWithAuth('/api/admin/feature-access', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ featureKey, allowedPlan }),
      });
      if (res.ok) {
        setFeatureAccess(featureAccess.map(f => f.key === featureKey ? { ...f, value: allowedPlan } : f));
        showNotification('success', t('admin.notification.settingsUpdated'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('admin.notification.error'));
    }
  };

  const fetchUsers = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/admin/users', {
        headers: { 'x-admin-role': currentUser.role }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsers(data);
        } else {
          console.error('Users data is not an array:', data);
          setUsers([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEvents = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/admin/events', {
        headers: { 'x-admin-role': currentUser.role }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setEvents(data);
        } else {
          console.error('Events data is not an array:', data);
          setEvents([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchContests = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/admin/contests', {
        headers: { 'x-admin-role': currentUser.role }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setContests(data);
        } else {
          console.error('Contests data is not an array:', data);
          setContests([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAmbassadorApps = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/ambassadors/applications');
      if (res.ok) {
        const data = await res.json();
        setAmbassadorApps(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (currentUser) {
        setLoading(true);
        await Promise.all([
          fetchUsers(), 
          fetchEvents(), 
          fetchSubmissions(), 
          fetchEventPhotos(),
          fetchSettings(), 
          fetchBadges(), 
          fetchStamps(),
          fetchContests(), 
          fetchContestPromotionSettings(),
          fetchFeatureAccess(),
          fetchAmbassadorApps()
        ]);
        setLoading(false);
      }
    };
    loadData();
  }, [currentUser]);

  const handleCreateContest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth('/api/admin/contests', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify(newContest),
      });
      if (res.ok) {
        setNewContest({ title: '', description: '', start_date: '', voting_start_date: '', end_date: '', prize_description: '', prize_badge_id: null, status: 'draft' });
        setIsCreatingContest(false);
        fetchContests();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateContest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContest) return;
    try {
      const res = await fetchWithAuth(`/api/admin/contests/${editingContest.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify(editingContest),
      });
      if (res.ok) {
        setEditingContest(null);
        fetchContests();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteContest = async (id: number) => {
    if (!window.confirm(t('admin.confirm.deleteContest'))) return;
    try {
      const res = await fetchWithAuth(`/api/admin/contests/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-role': currentUser.role }
      });
      if (res.ok) {
        fetchContests();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePickWinner = async (contestId: number) => {
    if (!window.confirm(t('admin.confirm.pickWinner'))) return;
    try {
      const res = await fetchWithAuth(`/api/admin/contests/${contestId}/pick-winner`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        }
      });
      if (res.ok) {
        fetchContests();
        showNotification('success', t('admin.notification.winnerPicked'));
      } else {
        const data = await res.json();
        showNotification('error', data.error || t('admin.notification.error'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newBadge,
        creator_id: newBadge.creator_type === 'business' ? parseInt(newBadge.creator_id) || null : null
      };
      
      const isStamp = newBadge.item_type === 'stamp';
      const url = editingBadge ? (isStamp ? `/api/stamps/${editingBadge.id}` : `/api/badges/${editingBadge.badge_id}`) : (isStamp ? '/api/stamps' : '/api/badges');
      const method = editingBadge ? 'PUT' : 'POST';

      const res = await fetchWithAuth(url, {
        method: method,
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setNewBadge({ item_type: 'badge', name: '', description: '', icon: 'ShieldCheck', category: 'General', creator_type: 'platform', creator_id: '' });
        setIsCreatingBadge(false);
        setEditingBadge(null);
        fetchBadges();
        fetchStamps();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSettingChange = async (key: string, value: any) => {
    try {
      const res = await fetchWithAuth('/api/admin/settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        setSettings({ ...settings, [key]: value });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (id: number, currentStatus: string, targetStatus?: string) => {
    const newStatus = targetStatus || (currentStatus === 'active' ? 'banned' : 'active');
    try {
      const res = await fetchWithAuth(`/api/admin/users/${id}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setUsers(users.map((u) => (u.id === id ? { ...u, status: newStatus } : u)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRoleChange = async (id: number, newRole: string) => {
    try {
      const res = await fetchWithAuth(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers(users.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveEvent = async (id: number, currentStatus: number) => {
    try {
      const res = await fetchWithAuth(`/api/admin/events/${id}/approve`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ is_approved: !currentStatus }),
      });
      if (res.ok) {
        setEvents(events.map((e) => (e.id === id ? { ...e, is_approved: !currentStatus ? 1 : 0 } : e)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSubmissions = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/admin/submissions', {
        headers: { 'x-admin-role': currentUser.role }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSubmissions(data);
        } else {
          console.error('Submissions data is not an array:', data);
          setSubmissions([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEventPhotos = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/admin/pending-event-photos', {
        headers: { 'x-admin-role': currentUser.role }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setEventPhotos(data);
        } else {
          console.error('Event photos data is not an array:', data);
          setEventPhotos([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveSubmission = async (id: number, currentStatus: number) => {
    try {
      const res = await fetchWithAuth(`/api/admin/submissions/${id}/approve`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ approved: !currentStatus }),
      });
      if (res.ok) {
        setSubmissions(submissions.map((s) => (s.id === id ? { ...s, approved: !currentStatus ? 1 : 0 } : s)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveEventPhoto = async (photoId: number, status: 'approved' | 'rejected') => {
    try {
      const res = await fetchWithAuth(`/api/events/photos/${photoId}/status`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchEventPhotos();
        showNotification('success', status === 'approved' ? t('event.details.photosApproved') : t('event.details.photosRejected'));
      }
    } catch (err) {
      console.error(err);
      showNotification('error', t('common.error'));
    }
  };

  const handlePromoteEvent = async (id: number, currentStatus: number) => {
    try {
      const res = await fetchWithAuth(`/api/admin/events/${id}/promote`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ is_promoted: !currentStatus }),
      });
      if (res.ok) {
        setEvents(events.map((e) => (e.id === id ? { ...e, is_promoted: !currentStatus ? 1 : 0 } : e)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('admin.confirm.deleteUser'))) {
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-role': currentUser.role }
      });
      if (res.ok) {
        setUsers(users.filter((u) => u.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] flex flex-col items-center justify-center text-center px-4">
        <ShieldAlert className="w-20 h-20 text-engine mb-8" />
        <h2 className="text-4xl font-display font-black uppercase italic tracking-tighter mb-4">{t('admin.accessDenied')}</h2>
        <p className="text-steel mb-10 font-light">{t('admin.noPermission')}</p>
        <Link to="/admin/login" className="btn-primary">
          {t('admin.goToLogin')}
        </Link>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.rider_name && u.rider_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.company_name && u.company_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredEvents = events.filter((e) => 
    e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleApproveAmbassador = async (id: number) => {
    try {
      const res = await fetchWithAuth(`/api/ambassadors/applications/${id}/approve`, {
        method: 'POST'
      });
      if (res.ok) {
        showNotification('success', 'Ambassador application approved');
        setAmbassadorApps(apps => apps.map(app => app.id === id ? { ...app, status: 'approved' } : app));
      }
    } catch (err) {
      console.error('Failed to approve application', err);
    }
  };

  const handleRejectAmbassador = async (id: number) => {
    try {
      const res = await fetchWithAuth(`/api/ambassadors/applications/${id}/reject`, {
        method: 'POST'
      });
      if (res.ok) {
        showNotification('success', 'Ambassador application rejected');
        setAmbassadorApps(apps => apps.map(app => app.id === id ? { ...app, status: 'rejected' } : app));
      }
    } catch (err) {
      console.error('Failed to reject application', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-5rem)] py-12 pb-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl sm:text-5xl font-display font-black uppercase italic tracking-tighter mb-2 flex items-center gap-4 text-primary">
          <ShieldAlert className="w-10 h-10" />
          {t('admin.title')}
        </h1>
        <p className="text-steel font-light">{t('admin.subtitle')}</p>
      </div>
      
      <div className="flex items-center gap-2 bg-asphalt p-1.5 rounded-2xl border border-white/5 shadow-2xl overflow-x-auto no-scrollbar mb-12">
          <button
            onClick={() => handleTabChange('users')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'users' ? 'bg-primary text-asphalt shadow-xl shadow-primary/20' : 'text-steel hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            {t('admin.tab.users')}
          </button>
          <button
            onClick={() => handleTabChange('events')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'events' ? 'bg-primary text-asphalt shadow-xl shadow-primary/20' : 'text-steel hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            {t('admin.tab.events')}
          </button>
          <button
            onClick={() => handleTabChange('submissions')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'submissions' ? 'bg-primary text-asphalt shadow-xl shadow-primary/20' : 'text-steel hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            {t('admin.tab.submissions')}
          </button>
          <button
            onClick={() => handleTabChange('event_photos')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'event_photos' ? 'bg-primary text-asphalt shadow-xl shadow-primary/20' : 'text-steel hover:text-white'
            }`}
          >
            <Image className="w-4 h-4" />
            {t('admin.eventPhotos.title')}
          </button>
          <button
            onClick={() => handleTabChange('settings')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'settings' ? 'bg-primary text-asphalt shadow-xl shadow-primary/20' : 'text-steel hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            {t('admin.tab.settings')}
          </button>
          <button
            onClick={() => handleTabChange('badges')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'badges' ? 'bg-primary text-asphalt shadow-xl shadow-primary/20' : 'text-steel hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Badges & Stamps
          </button>
          <button
            onClick={() => handleTabChange('contests')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'contests' ? 'bg-primary text-asphalt shadow-xl shadow-primary/20' : 'text-steel hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            {t('admin.tab.contests')}
          </button>
          <button
            onClick={() => handleTabChange('ambassadors')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'ambassadors' ? 'bg-primary text-asphalt shadow-xl shadow-primary/20' : 'text-steel hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            Ambassadors
          </button>
        </div>

      {activeTab === 'users' ? (
        <>
          <div className="mb-8 relative group">
            <Search className="w-5 h-5 text-steel absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder={t('admin.search.users')}
              value={searchTerm || ''}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-12"
            />
          </div>

          <div className="glass-card overflow-hidden border-white/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-asphalt">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.user')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.type')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.plan')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.role')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.joined')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.status')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-16 text-center">
                        <UserX className="w-12 h-12 mx-auto mb-4 text-engine" />
                        <div className="text-xl font-display font-black uppercase italic text-steel">{t('admin.noUsers')}</div>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="p-6">
                          <div className="flex items-center gap-4">
                            <img 
                              src={user.profile_picture_url} 
                              alt="" 
                              className="w-12 h-12 rounded-2xl object-cover bg-carbon border border-white/5 grayscale group-hover:grayscale-0 transition-all"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <div className="font-display font-black uppercase italic text-lg tracking-tight text-white group-hover:text-primary transition-colors">
                                {user.type === 'rider' ? user.rider_name : user.company_name}
                              </div>
                              <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest flex items-center gap-2">
                                @{user.username}
                                {user.is_mock === 1 && (
                                  <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">DEMO</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-6">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-widest bg-asphalt text-steel border border-white/5">
                            {user.type === 'rider' ? t('register.type.rider') : t('register.type.ecosystem')}
                          </span>
                        </td>
                        <td className="p-6">
                          <div className="flex bg-carbon rounded-xl p-1 border border-white/5 w-fit">
                            <button
                              onClick={() => handlePlanChange(user.id, 'freemium')}
                              className={`text-[9px] font-mono font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                                user.plan === 'freemium' || !user.plan
                                  ? 'bg-asphalt text-white shadow-lg'
                                  : 'text-steel hover:text-chrome'
                              }`}
                            >
                              {t('admin.plan.freemium')}
                            </button>
                            <button
                              onClick={() => handlePlanChange(user.id, 'premium')}
                              className={`text-[9px] font-mono font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                                user.plan === 'premium'
                                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                  : 'text-steel hover:text-chrome'
                              }`}
                            >
                              {t('admin.plan.premium')}
                            </button>
                          </div>
                        </td>
                        <td className="p-6">
                          <select
                            value={user.role || ''}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            className="bg-asphalt text-steel text-[10px] font-mono font-black uppercase tracking-widest rounded-xl border border-white/5 px-4 py-2 focus:outline-none focus:border-primary focus:text-primary transition-all cursor-pointer"
                          >
                            <option value="user">{t('admin.role.user')}</option>
                            <option value="moderator">{t('admin.role.moderator')}</option>
                            <option value="admin">{t('admin.role.admin')}</option>
                          </select>
                        </td>
                        <td className="p-6 text-[10px] font-mono font-black text-steel uppercase tracking-widest">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-6">
                          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono font-black uppercase tracking-widest border ${
                            user.status === 'active' 
                              ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' 
                              : user.status === 'pending'
                              ? 'bg-accent/5 text-accent border-accent/20'
                              : 'bg-red-500/5 text-red-400 border-red-500/20'
                          }`}>
                            {user.status === 'active' ? (
                              <CheckCircle className="w-3.5 h-3.5" />
                            ) : user.status === 'pending' ? (
                              <ShieldAlert className="w-3.5 h-3.5" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )}
                            {user.status === 'active' ? t('admin.status.active') : user.status === 'pending' ? t('admin.status.pending') : t('admin.status.banned')}
                          </span>
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {user.status === 'pending' && (
                              <button
                                onClick={() => handleStatusChange(user.id, user.status, 'active')}
                                className="p-3 text-emerald-400 hover:bg-emerald-500/10 rounded-xl border border-transparent hover:border-emerald-500/20 transition-all"
                                title={t('admin.action.approve')}
                              >
                                <CheckCircle className="w-5 h-5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleStatusChange(user.id, user.status)}
                              className={`p-3 rounded-xl border border-transparent transition-all ${
                                user.status === 'active' 
                                  ? 'text-steel hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20' 
                                  : 'text-steel hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20'
                              }`}
                              title={user.status === 'active' ? t('admin.action.ban') : t('admin.action.approve')}
                            >
                              {user.status === 'active' ? <Ban className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                            </button>
                            <Link
                              to={`/edit-profile/${user.username}`}
                              className="p-3 text-steel hover:text-primary hover:bg-primary/10 rounded-xl border border-transparent hover:border-primary/20 transition-all"
                              title={t('admin.action.edit')}
                            >
                              <Edit2 className="w-5 h-5" />
                            </Link>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-3 text-steel hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-transparent hover:border-red-500/20 transition-all"
                              title={t('admin.action.delete')}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'events' ? (
        <>
          <div className="mb-8 relative group">
            <Search className="w-5 h-5 text-steel absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder={t('admin.search.events')}
              value={searchTerm || ''}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-12"
            />
          </div>

          <div className="glass-card overflow-hidden border-white/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-asphalt">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.event')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.host')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.date')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.status')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.promoted')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-16 text-center">
                        <Calendar className="w-12 h-12 mx-auto mb-4 text-engine" />
                        <div className="text-xl font-display font-black uppercase italic text-steel">{t('admin.noEvents')}</div>
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="p-6">
                          <div>
                            <div className="font-display font-black uppercase italic text-lg tracking-tight text-white group-hover:text-primary transition-colors leading-none mb-1">{event.title}</div>
                            <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{event.location}</div>
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="flex items-center gap-3">
                            <img 
                              src={event.profile_picture_url} 
                              alt="" 
                              className="w-8 h-8 rounded-xl object-cover border border-white/5 grayscale group-hover:grayscale-0 transition-all"
                              referrerPolicy="no-referrer"
                            />
                            <span className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">@{event.username}</span>
                          </div>
                        </td>
                        <td className="p-6 text-[10px] font-mono font-black text-steel uppercase tracking-widest">
                          {new Date(event.date).toLocaleDateString()}
                        </td>
                        <td className="p-6">
                          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono font-black uppercase tracking-widest border ${
                            event.is_approved 
                              ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' 
                              : 'bg-accent/5 text-accent border-accent/20'
                          }`}>
                            {event.is_approved ? <CheckCircle className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                            {event.is_approved ? t('admin.status.approved') : t('admin.status.pending')}
                          </span>
                        </td>
                        <td className="p-6">
                          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono font-black uppercase tracking-widest border ${
                            event.is_promoted 
                              ? 'bg-primary/5 text-primary border-primary/20' 
                              : 'bg-asphalt text-steel border-white/5'
                          }`}>
                            <Star className={`w-3.5 h-3.5 ${event.is_promoted ? 'fill-current' : ''}`} />
                            {event.is_promoted ? t('admin.status.promoted') : t('admin.status.standard')}
                          </span>
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => handleApproveEvent(event.id, event.is_approved)}
                              className={`p-3 rounded-xl border border-transparent transition-all ${
                                event.is_approved 
                                  ? 'text-steel hover:text-accent hover:bg-accent/10 hover:border-accent/20' 
                                  : 'text-steel hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20'
                              }`}
                              title={event.is_approved ? t('admin.action.unapprove') : t('admin.action.approve')}
                            >
                              {event.is_approved ? <XCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                            </button>
                            <button
                              onClick={() => handlePromoteEvent(event.id, event.is_promoted)}
                              className={`p-3 rounded-xl border border-transparent transition-all ${
                                event.is_promoted 
                                  ? 'text-primary bg-primary/5 border-primary/20' 
                                  : 'text-steel hover:text-primary hover:bg-primary/5 hover:border-primary/20'
                              }`}
                              title={event.is_promoted ? t('admin.action.unpromote') : t('admin.action.promote')}
                            >
                              <Star className={`w-5 h-5 ${event.is_promoted ? 'fill-current' : ''}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'submissions' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter flex items-center gap-4 text-primary">
              <Camera className="w-8 h-8" />
              {t('admin.submissions.title')}
            </h2>
            <div className="flex items-center gap-4">
              <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('admin.submissions.filterContest')}</label>
              <select 
                value={selectedContestFilter || ''}
                onChange={(e) => setSelectedContestFilter(e.target.value)}
                className="bg-asphalt text-steel text-[10px] font-mono font-black uppercase tracking-widest rounded-xl border border-white/5 px-4 py-2 focus:outline-none focus:border-primary transition-all"
              >
                <option value="all">{t('admin.submissions.allContests')}</option>
                {contests.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="glass-card overflow-hidden border-white/5 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-asphalt">
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.photo')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.user')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.contest')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.submissions.votes')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.status')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-white/5">
    {submissions
      .filter(sub => selectedContestFilter === 'all' || sub.contest_id?.toString() === selectedContestFilter)
      .map((sub) => (
      <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors">
        <td className="p-6">
          <img src={sub.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
        </td>
        <td className="p-6 text-steel font-mono text-sm">@{sub.username}</td>
        <td className="p-6 text-steel font-mono text-sm uppercase">{sub.contest_title || sub.contest_type}</td>
        <td className="p-6 text-primary font-mono font-bold">{sub.vote_count || 0}</td>
        <td className="p-6">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${sub.approved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-accent/20 text-accent'}`}>
                        {sub.approved ? t('admin.status.approved') : t('admin.status.pending')}
                      </span>
                    </td>
                    <td className="p-6 text-right">
                      <button
                        onClick={() => handleApproveSubmission(sub.id, sub.approved)}
                        className={`p-2 rounded-xl ${sub.approved ? 'text-red-400' : 'text-emerald-400'}`}
                      >
                        {sub.approved ? <XCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ) : activeTab === 'event_photos' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter flex items-center gap-4 text-primary">
              <Image className="w-8 h-8" />
              {t('admin.eventPhotos.title')}
            </h2>
            {eventPhotos.length > 0 && (
              <div className="flex items-center gap-3">
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetchWithAuth('/api/events/photos/bulk-status', {
                        method: 'POST',
                        headers: { 
                          'Content-Type': 'application/json',
                          'x-admin-role': currentUser.role
                        },
                        body: JSON.stringify({ 
                          photoIds: eventPhotos.map(p => p.id),
                          status: 'approved' 
                        }),
                      });
                      if (res.ok) {
                        fetchEventPhotos();
                        showNotification('success', t('event.details.photosApproved'));
                      }
                    } catch (err) {
                      console.error(err);
                      showNotification('error', t('common.error'));
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl font-mono text-[10px] font-black uppercase tracking-widest border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all"
                >
                  <CheckCircle className="w-4 h-4" />
                  {t('event.details.approveAll')}
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetchWithAuth('/api/events/photos/bulk-status', {
                        method: 'POST',
                        headers: { 
                          'Content-Type': 'application/json',
                          'x-admin-role': currentUser.role
                        },
                        body: JSON.stringify({ 
                          photoIds: eventPhotos.map(p => p.id),
                          status: 'rejected' 
                        }),
                      });
                      if (res.ok) {
                        fetchEventPhotos();
                        showNotification('success', t('event.details.photosRejected'));
                      }
                    } catch (err) {
                      console.error(err);
                      showNotification('error', t('common.error'));
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-xl font-mono text-[10px] font-black uppercase tracking-widest border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                >
                  <XCircle className="w-4 h-4" />
                  {t('event.details.rejectAll')}
                </button>
              </div>
            )}
          </div>
          <div className="glass-card overflow-hidden border-white/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-asphalt">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.photo')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.user')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.event')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {eventPhotos.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-steel font-mono text-sm uppercase tracking-widest">
                        {t('event.details.noPendingPhotos')}
                      </td>
                    </tr>
                  ) : (
                    eventPhotos.map((photo) => (
                      <tr key={photo.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-6">
                          <img src={photo.image_url} alt="" className="w-24 h-24 rounded-xl object-cover" referrerPolicy="no-referrer" />
                        </td>
                        <td className="p-6 text-steel font-mono text-sm">@{photo.username}</td>
                        <td className="p-6 text-steel font-mono text-sm uppercase">{photo.event_title}</td>
                        <td className="p-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleApproveEventPhoto(photo.id, 'approved')}
                              className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500 hover:text-white transition-all"
                              title={t('common.approve')}
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleApproveEventPhoto(photo.id, 'rejected')}
                              className="p-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                              title={t('common.reject')}
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'contests' ? (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter flex items-center gap-4 text-primary">
              <Trophy className="w-8 h-8" />
              {t('admin.contests.pageTitle')}
            </h2>
            <button 
              onClick={() => {
                setIsCreatingContest(!isCreatingContest);
                setEditingContest(null);
              }}
              className="btn-primary"
            >
              {isCreatingContest ? t('common.cancel') : t('admin.contests.create')}
            </button>
          </div>

          {(isCreatingContest || editingContest) && (
            <div className="glass-card p-8 border-primary/20 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-[120px]" />
              <h3 className="text-xl font-display font-black uppercase italic tracking-tight mb-6 relative z-10">
                {editingContest ? t('admin.contests.edit') : t('admin.contests.create')}
              </h3>
              
              <form onSubmit={editingContest ? handleUpdateContest : handleCreateContest} className="space-y-6 relative z-10">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.contests.title')}</label>
                    <input 
                      type="text" 
                      value={editingContest ? editingContest.title : newContest.title}
                      onChange={(e) => editingContest ? setEditingContest({...editingContest, title: e.target.value}) : setNewContest({...newContest, title: e.target.value})}
                      className="input-field" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.table.status')}</label>
                    <select 
                      value={(editingContest ? editingContest.status : newContest.status) || 'draft'}
                      onChange={(e) => editingContest ? setEditingContest({...editingContest, status: e.target.value}) : setNewContest({...newContest, status: e.target.value})}
                      className="input-field"
                    >
                      <option value="draft">{t('admin.contests.status.draft')}</option>
                      <option value="active">{t('admin.contests.status.active')}</option>
                      <option value="completed">{t('admin.contests.status.completed')}</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.contests.description')}</label>
                  <textarea 
                    value={(editingContest ? editingContest.description : newContest.description) || ''}
                    onChange={(e) => editingContest ? setEditingContest({...editingContest, description: e.target.value}) : setNewContest({...newContest, description: e.target.value})}
                    className="input-field min-h-[100px] resize-y" 
                    required
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.contests.startDate')}</label>
                    <input 
                      type="datetime-local" 
                      value={(editingContest ? (editingContest.start_date?.split('.')[0] || '') : newContest.start_date) || ''}
                      onChange={(e) => editingContest ? setEditingContest({...editingContest, start_date: e.target.value}) : setNewContest({...newContest, start_date: e.target.value})}
                      className="input-field" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.contests.votingStartDate')}</label>
                    <input 
                      type="datetime-local" 
                      value={(editingContest ? (editingContest.voting_start_date?.split('.')[0] || '') : newContest.voting_start_date) || ''}
                      onChange={(e) => editingContest ? setEditingContest({...editingContest, voting_start_date: e.target.value}) : setNewContest({...newContest, voting_start_date: e.target.value})}
                      className="input-field" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.contests.endDate')}</label>
                    <input 
                      type="datetime-local" 
                      value={(editingContest ? (editingContest.end_date?.split('.')[0] || '') : newContest.end_date) || ''}
                      onChange={(e) => editingContest ? setEditingContest({...editingContest, end_date: e.target.value}) : setNewContest({...newContest, end_date: e.target.value})}
                      className="input-field" 
                      required 
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.contests.prize')}</label>
                    <input 
                      type="text" 
                      value={(editingContest ? editingContest.prize_description : newContest.prize_description) || ''}
                      onChange={(e) => editingContest ? setEditingContest({...editingContest, prize_description: e.target.value}) : setNewContest({...newContest, prize_description: e.target.value})}
                      className="input-field" 
                      placeholder={t('admin.contests.prizePlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.contests.prizeBadge')}</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsBadgeSelectorOpen(!isBadgeSelectorOpen)}
                        className="input-field flex items-center justify-between text-left"
                      >
                        <span className="truncate">
                          {editingContest?.prize_badge_id || newContest.prize_badge_id 
                            ? badges.find(b => b.badge_id === (editingContest?.prize_badge_id || newContest.prize_badge_id))?.name || t('admin.contests.selectBadge')
                            : t('admin.contests.selectBadge')}
                        </span>
                        <Search className="w-4 h-4 text-steel" />
                      </button>

                      {isBadgeSelectorOpen && (
                        <div className="absolute z-50 mt-2 w-full glass-card p-4 border-primary/20 shadow-2xl max-h-64 overflow-y-auto">
                          <input
                            type="text"
                            placeholder={t('admin.contests.searchBadges')}
                            value={badgeSearchTerm}
                            onChange={(e) => setBadgeSearchTerm(e.target.value)}
                            className="input-field mb-4 text-sm"
                            autoFocus
                          />
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (editingContest) setEditingContest({...editingContest, prize_badge_id: null});
                                else setNewContest({...newContest, prize_badge_id: null});
                                setIsBadgeSelectorOpen(false);
                              }}
                              className="w-full text-left p-2 rounded hover:bg-white/5 text-xs text-steel font-mono uppercase"
                            >
                              {t('admin.contests.none')}
                            </button>
                            {badges
                              .filter(b => b.name.toLowerCase().includes(badgeSearchTerm.toLowerCase()))
                              .map(badge => (
                                <button
                                  key={badge.badge_id}
                                  type="button"
                                  onClick={() => {
                                    if (editingContest) setEditingContest({...editingContest, prize_badge_id: badge.badge_id});
                                    else setNewContest({...newContest, prize_badge_id: badge.badge_id});
                                    setIsBadgeSelectorOpen(false);
                                  }}
                                  className="w-full text-left p-2 rounded hover:bg-white/5 flex items-center gap-3"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <Star className="w-4 h-4 text-primary" />
                                  </div>
                                  <div>
                                    <div className="text-sm font-bold text-white">{badge.name}</div>
                                    <div className="text-[10px] text-steel uppercase font-mono">{badge.category}</div>
                                  </div>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button type="submit" className="btn-primary flex-1">
                    {editingContest ? t('admin.contests.update') : t('admin.contests.submit')}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      setIsCreatingContest(false);
                      setEditingContest(null);
                    }}
                    className="btn-secondary flex-1"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="glass-card overflow-hidden border-white/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-asphalt">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.contest')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.contests.dates')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.status')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.contests.leaderWinner')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {contests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-16 text-center">
                        <Trophy className="w-12 h-12 mx-auto mb-4 text-engine" />
                        <div className="text-xl font-display font-black uppercase italic text-steel">{t('admin.contests.noContests')}</div>
                      </td>
                    </tr>
                  ) : (
                    contests.map((contest) => (
                      <tr key={contest.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="p-6">
                          <div className="flex items-start gap-4">
                            {contest.prize_badge_icon && (
                              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                                <Star className="w-5 h-5 text-primary" />
                              </div>
                            )}
                            <div>
                              <div className="font-display font-black uppercase italic text-lg tracking-tight text-white group-hover:text-primary transition-colors leading-none mb-1">{contest.title}</div>
                              <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest line-clamp-1 max-w-xs">{contest.description}</div>
                              {contest.prize_badge_name && (
                                <div className="mt-2 flex items-center gap-1.5">
                                  <span className="text-[9px] font-mono font-black text-primary uppercase tracking-widest bg-primary/10 px-1.5 py-0.5 rounded">
                                    {t('admin.contests.prizeLabel')} {contest.prize_badge_name}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">
                            {new Date(contest.start_date).toLocaleDateString()} - {new Date(contest.end_date).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="p-6">
                          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono font-black uppercase tracking-widest border ${
                            contest.status === 'active' 
                              ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' 
                              : contest.status === 'completed'
                              ? 'bg-primary/5 text-primary border-primary/20'
                              : 'bg-asphalt text-steel border-white/5'
                          }`}>
                            {contest.status === 'active' ? <Activity className="w-3.5 h-3.5" /> : contest.status === 'completed' ? <CheckCircle className="w-3.5 h-3.5" /> : <Wrench className="w-3.5 h-3.5" />}
                            {contest.status === 'active' ? t('admin.contests.status.active') : contest.status === 'completed' ? t('admin.contests.status.completed') : t('admin.contests.status.draft')}
                          </span>
                        </td>
                        <td className="p-6">
                          {contest.winner_username ? (
                            <div className="flex items-center gap-2">
                              <Star className="w-3.5 h-3.5 text-primary fill-current" />
                              <span className="text-[10px] font-mono font-black text-primary uppercase tracking-widest">{t('admin.contests.winner', { username: contest.winner_username })}</span>
                            </div>
                          ) : contest.leader_username ? (
                            <div className="flex items-center gap-2">
                              <Trophy className="w-3.5 h-3.5 text-steel" />
                              <span className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{t('admin.contests.leader', { username: contest.leader_username, votes: contest.leader_votes })}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-mono font-black text-steel/30 uppercase tracking-widest">{t('admin.contests.noEntries')}</span>
                          )}
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {contest.status === 'active' && new Date(contest.end_date) < new Date() && (
                              <button
                                onClick={() => handlePickWinner(contest.id)}
                                className="p-3 text-primary hover:bg-primary/10 rounded-xl border border-primary/20 transition-all"
                                title={t('admin.contests.pickWinner')}
                              >
                                <Trophy className="w-5 h-5" />
                              </button>
                            )}
                            <button
                              onClick={() => setEditingContest(contest)}
                              className="p-3 text-steel hover:text-primary hover:bg-primary/5 rounded-xl border border-transparent hover:border-primary/20 transition-all"
                              title={t('admin.contests.edit')}
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteContest(contest.id)}
                              className="p-3 text-steel hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-transparent hover:border-red-500/20 transition-all"
                              title={t('admin.action.delete')}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
    ) : activeTab === 'ambassadors' ? (
        <div className="space-y-6">
          <h2 className="text-2xl font-display font-black uppercase italic text-white mb-6">Ambassador Applications</h2>
          {ambassadorApps.length === 0 ? (
            <p className="text-steel">No ambassador applications found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {ambassadorApps.map(app => (
                <div key={app.id} className="bg-carbon border border-white/10 rounded-2xl p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white">{app.name}</h3>
                      <p className="text-steel">@{app.username} • {app.email}</p>
                      <p className="text-primary font-bold capitalize mt-1">{app.category} Ambassador</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      app.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                      app.status === 'approved' ? 'bg-green-500/20 text-green-500' :
                      'bg-red-500/20 text-red-500'
                    }`}>
                      {app.status}
                    </span>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">Location</p>
                      <p className="text-white">{app.location}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">Description</p>
                      <p className="text-white text-sm">{app.description}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">Proof of Legitimacy</p>
                      <a href={app.proof_of_legitimacy} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm break-all">
                        {app.proof_of_legitimacy}
                      </a>
                    </div>
                  </div>

                  {app.status === 'pending' && (
                    <div className="flex gap-4">
                      <button
                        onClick={() => handleApproveAmbassador(app.id)}
                        className="flex-1 bg-green-500/20 text-green-500 hover:bg-green-500/30 py-2 rounded-xl font-bold transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectAmbassador(app.id)}
                        className="flex-1 bg-red-500/20 text-red-500 hover:bg-red-500/30 py-2 rounded-xl font-bold transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    ) : activeTab === 'badges' ? (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter flex items-center gap-4 text-primary">
              <ShieldCheck className="w-8 h-8" />
              {t('admin.badges.pageTitle')}
            </h2>
            <button 
              onClick={() => setIsCreatingBadge(!isCreatingBadge)}
              className="btn-primary"
            >
              {isCreatingBadge ? t('common.cancel') : t('admin.badges.create')}
            </button>
          </div>

          {isCreatingBadge && (
            <div className="glass-card p-8 border-primary/20 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-[120px]" />
              <h3 className="text-xl font-display font-black uppercase italic tracking-tight mb-6 relative z-10">
                {editingBadge ? t('common.edit') : t('admin.badges.create')}
              </h3>
              
              <form onSubmit={handleSaveBadge} className="space-y-6 relative z-10">
                {!editingBadge && (
                  <div className="flex gap-4 mb-6">
                    <button
                      type="button"
                      onClick={() => setNewBadge({ ...newBadge, item_type: 'badge' })}
                      className={`flex-1 py-3 rounded-xl font-mono text-xs font-bold uppercase tracking-widest transition-all ${newBadge.item_type === 'badge' ? 'bg-primary text-asphalt shadow-lg shadow-primary/20' : 'bg-carbon text-steel hover:bg-white/5 border border-white/10'}`}
                    >
                      Badge
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewBadge({ ...newBadge, item_type: 'stamp' })}
                      className={`flex-1 py-3 rounded-xl font-mono text-xs font-bold uppercase tracking-widest transition-all ${newBadge.item_type === 'stamp' ? 'bg-primary text-asphalt shadow-lg shadow-primary/20' : 'bg-carbon text-steel hover:bg-white/5 border border-white/10'}`}
                    >
                      Stamp
                    </button>
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.badges.name')}</label>
                    <input 
                      type="text" 
                      value={newBadge.name || ''}
                      onChange={(e) => setNewBadge({...newBadge, name: e.target.value})}
                      className="input-field" 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.badges.category')}</label>
                    <input 
                      type="text" 
                      value={newBadge.category || ''}
                      onChange={(e) => setNewBadge({...newBadge, category: e.target.value})}
                      className="input-field" 
                      required 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.badges.descriptionOptional')}</label>
                  <textarea 
                    value={newBadge.description || ''}
                    onChange={(e) => setNewBadge({...newBadge, description: e.target.value})}
                    className="input-field min-h-[100px] resize-y" 
                  />
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.badges.image')}</label>
                    <div className="flex items-center gap-4">
                      {newBadge.icon && newBadge.icon.startsWith('/') ? (
                        <img src={newBadge.icon} alt="Badge Preview" className="w-12 h-12 rounded-full object-cover border border-white/10" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-carbon border border-white/10 flex items-center justify-center">
                          <ShieldCheck className="w-6 h-6 text-steel" />
                        </div>
                      )}
                      <label className="btn-secondary px-4 py-2 cursor-pointer flex-1 text-center">
                        {isUploadingBadgeIcon ? t('admin.badges.uploading') : t('admin.badges.upload')}
                        <input type="file" className="hidden" accept="image/*" onChange={handleBadgeIconUpload} disabled={isUploadingBadgeIcon} />
                      </label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.badges.creatorType')}</label>
                    <select 
                      value={newBadge.creator_type || ''}
                      onChange={(e) => {
                        setNewBadge({...newBadge, creator_type: e.target.value, creator_id: ''});
                        setShopSearchTerm('');
                      }}
                      className="input-field"
                    >
                      <option value="platform">{t('admin.badges.creator.platform')}</option>
                      <option value="business">{t('admin.badges.creator.business')}</option>
                      <option value="event">{t('admin.badges.creator.event')}</option>
                      <option value="club">{t('admin.badges.creator.club')}</option>
                    </select>
                  </div>
                  {newBadge.creator_type === 'business' && (
                    <div className="space-y-2 relative">
                      <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.badges.assignShop')}</label>
                      <input 
                        type="text" 
                        value={shopSearchTerm || ''}
                        onChange={(e) => {
                          setShopSearchTerm(e.target.value);
                          setNewBadge({...newBadge, creator_id: ''});
                        }}
                        className="input-field" 
                        placeholder={t('admin.badges.searchShop')}
                        required 
                      />
                      {shopSearchTerm && !newBadge.creator_id && (
                        <div className="absolute top-full left-0 w-full mt-1 bg-carbon border border-white/10 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                          {users
                            .filter(u => u.type === 'ecosystem' && (u.company_name?.toLowerCase().includes(shopSearchTerm.toLowerCase()) || u.username.toLowerCase().includes(shopSearchTerm.toLowerCase())))
                            .map(shop => (
                              <div 
                                key={shop.id}
                                className="p-3 hover:bg-white/5 cursor-pointer text-sm text-chrome transition-colors"
                                onClick={() => {
                                  setNewBadge({...newBadge, creator_id: shop.id.toString()});
                                  setShopSearchTerm(shop.company_name || shop.username);
                                }}
                              >
                                {shop.company_name || shop.username} <span className="text-steel text-xs">(@{shop.username})</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-white/5 flex justify-end gap-4">
                  <button type="button" onClick={() => { setIsCreatingBadge(false); setEditingBadge(null); }} className="btn-secondary px-10">
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="btn-primary px-10">
                    {editingBadge ? t('common.save') : t('admin.badges.submit')}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...badges.map(b => ({ ...b, item_type: 'badge', id: b.badge_id })), ...stamps.map(s => ({ ...s, item_type: 'stamp', category: s.type }))].map((item) => {
              const IconComponent = {
                'MapPin': MapPin,
                'Activity': Activity,
                'Heart': Heart,
                'Wrench': Wrench,
                'Mountain': Mountain,
                'Star': Star,
                'Award': ShieldCheck // Fallback
              }[item.icon as string] || ShieldCheck;

              return (
                <div key={`${item.item_type}-${item.id}`} className="glass-card p-6 flex flex-col items-center text-center relative">
                  <div className="absolute top-4 right-4 px-2 py-1 rounded bg-white/5 border border-white/10 text-[8px] font-mono font-bold uppercase tracking-widest text-steel">
                    {item.item_type}
                  </div>
                  <div className="w-20 h-20 rounded-full bg-asphalt border-2 border-primary/20 flex items-center justify-center mb-4 shadow-lg shadow-primary/10 overflow-hidden">
                    {item.icon && item.icon.startsWith('/') ? (
                      <img src={item.icon} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <IconComponent className="w-10 h-10 text-primary" />
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">{item.name}</h3>
                  <p className="text-[10px] font-mono text-steel uppercase tracking-widest mb-3">{item.category}</p>
                  <p className="text-sm text-steel mb-4 line-clamp-2">{item.description}</p>
                  <div className="mt-auto pt-4 border-t border-white/5 w-full flex justify-between items-center mb-4">
                    <span className="text-[10px] font-mono text-steel uppercase tracking-widest">{t('admin.badges.creatorType')}</span>
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                      {item.creator_username ? `@${item.creator_username}` : (item.creator_type === 'platform' ? t('admin.badges.creator.platform') : item.creator_type)}
                    </span>
                  </div>
                  {item.item_type === 'badge' && (
                    <button 
                      onClick={() => setAwardingBadgeId(item.id)}
                      className="w-full py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-bold uppercase tracking-widest mb-2"
                    >
                      {t('admin.badges.awardTitle')}
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      setEditingBadge({ ...item, badge_id: item.id });
                      setNewBadge({
                        item_type: item.item_type,
                        name: item.name,
                        description: item.description,
                        icon: item.icon,
                        category: item.category,
                        creator_type: item.creator_type,
                        creator_id: item.creator_id || ''
                      });
                      setIsCreatingBadge(true);
                    }}
                    className="w-full py-2 rounded-xl bg-steel/10 text-steel hover:bg-steel/20 transition-colors text-xs font-bold uppercase tracking-widest"
                  >
                    {t('common.edit')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="glass-card p-10 border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-[120px] opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-10 flex items-center gap-4 text-primary relative z-10">
            <Settings className="w-8 h-8" />
            {t('admin.settings.title')}
          </h2>
          
          <div className="space-y-12 relative z-10">
              <div className="space-y-6">
                <h3 className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.2em] mb-6">{t('admin.settings.interface')}</h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-6 bg-asphalt rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-chrome group-hover/label:text-white transition-colors">{t('admin.settings.fullscreen')}</span>
                      <span className="text-[10px] font-mono text-steel uppercase tracking-widest">{t('admin.settings.fullscreenDesc')}</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={!!settings.fullscreen_enabled} 
                      onChange={(e) => handleSettingChange('fullscreen_enabled', e.target.checked)}
                      className="w-5 h-5 accent-primary cursor-pointer" 
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.2em] mb-6">{t('admin.settings.registration')}</h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-6 bg-asphalt rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <span className="text-sm font-medium text-chrome group-hover/label:text-white transition-colors">{t('admin.settings.approval')}</span>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary cursor-pointer" />
                  </label>
                  <label className="flex items-center justify-between p-6 bg-asphalt rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <span className="text-sm font-medium text-chrome group-hover/label:text-white transition-colors">{t('admin.settings.allowRiders')}</span>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary cursor-pointer" />
                  </label>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.2em] mb-6">{t('admin.featureAccess.title')}</h3>
                <div className="space-y-4">
                  {/* Photo Contest Global Toggle */}
                  <div className="flex items-center justify-between p-6 bg-asphalt rounded-2xl border border-white/5 hover:border-primary/20 transition-all group/label">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-chrome group-hover/label:text-white transition-colors uppercase">
                        {t('admin.contestPromotion.enable')}
                      </span>
                      <span className="text-[10px] font-mono text-steel uppercase tracking-widest">Global Contest Status</span>
                    </div>
                    <button 
                      onClick={() => updateContestPromotionSettings(!contestSettings.enabled, contestSettings.allowedTypes)}
                      className="text-primary"
                    >
                      {contestSettings.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-steel" />}
                    </button>
                  </div>

                  {featureAccess.map((feature) => (
                    <div key={feature.key} className="flex items-center justify-between p-6 bg-asphalt rounded-2xl border border-white/5 hover:border-primary/20 transition-all group/label">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-chrome group-hover/label:text-white transition-colors capitalize">
                          {feature.key.replace('feature_', '').replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-mono text-steel uppercase tracking-widest">{t('admin.featureAccess.allowedPlan')}</span>
                      </div>
                      <div className="flex bg-carbon rounded-xl p-1 border border-white/5">
                        <button
                          onClick={() => handleFeatureAccessChange(feature.key, 'freemium')}
                          className={`text-[9px] font-mono font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${
                            feature.value === 'freemium'
                              ? 'bg-asphalt text-white shadow-lg'
                              : 'text-steel hover:text-chrome'
                          }`}
                        >
                          {t('admin.plan.freemium')}
                        </button>
                        <button
                          onClick={() => handleFeatureAccessChange(feature.key, 'premium')}
                          className={`text-[9px] font-mono font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${
                            feature.value === 'premium'
                              ? 'bg-primary text-white shadow-lg shadow-primary/20'
                              : 'text-steel hover:text-chrome'
                          }`}
                        >
                          {t('admin.plan.premium')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.2em] mb-6">{t('admin.settings.flags')}</h3>
                <div className="space-y-4">
                  {Object.entries(flags).map(([key, value]) => (
                    <label key={key} className="flex items-center justify-between p-6 bg-asphalt rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                      <span className="text-sm font-medium text-chrome group-hover/label:text-white transition-colors capitalize">{key}</span>
                      <button onClick={() => toggleFlag(key as any)} className="text-primary">
                        {value ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-steel" />}
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-10 border-t border-white/5 flex justify-end">
              <button className="btn-primary px-10">
                {t('admin.settings.save')}
              </button>
            </div>
          </div>
        )}

        {awardingBadgeId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 relative">
              <button 
                onClick={() => {
                  setAwardingBadgeId(null);
                  setSelectedUserIdToAward(null);
                  setAwardSearchTerm('');
                  setAwardMessage(null);
                }}
                className="absolute top-4 right-4 text-steel hover:text-white transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
              
              <h3 className="text-2xl font-display font-black uppercase italic tracking-tighter mb-6 text-primary">{t('admin.badges.awardTitle')}</h3>
              
              {awardMessage && (
                <div className={`p-4 rounded-xl mb-6 text-sm font-bold ${awardMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {awardMessage.text}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-mono font-black text-steel uppercase tracking-widest ml-1">{t('admin.badges.award.search')}</label>
                  <input 
                    type="text" 
                    value={awardSearchTerm || ''}
                    onChange={(e) => {
                      setAwardSearchTerm(e.target.value);
                      setSelectedUserIdToAward(null);
                    }}
                    className="input-field" 
                    placeholder={t('admin.badges.award.searchPlaceholder')}
                  />
                  {awardSearchTerm && !selectedUserIdToAward && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-carbon border border-white/10 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                      {users
                        .filter(u => 
                          u.username.toLowerCase().includes(awardSearchTerm.toLowerCase()) || 
                          (u.company_name && u.company_name.toLowerCase().includes(awardSearchTerm.toLowerCase())) ||
                          (u.rider_name && u.rider_name.toLowerCase().includes(awardSearchTerm.toLowerCase()))
                        )
                        .map(user => (
                          <div 
                            key={user.id}
                            className="p-3 hover:bg-white/5 cursor-pointer text-sm text-chrome transition-colors flex justify-between items-center"
                            onClick={() => {
                              setSelectedUserIdToAward(user.id);
                              setAwardSearchTerm(user.company_name || user.rider_name || user.username);
                            }}
                          >
                            <span>{user.company_name || user.rider_name || user.username}</span>
                            <span className="text-steel text-xs">@{user.username}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <button 
                  onClick={handleAwardBadge}
                  disabled={!selectedUserIdToAward}
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                >
                  {t('admin.badges.award.confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
