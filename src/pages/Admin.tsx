import { fetchWithAuth } from '../utils/api';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldAlert, Trash2, Ban, CheckCircle, Search, UserX, Settings, Users, Calendar, Star, ShieldCheck, XCircle, Camera, MapPin, Activity, Heart, Wrench, Mountain, ToggleLeft, ToggleRight, Trophy, Plus, Edit2, Shield, Image, Upload } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'users' | 'events' | 'submissions' | 'event_photos' | 'settings' | 'badges' | 'contests' | 'ambassadors' | 'places'>(
    (searchParams.get('tab') as any) || 'users'
  );
  const [settings, setSettings] = useState<any>({});
  const [featureAccess, setFeatureAccess] = useState<any[]>([]);
  const [contestSettings, setContestSettings] = useState({ enabled: false, allowedTypes: ['premium'] });
  const [badges, setBadges] = useState<any[]>([]);
  const [stamps, setStamps] = useState<any[]>([]);
  const [keywordsConfig, setKeywordsConfig] = useState<any[]>([]);
  const [placesControl, setPlacesControl] = useState<any[]>([]);
  const [isCreatingKeyword, setIsCreatingKeyword] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<any | null>(null);
  const [newKeyword, setNewKeyword] = useState({ category_name: '', keywords: '', radius: 5000, icon: 'MapPin' });
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
  const [placesSearchTerm, setPlacesSearchTerm] = useState('');
  const [placesCategoryFilter, setPlacesCategoryFilter] = useState('all');
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);
  const [isMassActionLoading, setIsMassActionLoading] = useState(false);

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
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        data = { error: 'Invalid response from server' };
      }

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
      
      if (res.ok) {
        const data = await res.json();
        setNewBadge({ ...newBadge, icon: data.url });
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Upload failed' }));
        console.error('Upload failed:', errorData.error);
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
    if (tab && ['users', 'events', 'submissions', 'event_photos', 'settings', 'badges', 'contests', 'ambassadors', 'places'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as any);
    setSearchParams({ tab });
  };

  const fetchSettings = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/settings');
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setSettings(data);
        } catch (parseErr) {
          console.error('Failed to parse settings JSON:', text.substring(0, 100));
          throw parseErr;
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings', err);
    }
  };

  const fetchContestPromotionSettings = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/photo-contest-settings');
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          setContestSettings(data);
        } catch (parseErr) {
          console.error('Failed to parse contest settings JSON:', text.substring(0, 100));
          throw parseErr;
        }
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

  const fetchKeywords = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/admin/keywords');
      if (res.ok) {
        const data = await res.json();
        setKeywordsConfig(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPlacesControl = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/admin/places');
      if (res.ok) {
        const data = await res.json();
        setPlacesControl(data);
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
          fetchAmbassadorApps(),
          fetchKeywords(),
          fetchPlacesControl()
        ]);
        setLoading(false);
      }
    };
    loadData();
  }, [currentUser]);

  const filteredPlacesControl = placesControl.filter(place => {
    const matchesSearch = place.name.toLowerCase().includes(placesSearchTerm.toLowerCase());
    const matchesCategory = placesCategoryFilter === 'all' || place.category === placesCategoryFilter;
    return matchesSearch && matchesCategory;
  });

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
      
      <div className="flex items-center gap-2 bg-engine p-1.5 rounded-2xl border border-inverse/5 shadow-2xl overflow-x-auto no-scrollbar mb-12">
          <button
            onClick={() => handleTabChange('users')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'users' ? 'bg-primary text-inverse shadow-xl shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            <Users className="w-4 h-4" />
            {t('admin.tab.users')}
          </button>
          <button
            onClick={() => handleTabChange('events')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'events' ? 'bg-primary text-inverse shadow-xl shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            <Calendar className="w-4 h-4" />
            {t('admin.tab.events')}
          </button>
          <button
            onClick={() => handleTabChange('submissions')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'submissions' ? 'bg-primary text-inverse shadow-xl shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            <Camera className="w-4 h-4" />
            {t('admin.tab.submissions')}
          </button>
          <button
            onClick={() => handleTabChange('event_photos')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'event_photos' ? 'bg-primary text-inverse shadow-xl shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            <Image className="w-4 h-4" />
            {t('admin.eventPhotos.title')}
          </button>
          <button
            onClick={() => handleTabChange('settings')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'settings' ? 'bg-primary text-inverse shadow-xl shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            <Settings className="w-4 h-4" />
            {t('admin.tab.settings')}
          </button>
          <button
            onClick={() => handleTabChange('badges')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'badges' ? 'bg-primary text-inverse shadow-xl shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Badges & Stamps
          </button>
          <button
            onClick={() => handleTabChange('contests')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'contests' ? 'bg-primary text-inverse shadow-xl shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            <Trophy className="w-4 h-4" />
            {t('admin.tab.contests')}
          </button>
          <button
            onClick={() => handleTabChange('ambassadors')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'ambassadors' ? 'bg-primary text-inverse shadow-xl shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            <Shield className="w-4 h-4" />
            Ambassadors
          </button>
          <button
            onClick={() => handleTabChange('places')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'places' ? 'bg-primary text-inverse shadow-xl shadow-primary/20' : 'text-steel hover:text-chrome'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Places
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

          <div className="glass-card overflow-hidden border-inverse/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-inverse/5 bg-engine">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.user')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.type')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.plan')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.role')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.joined')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.status')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-inverse/5">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-16 text-center">
                        <UserX className="w-12 h-12 mx-auto mb-4 text-engine" />
                        <div className="text-xl font-display font-black uppercase italic text-steel">{t('admin.noUsers')}</div>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-inverse transition-colors group">
                        <td className="p-6">
                          <div className="flex items-center gap-4">
                            <img 
                              src={user.profile_picture_url} 
                              alt="" 
                              className="w-12 h-12 rounded-2xl object-cover bg-oil border border-inverse/5 grayscale group-hover:grayscale-0 transition-all"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <div className="font-display font-black uppercase italic text-lg tracking-tight text-chrome group-hover:text-primary transition-colors">
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
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-widest bg-engine text-steel border border-inverse/5">
                            {user.type === 'rider' ? t('register.type.rider') : t('register.type.ecosystem')}
                          </span>
                        </td>
                        <td className="p-6">
                          <div className="flex bg-oil rounded-xl p-1 border border-inverse/5 w-fit">
                            <button
                              onClick={() => handlePlanChange(user.id, 'freemium')}
                              className={`text-[9px] font-mono font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                                user.plan === 'freemium' || !user.plan
                                  ? 'bg-engine text-chrome shadow-lg'
                                  : 'text-steel hover:text-chrome'
                              }`}
                            >
                              {t('admin.plan.freemium')}
                            </button>
                            <button
                              onClick={() => handlePlanChange(user.id, 'premium')}
                              className={`text-[9px] font-mono font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${
                                user.plan === 'premium'
                                  ? 'bg-primary text-inverse shadow-lg shadow-primary/20'
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
                            className="bg-engine text-steel text-[10px] font-mono font-black uppercase tracking-widest rounded-xl border border-inverse/5 px-4 py-2 focus:outline-none focus:border-primary focus:text-primary transition-all cursor-pointer"
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
                              ? 'bg-success/5 text-success border-success/20' 
                              : user.status === 'pending'
                              ? 'bg-accent/5 text-accent border-accent/20'
                              : 'bg-error/5 text-error border-error/20'
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
                                className="p-3 text-success hover:bg-success/10 rounded-xl border border-transparent hover:border-success/20 transition-all"
                                title={t('admin.action.approve')}
                              >
                                <CheckCircle className="w-5 h-5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleStatusChange(user.id, user.status)}
                              className={`p-3 rounded-xl border border-transparent transition-all ${
                                user.status === 'active' 
                                  ? 'text-steel hover:text-error hover:bg-error/10 hover:border-error/20' 
                                  : 'text-steel hover:text-success hover:bg-success/10 hover:border-success/20'
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
                              className="p-3 text-steel hover:text-error hover:bg-error/10 rounded-xl border border-transparent hover:border-error/20 transition-all"
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

          <div className="glass-card overflow-hidden border-inverse/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-inverse/5 bg-engine">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.event')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.host')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.date')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.status')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.promoted')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-inverse/5">
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-16 text-center">
                        <Calendar className="w-12 h-12 mx-auto mb-4 text-engine" />
                        <div className="text-xl font-display font-black uppercase italic text-steel">{t('admin.noEvents')}</div>
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-inverse transition-colors group">
                        <td className="p-6">
                          <div>
                            <div className="font-display font-black uppercase italic text-lg tracking-tight text-chrome group-hover:text-primary transition-colors leading-none mb-1">{event.title}</div>
                            <div className="text-[10px] font-mono font-black text-steel uppercase tracking-widest">{event.location}</div>
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="flex items-center gap-3">
                            <img 
                              src={event.profile_picture_url} 
                              alt="" 
                              className="w-8 h-8 rounded-xl object-cover border border-inverse/5 grayscale group-hover:grayscale-0 transition-all"
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
                              ? 'bg-success/5 text-success border-success/20' 
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
                              : 'bg-engine text-steel border-inverse/5'
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
                                  : 'text-steel hover:text-success hover:bg-success/10 hover:border-success/20'
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
                className="bg-engine text-steel text-[10px] font-mono font-black uppercase tracking-widest rounded-xl border border-inverse/5 px-4 py-2 focus:outline-none focus:border-primary transition-all"
              >
                <option value="all">{t('admin.submissions.allContests')}</option>
                {contests.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="glass-card overflow-hidden border-inverse/5 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-inverse/5 bg-engine">
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.photo')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.user')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.contest')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.submissions.votes')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.status')}</th>
      <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-inverse/5">
    {submissions
      .filter(sub => selectedContestFilter === 'all' || sub.contest_id?.toString() === selectedContestFilter)
      .map((sub) => (
      <tr key={sub.id} className="hover:bg-inverse transition-colors">
        <td className="p-6">
          <img src={sub.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
        </td>
        <td className="p-6 text-steel font-mono text-sm">@{sub.username}</td>
        <td className="p-6 text-steel font-mono text-sm uppercase">{sub.contest_title || sub.contest_type}</td>
        <td className="p-6 text-primary font-mono font-bold">{sub.vote_count || 0}</td>
        <td className="p-6">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${sub.approved ? 'bg-success/20 text-success' : 'bg-accent/20 text-accent'}`}>
                        {sub.approved ? t('admin.status.approved') : t('admin.status.pending')}
                      </span>
                    </td>
                    <td className="p-6 text-right">
                      <button
                        onClick={() => handleApproveSubmission(sub.id, sub.approved)}
                        className={`p-2 rounded-xl ${sub.approved ? 'text-error' : 'text-success'}`}
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
                  className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-xl font-mono text-[10px] font-black uppercase tracking-widest border border-success/20 hover:bg-success hover:text-chrome transition-all"
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
                  className="flex items-center gap-2 px-4 py-2 bg-error/10 text-error rounded-xl font-mono text-[10px] font-black uppercase tracking-widest border border-error/20 hover:bg-error hover:text-chrome transition-all"
                >
                  <XCircle className="w-4 h-4" />
                  {t('event.details.rejectAll')}
                </button>
              </div>
            )}
          </div>
          <div className="glass-card overflow-hidden border-inverse/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-inverse/5 bg-engine">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.photo')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.user')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.event')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-inverse/5">
                  {eventPhotos.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-12 text-center text-steel font-mono text-sm uppercase tracking-widest">
                        {t('event.details.noPendingPhotos')}
                      </td>
                    </tr>
                  ) : (
                    eventPhotos.map((photo) => (
                      <tr key={photo.id} className="hover:bg-inverse transition-colors">
                        <td className="p-6">
                          <img src={photo.image_url} alt="" className="w-24 h-24 rounded-xl object-cover" referrerPolicy="no-referrer" />
                        </td>
                        <td className="p-6 text-steel font-mono text-sm">@{photo.username}</td>
                        <td className="p-6 text-steel font-mono text-sm uppercase">{photo.event_title}</td>
                        <td className="p-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleApproveEventPhoto(photo.id, 'approved')}
                              className="p-3 bg-success/10 text-success rounded-xl hover:bg-success hover:text-chrome transition-all"
                              title={t('common.approve')}
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleApproveEventPhoto(photo.id, 'rejected')}
                              className="p-3 bg-error/10 text-error rounded-xl hover:bg-error hover:text-chrome transition-all"
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
                              className="w-full text-left p-2 rounded hover:bg-inverse/5 text-xs text-steel font-mono uppercase"
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
                                  className="w-full text-left p-2 rounded hover:bg-inverse/5 flex items-center gap-3"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <Star className="w-4 h-4 text-primary" />
                                  </div>
                                  <div>
                                    <div className="text-sm font-bold text-chrome">{badge.name}</div>
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

          <div className="glass-card overflow-hidden border-inverse/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-inverse/5 bg-engine">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.contest')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.contests.dates')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.table.status')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel">{t('admin.contests.leaderWinner')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-steel text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-inverse/5">
                  {contests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-16 text-center">
                        <Trophy className="w-12 h-12 mx-auto mb-4 text-engine" />
                        <div className="text-xl font-display font-black uppercase italic text-steel">{t('admin.contests.noContests')}</div>
                      </td>
                    </tr>
                  ) : (
                    contests.map((contest) => (
                      <tr key={contest.id} className="hover:bg-inverse transition-colors group">
                        <td className="p-6">
                          <div className="flex items-start gap-4">
                            {contest.prize_badge_icon && (
                              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                                <Star className="w-5 h-5 text-primary" />
                              </div>
                            )}
                            <div>
                              <div className="font-display font-black uppercase italic text-lg tracking-tight text-chrome group-hover:text-primary transition-colors leading-none mb-1">{contest.title}</div>
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
                              ? 'bg-success/5 text-success border-success/20' 
                              : contest.status === 'completed'
                              ? 'bg-primary/5 text-primary border-primary/20'
                              : 'bg-engine text-steel border-inverse/5'
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
                              className="p-3 text-steel hover:text-error hover:bg-error/10 rounded-xl border border-transparent hover:border-error/20 transition-all"
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
          <h2 className="text-2xl font-display font-black uppercase italic text-chrome mb-6">Ambassador Applications</h2>
          {ambassadorApps.length === 0 ? (
            <p className="text-steel">No ambassador applications found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {ambassadorApps.map(app => (
                <div key={app.id} className="bg-oil border border-inverse/10 rounded-2xl p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-chrome">{app.name}</h3>
                      <p className="text-steel">@{app.username} • {app.email}</p>
                      <p className="text-primary font-bold capitalize mt-1">{app.category} Ambassador</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      app.status === 'pending' ? 'bg-warning/20 text-warning' :
                      app.status === 'approved' ? 'bg-success/20 text-success' :
                      'bg-error/20 text-error'
                    }`}>
                      {app.status}
                    </span>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">Location</p>
                      <p className="text-chrome">{app.location}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-steel mb-1">Description</p>
                      <p className="text-chrome text-sm">{app.description}</p>
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
                        className="flex-1 bg-success/20 text-success hover:bg-success/30 py-2 rounded-xl font-bold transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectAmbassador(app.id)}
                        className="flex-1 bg-error/20 text-error hover:bg-error/30 py-2 rounded-xl font-bold transition-colors"
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
    ) : activeTab === 'places' ? (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-display font-black uppercase italic text-chrome">Places Control</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Keywords Config */}
            <div className="bg-oil border border-inverse/10 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-chrome">Keywords Configuration</h3>
                <button
                  onClick={() => setIsCreatingKeyword(true)}
                  className="bg-primary text-inverse px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
                >
                  Add Category
                </button>
              </div>

              {isCreatingKeyword && (
                <div className="bg-inverse/5 rounded-xl p-4 mb-6 space-y-4">
                  <input
                    type="text"
                    placeholder="Category Name (e.g., Food Stops)"
                    value={newKeyword.category_name}
                    onChange={e => setNewKeyword({ ...newKeyword, category_name: e.target.value })}
                    className="w-full bg-oil border border-inverse/10 rounded-xl px-4 py-2 text-chrome"
                  />
                  <input
                    type="text"
                    placeholder="Keywords (comma separated)"
                    value={newKeyword.keywords}
                    onChange={e => setNewKeyword({ ...newKeyword, keywords: e.target.value })}
                    className="w-full bg-oil border border-inverse/10 rounded-xl px-4 py-2 text-chrome"
                  />
                  <div className="flex gap-4">
                    <input
                      type="number"
                      placeholder="Radius (m)"
                      value={newKeyword.radius}
                      onChange={e => setNewKeyword({ ...newKeyword, radius: parseInt(e.target.value) })}
                      className="w-1/2 bg-oil border border-inverse/10 rounded-xl px-4 py-2 text-chrome"
                    />
                    <input
                      type="text"
                      placeholder="Icon Name (Lucide)"
                      value={newKeyword.icon}
                      onChange={e => setNewKeyword({ ...newKeyword, icon: e.target.value })}
                      className="w-1/2 bg-oil border border-inverse/10 rounded-xl px-4 py-2 text-chrome"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsCreatingKeyword(false)}
                      className="text-steel hover:text-chrome px-4 py-2"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetchWithAuth('/api/admin/keywords', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              ...newKeyword,
                              keywords: newKeyword.keywords.split(',').map(k => k.trim())
                            })
                          });
                          if (res.ok) {
                            fetchKeywords();
                            setIsCreatingKeyword(false);
                            setNewKeyword({ category_name: '', keywords: '', radius: 5000, icon: 'MapPin' });
                          }
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="bg-primary text-inverse px-4 py-2 rounded-xl font-bold"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {keywordsConfig.map(kw => (
                  <div key={kw.id} className="flex items-center justify-between bg-inverse/5 rounded-xl p-4">
                    <div>
                      <h4 className="font-bold text-chrome">{kw.category_name}</h4>
                      <p className="text-sm text-steel">{kw.keywords.join(', ')}</p>
                      <p className="text-xs text-steel mt-1">Radius: {kw.radius}m | Icon: {kw.icon}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingKeyword({
                            ...kw,
                            keywords: kw.keywords.join(', ')
                          });
                        }}
                        className="text-primary hover:text-primary/80"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm('Delete this category?')) {
                            try {
                              const res = await fetchWithAuth(`/api/admin/keywords/${kw.id}`, { method: 'DELETE' });
                              if (res.ok) fetchKeywords();
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                        className="text-error hover:text-error/80"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {editingKeyword && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
                <div className="bg-oil border border-inverse/10 rounded-2xl p-6 w-full max-w-md space-y-4">
                  <h3 className="text-xl font-display font-black uppercase italic text-chrome">Edit Category</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-steel block mb-1">Category Name</label>
                      <input
                        type="text"
                        value={editingKeyword.category_name}
                        onChange={e => setEditingKeyword({ ...editingKeyword, category_name: e.target.value })}
                        className="w-full bg-oil border border-inverse/10 rounded-xl px-4 py-2 text-chrome"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-steel block mb-1">Keywords (comma separated)</label>
                      <input
                        type="text"
                        value={editingKeyword.keywords}
                        onChange={e => setEditingKeyword({ ...editingKeyword, keywords: e.target.value })}
                        className="w-full bg-oil border border-inverse/10 rounded-xl px-4 py-2 text-chrome"
                      />
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase tracking-widest text-steel block mb-1">Radius (m)</label>
                        <input
                          type="number"
                          value={editingKeyword.radius}
                          onChange={e => setEditingKeyword({ ...editingKeyword, radius: parseInt(e.target.value) })}
                          className="w-full bg-oil border border-inverse/10 rounded-xl px-4 py-2 text-chrome"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] uppercase tracking-widest text-steel block mb-1">Icon Name</label>
                        <input
                          type="text"
                          value={editingKeyword.icon}
                          onChange={e => setEditingKeyword({ ...editingKeyword, icon: e.target.value })}
                          className="w-full bg-oil border border-inverse/10 rounded-xl px-4 py-2 text-chrome"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      onClick={() => setEditingKeyword(null)}
                      className="text-steel hover:text-chrome px-4 py-2"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetchWithAuth(`/api/admin/keywords/${editingKeyword.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              ...editingKeyword,
                              keywords: editingKeyword.keywords.split(',').map((k: string) => k.trim())
                            })
                          });
                          if (res.ok) {
                            fetchKeywords();
                            setEditingKeyword(null);
                          }
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="bg-primary text-inverse px-6 py-2 rounded-xl font-bold"
                    >
                      Update
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Places Control */}
            <div className="bg-oil border border-inverse/10 rounded-2xl p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h3 className="text-lg font-bold text-chrome">Places Control</h3>
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel" />
                    <input
                      type="text"
                      placeholder="Search places..."
                      value={placesSearchTerm}
                      onChange={(e) => setPlacesSearchTerm(e.target.value)}
                      className="w-full bg-inverse/5 border border-inverse/10 rounded-xl pl-10 pr-4 py-2 text-sm text-chrome focus:border-primary/50 outline-none transition-all"
                    />
                  </div>
                  <select
                    value={placesCategoryFilter}
                    onChange={(e) => setPlacesCategoryFilter(e.target.value)}
                    className="bg-inverse/5 border border-inverse/10 rounded-xl px-4 py-2 text-sm text-chrome focus:border-primary/50 outline-none transition-all"
                  >
                    <option value="all">All Categories</option>
                    {Array.from(new Set(placesControl.map(p => p.category))).filter(Boolean).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <label className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Bulk Import
                    <input 
                      type="file" 
                      accept=".json" 
                      className="hidden" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        try {
                          const text = await file.text();
                          const places = JSON.parse(text);
                          
                          const res = await fetchWithAuth('/api/admin/places/bulk-import', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ places })
                          });
                          
                          if (res.ok) {
                            showNotification('success', `Successfully imported ${places.length} places`);
                            fetchPlacesControl();
                          } else {
                            showNotification('error', 'Failed to import places');
                          }
                        } catch (err) {
                          console.error(err);
                          showNotification('error', 'Invalid JSON file');
                        }
                        // Reset input
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              {selectedPlaces.length > 0 && (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                  <span className="text-sm font-bold text-primary">{selectedPlaces.length} places selected</span>
                  <div className="flex gap-2">
                    <button
                      disabled={isMassActionLoading}
                      onClick={async () => {
                        setIsMassActionLoading(true);
                        try {
                          await Promise.all(selectedPlaces.map(id => 
                            fetchWithAuth(`/api/admin/places/${id}/control`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ is_approved: 1 })
                            })
                          ));
                          showNotification('success', `Approved ${selectedPlaces.length} places`);
                          setSelectedPlaces([]);
                          await fetchPlacesControl();
                        } catch (err) {
                          console.error(err);
                          showNotification('error', 'Failed to mass approve');
                        } finally {
                          setIsMassActionLoading(false);
                        }
                      }}
                      className="bg-success text-inverse px-4 py-2 rounded-lg text-xs font-bold hover:bg-success/90 transition-all disabled:opacity-50"
                    >
                      {isMassActionLoading ? 'Processing...' : 'Mass Approve'}
                    </button>
                    <button
                      disabled={isMassActionLoading}
                      onClick={async () => {
                        setIsMassActionLoading(true);
                        try {
                          await Promise.all(selectedPlaces.map(id => 
                            fetchWithAuth(`/api/admin/places/${id}/control`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ is_hidden: 1 })
                            })
                          ));
                          showNotification('success', `Hidden ${selectedPlaces.length} places`);
                          setSelectedPlaces([]);
                          await fetchPlacesControl();
                        } catch (err) {
                          console.error(err);
                          showNotification('error', 'Failed to mass hide');
                        } finally {
                          setIsMassActionLoading(false);
                        }
                      }}
                      className="bg-error text-inverse px-4 py-2 rounded-lg text-xs font-bold hover:bg-error/90 transition-all disabled:opacity-50"
                    >
                      {isMassActionLoading ? 'Processing...' : 'Mass Hide'}
                    </button>
                    <button
                      onClick={() => setSelectedPlaces([])}
                      className="text-steel hover:text-chrome px-4 py-2 text-xs font-bold"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {placesControl.length > 0 && (
                <div className="flex items-center gap-2 mb-4 px-1">
                  <input
                    type="checkbox"
                    checked={filteredPlacesControl.length > 0 && filteredPlacesControl.every(p => selectedPlaces.includes(p.place_id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const newSelected = [...new Set([...selectedPlaces, ...filteredPlacesControl.map(p => p.place_id)])];
                        setSelectedPlaces(newSelected);
                      } else {
                        const filteredIds = filteredPlacesControl.map(p => p.place_id);
                        setSelectedPlaces(selectedPlaces.filter(id => !filteredIds.includes(id)));
                      }
                    }}
                    className="w-4 h-4 rounded border-inverse/10 text-primary focus:ring-primary bg-oil"
                  />
                  <span className="text-[10px] font-mono font-black uppercase tracking-widest text-steel">
                    {filteredPlacesControl.length > 0 && filteredPlacesControl.every(p => selectedPlaces.includes(p.place_id)) ? 'Deselect All Filtered' : 'Select All Filtered'}
                  </span>
                </div>
              )}

              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {filteredPlacesControl.map(place => (
                  <div key={place.place_id} className={`bg-inverse/5 rounded-xl p-4 transition-all border ${selectedPlaces.includes(place.place_id) ? 'border-primary/50 bg-primary/5' : 'border-transparent'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedPlaces.includes(place.place_id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPlaces(prev => [...prev, place.place_id]);
                            } else {
                              setSelectedPlaces(prev => prev.filter(id => id !== place.place_id));
                            }
                          }}
                          className="mt-1 w-4 h-4 rounded border-inverse/10 text-primary focus:ring-primary bg-oil"
                        />
                        <div>
                          <h4 className="font-bold text-chrome">{place.name}</h4>
                          <p className="text-sm text-steel">{place.category} • {place.rating}★ ({place.reviews})</p>
                          {place.full_address && (
                            <p className="text-[10px] text-steel/60 mt-1 italic">{place.full_address}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetchWithAuth(`/api/admin/places/${place.place_id}/control`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  is_approved: !place.is_approved,
                                  is_hidden: place.is_hidden,
                                  custom_category: place.custom_category,
                                  priority_score: place.priority_score
                                })
                              });
                              if (res.ok) fetchPlacesControl();
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${place.is_approved ? 'bg-success/20 text-success' : 'bg-inverse/10 text-steel'}`}
                        >
                          {place.is_approved ? 'Approved' : 'Approve'}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetchWithAuth(`/api/admin/places/${place.place_id}/control`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  is_approved: place.is_approved,
                                  is_hidden: !place.is_hidden,
                                  custom_category: place.custom_category,
                                  priority_score: place.priority_score
                                })
                              });
                              if (res.ok) fetchPlacesControl();
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${place.is_hidden ? 'bg-error/20 text-error' : 'bg-inverse/10 text-steel'}`}
                        >
                          {place.is_hidden ? 'Hidden' : 'Hide'}
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-4 mt-4">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase tracking-widest text-steel block mb-1">Custom Category</label>
                        <input
                          type="text"
                          defaultValue={place.custom_category || ''}
                          onBlur={async (e) => {
                            if (e.target.value !== place.custom_category) {
                              try {
                                const res = await fetchWithAuth(`/api/admin/places/${place.place_id}/control`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    is_approved: place.is_approved,
                                    is_hidden: place.is_hidden,
                                    custom_category: e.target.value,
                                    priority_score: place.priority_score
                                  })
                                });
                                if (res.ok) fetchPlacesControl();
                              } catch (err) {
                                console.error(err);
                              }
                            }
                          }}
                          className="w-full bg-oil border border-inverse/10 rounded-lg px-3 py-1 text-sm text-chrome"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-[10px] uppercase tracking-widest text-steel block mb-1">Priority</label>
                        <input
                          type="number"
                          defaultValue={place.priority_score || 0}
                          onBlur={async (e) => {
                            if (parseInt(e.target.value) !== place.priority_score) {
                              try {
                                const res = await fetchWithAuth(`/api/admin/places/${place.place_id}/control`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    is_approved: place.is_approved,
                                    is_hidden: place.is_hidden,
                                    custom_category: place.custom_category,
                                    priority_score: parseInt(e.target.value)
                                  })
                                });
                                if (res.ok) fetchPlacesControl();
                              } catch (err) {
                                console.error(err);
                              }
                            }
                          }}
                          className="w-full bg-oil border border-inverse/10 rounded-lg px-3 py-1 text-sm text-chrome"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
                      className={`flex-1 py-3 rounded-xl font-mono text-xs font-bold uppercase tracking-widest transition-all ${newBadge.item_type === 'badge' ? 'bg-primary text-inverse shadow-lg shadow-primary/20' : 'bg-oil text-steel hover:bg-inverse/5 border border-inverse/10'}`}
                    >
                      Badge
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewBadge({ ...newBadge, item_type: 'stamp' })}
                      className={`flex-1 py-3 rounded-xl font-mono text-xs font-bold uppercase tracking-widest transition-all ${newBadge.item_type === 'stamp' ? 'bg-primary text-inverse shadow-lg shadow-primary/20' : 'bg-oil text-steel hover:bg-inverse/5 border border-inverse/10'}`}
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
                        <img src={newBadge.icon} alt="Badge Preview" className="w-12 h-12 rounded-full object-cover border border-inverse/10" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-oil border border-inverse/10 flex items-center justify-center">
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
                        <div className="absolute top-full left-0 w-full mt-1 bg-oil border border-inverse/10 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                          {users
                            .filter(u => u.type === 'ecosystem' && (u.company_name?.toLowerCase().includes(shopSearchTerm.toLowerCase()) || u.username.toLowerCase().includes(shopSearchTerm.toLowerCase())))
                            .map(shop => (
                              <div 
                                key={shop.id}
                                className="p-3 hover:bg-inverse/5 cursor-pointer text-sm text-chrome transition-colors"
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

                <div className="pt-6 border-t border-inverse/5 flex justify-end gap-4">
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
                  <div className="absolute top-4 right-4 px-2 py-1 rounded bg-inverse/5 border border-inverse/10 text-[8px] font-mono font-bold uppercase tracking-widest text-steel">
                    {item.item_type}
                  </div>
                  <div className="w-20 h-20 rounded-full bg-engine border-2 border-primary/20 flex items-center justify-center mb-4 shadow-lg shadow-primary/10 overflow-hidden">
                    {item.icon && item.icon.startsWith('/') ? (
                      <img src={item.icon} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <IconComponent className="w-10 h-10 text-primary" />
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-chrome mb-1">{item.name}</h3>
                  <p className="text-[10px] font-mono text-steel uppercase tracking-widest mb-3">{item.category}</p>
                  <p className="text-sm text-steel mb-4 line-clamp-2">{item.description}</p>
                  <div className="mt-auto pt-4 border-t border-inverse/5 w-full flex justify-between items-center mb-4">
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
        <div className="glass-card p-10 border-inverse/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-[120px] opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-10 flex items-center gap-4 text-primary relative z-10">
            <Settings className="w-8 h-8" />
            {t('admin.settings.title')}
          </h2>
          
          <div className="space-y-12 relative z-10">
              <div className="space-y-6">
                <h3 className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.2em] mb-6">{t('admin.settings.interface')}</h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-6 bg-engine rounded-2xl border border-inverse/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-chrome group-hover/label:text-chrome transition-colors">{t('admin.settings.fullscreen')}</span>
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
                  <label className="flex items-center justify-between p-6 bg-engine rounded-2xl border border-inverse/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <span className="text-sm font-medium text-chrome group-hover/label:text-chrome transition-colors">{t('admin.settings.approval')}</span>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary cursor-pointer" />
                  </label>
                  <label className="flex items-center justify-between p-6 bg-engine rounded-2xl border border-inverse/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <span className="text-sm font-medium text-chrome group-hover/label:text-chrome transition-colors">{t('admin.settings.allowRiders')}</span>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary cursor-pointer" />
                  </label>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.2em] mb-6">Map Data Sources</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-6 bg-engine rounded-2xl border border-inverse/5 hover:border-primary/20 transition-all group/label">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-chrome group-hover/label:text-chrome transition-colors uppercase">
                        Google Maps API
                      </span>
                      <span className="text-[10px] font-mono text-steel uppercase tracking-widest">Enable Google Places Search</span>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          const newValue = !settings.api_google_maps;
                          const res = await fetchWithAuth('/api/admin/settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: 'api_google_maps', value: newValue })
                          });
                          if (res.ok) {
                            setSettings(prev => ({ ...prev, api_google_maps: newValue }));
                            showNotification('success', 'Settings updated');
                          }
                        } catch (err) {
                          console.error(err);
                          showNotification('error', 'Failed to update settings');
                        }
                      }}
                      className="text-primary"
                    >
                      {settings.api_google_maps ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-steel" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-6 bg-engine rounded-2xl border border-inverse/5 hover:border-primary/20 transition-all group/label">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-chrome group-hover/label:text-chrome transition-colors uppercase">
                        OpenStreetMap API
                      </span>
                      <span className="text-[10px] font-mono text-steel uppercase tracking-widest">Enable Overpass API Search</span>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          const newValue = !settings.api_osm;
                          const res = await fetchWithAuth('/api/admin/settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: 'api_osm', value: newValue })
                          });
                          if (res.ok) {
                            setSettings(prev => ({ ...prev, api_osm: newValue }));
                            showNotification('success', 'Settings updated');
                          }
                        } catch (err) {
                          console.error(err);
                          showNotification('error', 'Failed to update settings');
                        }
                      }}
                      className="text-primary"
                    >
                      {settings.api_osm ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-steel" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-mono font-black text-steel uppercase tracking-[0.2em] mb-6">{t('admin.featureAccess.title')}</h3>
                <div className="space-y-4">
                  {/* Photo Contest Global Toggle */}
                  <div className="flex items-center justify-between p-6 bg-engine rounded-2xl border border-inverse/5 hover:border-primary/20 transition-all group/label">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-chrome group-hover/label:text-chrome transition-colors uppercase">
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
                    <div key={feature.key} className="flex items-center justify-between p-6 bg-engine rounded-2xl border border-inverse/5 hover:border-primary/20 transition-all group/label">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-chrome group-hover/label:text-chrome transition-colors capitalize">
                          {feature.key.replace('feature_', '').replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-mono text-steel uppercase tracking-widest">{t('admin.featureAccess.allowedPlan')}</span>
                      </div>
                      <div className="flex bg-oil rounded-xl p-1 border border-inverse/5">
                        <button
                          onClick={() => handleFeatureAccessChange(feature.key, 'freemium')}
                          className={`text-[9px] font-mono font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${
                            feature.value === 'freemium'
                              ? 'bg-engine text-chrome shadow-lg'
                              : 'text-steel hover:text-chrome'
                          }`}
                        >
                          {t('admin.plan.freemium')}
                        </button>
                        <button
                          onClick={() => handleFeatureAccessChange(feature.key, 'premium')}
                          className={`text-[9px] font-mono font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-all ${
                            feature.value === 'premium'
                              ? 'bg-primary text-inverse shadow-lg shadow-primary/20'
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
                    <label key={key} className="flex items-center justify-between p-6 bg-engine rounded-2xl border border-inverse/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                      <span className="text-sm font-medium text-chrome group-hover/label:text-chrome transition-colors capitalize">{key}</span>
                      <button onClick={() => toggleFlag(key as any)} className="text-primary">
                        {value ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-steel" />}
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-10 border-t border-inverse/5 flex justify-end">
              <button className="btn-primary px-10">
                {t('admin.settings.save')}
              </button>
            </div>
          </div>
        )}

        {awardingBadgeId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-engine/80 backdrop-blur-sm">
            <div className="glass-card w-full max-w-md p-6 relative">
              <button 
                onClick={() => {
                  setAwardingBadgeId(null);
                  setSelectedUserIdToAward(null);
                  setAwardSearchTerm('');
                  setAwardMessage(null);
                }}
                className="absolute top-4 right-4 text-steel hover:text-chrome transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
              
              <h3 className="text-2xl font-display font-black uppercase italic tracking-tighter mb-6 text-primary">{t('admin.badges.awardTitle')}</h3>
              
              {awardMessage && (
                <div className={`p-4 rounded-xl mb-6 text-sm font-bold ${awardMessage.type === 'success' ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}>
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
                    <div className="absolute top-full left-0 w-full mt-1 bg-oil border border-inverse/10 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                      {users
                        .filter(u => 
                          u.username.toLowerCase().includes(awardSearchTerm.toLowerCase()) || 
                          (u.company_name && u.company_name.toLowerCase().includes(awardSearchTerm.toLowerCase())) ||
                          (u.rider_name && u.rider_name.toLowerCase().includes(awardSearchTerm.toLowerCase()))
                        )
                        .map(user => (
                          <div 
                            key={user.id}
                            className="p-3 hover:bg-inverse/5 cursor-pointer text-sm text-chrome transition-colors flex justify-between items-center"
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
