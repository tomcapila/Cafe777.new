import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Trash2, Ban, CheckCircle, Search, UserX, Settings, Users, Calendar, Star, ShieldCheck, XCircle, Camera } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export default function Admin() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'events' | 'submissions' | 'settings'>('users');
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'x-admin-role': currentUser.role }
      });
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEvents = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/admin/events', {
        headers: { 'x-admin-role': currentUser.role }
      });
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (currentUser) {
        setLoading(true);
        await Promise.all([fetchUsers(), fetchEvents(), fetchSubmissions(), fetchSettings()]);
        setLoading(false);
      }
    };
    loadData();
  }, [currentUser]);

  const handleSettingChange = async (key: string, value: any) => {
    try {
      const res = await fetch('/api/admin/settings', {
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
      const res = await fetch(`/api/admin/users/${id}/status`, {
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
      const res = await fetch(`/api/admin/users/${id}/role`, {
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
      const res = await fetch(`/api/admin/events/${id}/approve`, {
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
      const res = await fetch('/api/admin/submissions', {
        headers: { 'x-admin-role': currentUser.role }
      });
      const data = await res.json();
      setSubmissions(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveSubmission = async (id: number, currentStatus: number) => {
    try {
      const res = await fetch(`/api/admin/submissions/${id}/approve`, {
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

  const handlePromoteEvent = async (id: number, currentStatus: number) => {
    try {
      const res = await fetch(`/api/admin/events/${id}/promote`, {
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
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
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
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4">
        <ShieldAlert className="w-20 h-20 text-zinc-800 mb-8" />
        <h2 className="text-4xl font-display font-black uppercase italic tracking-tighter mb-4">{t('admin.accessDenied')}</h2>
        <p className="text-zinc-500 mb-10 font-light">{t('admin.noPermission')}</p>
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

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
        <div>
          <h1 className="text-4xl sm:text-5xl font-display font-black uppercase italic tracking-tighter mb-2 flex items-center gap-4 text-primary">
            <ShieldAlert className="w-10 h-10" />
            {t('admin.title')}
          </h1>
          <p className="text-zinc-500 font-light">{t('admin.subtitle')}</p>
        </div>
        
        <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-white/5 shadow-2xl">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
              activeTab === 'users' ? 'bg-primary text-zinc-950 shadow-xl shadow-primary/20' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            {t('admin.tab.users')}
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
              activeTab === 'events' ? 'bg-primary text-zinc-950 shadow-xl shadow-primary/20' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            {t('admin.tab.events')}
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
              activeTab === 'submissions' ? 'bg-primary text-zinc-950 shadow-xl shadow-primary/20' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            {t('admin.tab.submissions')}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
              activeTab === 'settings' ? 'bg-primary text-zinc-950 shadow-xl shadow-primary/20' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            {t('admin.tab.settings')}
          </button>
        </div>
      </div>

      {activeTab === 'users' ? (
        <>
          <div className="mb-8 relative group">
            <Search className="w-5 h-5 text-zinc-600 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder={t('admin.search.users')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-12"
            />
          </div>

          <div className="glass-card overflow-hidden border-white/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-950">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.user')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.type')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.role')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.joined')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.status')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500 text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-16 text-center">
                        <UserX className="w-12 h-12 mx-auto mb-4 text-zinc-800" />
                        <div className="text-xl font-display font-black uppercase italic text-zinc-500">{t('admin.noUsers')}</div>
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
                              className="w-12 h-12 rounded-2xl object-cover bg-zinc-900 border border-white/5 grayscale group-hover:grayscale-0 transition-all"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <div className="font-display font-black uppercase italic text-lg tracking-tight text-white group-hover:text-primary transition-colors">
                                {user.type === 'rider' ? user.rider_name : user.company_name}
                              </div>
                              <div className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-widest">@{user.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-6">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-widest bg-zinc-950 text-zinc-400 border border-white/5">
                            {user.type === 'rider' ? t('register.type.rider') : t('register.type.ecosystem')}
                          </span>
                        </td>
                        <td className="p-6">
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            className="bg-zinc-950 text-zinc-400 text-[10px] font-mono font-black uppercase tracking-widest rounded-xl border border-white/5 px-4 py-2 focus:outline-none focus:border-primary focus:text-primary transition-all cursor-pointer"
                          >
                            <option value="user">User</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="p-6 text-[10px] font-mono font-black text-zinc-500 uppercase tracking-widest">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-6">
                          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono font-black uppercase tracking-widest border ${
                            user.status === 'active' 
                              ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' 
                              : user.status === 'pending'
                              ? 'bg-amber-500/5 text-amber-400 border-amber-500/20'
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
                                title="Approve User"
                              >
                                <CheckCircle className="w-5 h-5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleStatusChange(user.id, user.status)}
                              className={`p-3 rounded-xl border border-transparent transition-all ${
                                user.status === 'active' 
                                  ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20' 
                                  : 'text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20'
                              }`}
                              title={user.status === 'active' ? 'Ban User' : 'Unban User'}
                            >
                              {user.status === 'active' ? <Ban className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-3 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-transparent hover:border-red-500/20 transition-all"
                              title="Delete User"
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
            <Search className="w-5 h-5 text-zinc-600 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder={t('admin.search.events')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-12"
            />
          </div>

          <div className="glass-card overflow-hidden border-white/5 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-zinc-950">
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.event')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.host')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.date')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.status')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.promoted')}</th>
                    <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500 text-right">{t('admin.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-16 text-center">
                        <Calendar className="w-12 h-12 mx-auto mb-4 text-zinc-800" />
                        <div className="text-xl font-display font-black uppercase italic text-zinc-500">{t('admin.noEvents')}</div>
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="p-6">
                          <div>
                            <div className="font-display font-black uppercase italic text-lg tracking-tight text-white group-hover:text-primary transition-colors leading-none mb-1">{event.title}</div>
                            <div className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-widest">{event.location}</div>
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
                            <span className="text-[10px] font-mono font-black text-zinc-400 uppercase tracking-widest">@{event.username}</span>
                          </div>
                        </td>
                        <td className="p-6 text-[10px] font-mono font-black text-zinc-500 uppercase tracking-widest">
                          {new Date(event.date).toLocaleDateString()}
                        </td>
                        <td className="p-6">
                          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono font-black uppercase tracking-widest border ${
                            event.is_approved 
                              ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' 
                              : 'bg-amber-500/5 text-amber-400 border-amber-500/20'
                          }`}>
                            {event.is_approved ? <CheckCircle className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                            {event.is_approved ? t('admin.status.approved') : t('admin.status.pending')}
                          </span>
                        </td>
                        <td className="p-6">
                          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-mono font-black uppercase tracking-widest border ${
                            event.is_promoted 
                              ? 'bg-primary/5 text-primary border-primary/20' 
                              : 'bg-zinc-950 text-zinc-600 border-white/5'
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
                                  ? 'text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/20' 
                                  : 'text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/20'
                              }`}
                              title={event.is_approved ? 'Reject/Unapprove' : 'Approve Event'}
                            >
                              {event.is_approved ? <XCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                            </button>
                            <button
                              onClick={() => handlePromoteEvent(event.id, event.is_promoted)}
                              className={`p-3 rounded-xl border border-transparent transition-all ${
                                event.is_promoted 
                                  ? 'text-primary bg-primary/5 border-primary/20' 
                                  : 'text-zinc-600 hover:text-primary hover:bg-primary/5 hover:border-primary/20'
                              }`}
                              title={event.is_promoted ? 'Unpromote' : 'Promote Event'}
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
        <div className="glass-card overflow-hidden border-white/5 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-zinc-950">
                  <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.photo')}</th>
                  <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.user')}</th>
                  <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.contest')}</th>
                  <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500">{t('admin.table.status')}</th>
                  <th className="p-6 font-mono font-black text-[10px] uppercase tracking-widest text-zinc-500 text-right">{t('admin.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-6">
                      <img src={sub.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                    </td>
                    <td className="p-6 text-zinc-400 font-mono text-sm">@{sub.username}</td>
                    <td className="p-6 text-zinc-400 font-mono text-sm uppercase">{sub.contest_type}</td>
                    <td className="p-6">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${sub.approved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
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
      ) : (
        <div className="glass-card p-10 border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-[120px] opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-10 flex items-center gap-4 text-primary relative z-10">
            <Settings className="w-8 h-8" />
            {t('admin.settings.title')}
          </h2>
          
          <div className="space-y-12 relative z-10">
              <div className="space-y-6">
                <h3 className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-[0.2em] mb-6">{t('admin.settings.interface')}</h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-6 bg-zinc-950 rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-zinc-300 group-hover/label:text-white transition-colors">{t('admin.settings.fullscreen')}</span>
                      <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{t('admin.settings.fullscreenDesc')}</span>
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
                <h3 className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-[0.2em] mb-6">{t('admin.settings.registration')}</h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-6 bg-zinc-950 rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <span className="text-sm font-medium text-zinc-300 group-hover/label:text-white transition-colors">{t('admin.settings.approval')}</span>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary cursor-pointer" />
                  </label>
                  <label className="flex items-center justify-between p-6 bg-zinc-950 rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <span className="text-sm font-medium text-zinc-300 group-hover/label:text-white transition-colors">{t('admin.settings.allowRiders')}</span>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary cursor-pointer" />
                  </label>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-[10px] font-mono font-black text-zinc-600 uppercase tracking-[0.2em] mb-6">{t('admin.settings.moderation')}</h3>
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-6 bg-zinc-950 rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <span className="text-sm font-medium text-zinc-300 group-hover/label:text-white transition-colors">{t('admin.settings.autoHide')}</span>
                    <input type="checkbox" defaultChecked className="w-5 h-5 accent-primary cursor-pointer" />
                  </label>
                  <label className="flex items-center justify-between p-6 bg-zinc-950 rounded-2xl border border-white/5 hover:border-primary/20 transition-all cursor-pointer group/label">
                    <span className="text-sm font-medium text-zinc-300 group-hover/label:text-white transition-colors">{t('admin.settings.aiFilter')}</span>
                    <input type="checkbox" className="w-5 h-5 accent-primary cursor-pointer" />
                  </label>
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
      </div>
    );
  }
