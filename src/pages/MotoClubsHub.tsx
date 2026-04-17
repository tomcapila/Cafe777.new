import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Users, Shield, MapPin, Settings, Plus, Edit2, Trash2, ChevronRight, UserPlus, Calendar, Search, Check, X, Loader2, MessageSquare, Crown, GripVertical } from 'lucide-react';
import { fetchWithAuth } from '../utils/api';
import { Link, useNavigate } from 'react-router-dom';
import { ChatWindow } from '../components/ChatWindow';
import { createChat } from '../services/messagingService';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { useNotification } from '../contexts/NotificationContext';
import { useLanguage } from '../contexts/LanguageContext';
import PremiumBadge from '../components/PremiumBadge';

export default function MotoClubsHub() {
  const [loading, setLoading] = useState(true);
  const [ownedClubs, setOwnedClubs] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [allClubs, setAllClubs] = useState<any[]>([]);
  const [ambassadorStatus, setAmbassadorStatus] = useState<string | null>(null);
  const [isAmbassador, setIsAmbassador] = useState(false);
  const [isCreatingClub, setIsCreatingClub] = useState(false);
  const [newClubData, setNewClubData] = useState({ name: '', description: '', chapter_label: 'Chapter' });
  const [activeTab, setActiveTab] = useState<'discover' | 'my_clubs'>('discover');
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);
  const [chatTitle, setChatTitle] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const navigate = useNavigate();
  const { canAccess } = useFeatureAccess();
  const { showNotification } = useNotification();
  const { t } = useLanguage();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  const handleChat = async (clubId: number, clubName: string) => {
    if (!currentUser) return;
    // For simplicity, create a new group chat for the club
    const newChatId = await createChat([currentUser.id], 'group', clubName);
    setChatId(newChatId);
    setChatTitle(clubName);
    setIsChatOpen(true);
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [myRes, allRes, ambassadorRes, appStatusRes] = await Promise.all([
        fetchWithAuth('/api/clubs/my'),
        fetchWithAuth('/api/clubs'),
        currentUser ? fetchWithAuth(`/api/ambassadors/${currentUser.id}`) : Promise.resolve(null),
        currentUser ? fetchWithAuth(`/api/ambassadors/${currentUser.id}/application-status`) : Promise.resolve(null)
      ]);
      
      if (myRes.ok && allRes.ok) {
        const myData = await myRes.json();
        const allData = await allRes.json();
        setOwnedClubs(myData.ownedClubs);
        setMemberships(myData.memberships);
        setAllClubs(allData);
        
        if (ambassadorRes && ambassadorRes.ok) {
          const ambData = await ambassadorRes.json();
          setIsAmbassador(!!ambData);
        }
        
        if (appStatusRes && appStatusRes.ok) {
          const statusData = await appStatusRes.json();
          setAmbassadorStatus(statusData.status);
        }

        if (myData.ownedClubs.length > 0) {
          setSelectedClubId(myData.ownedClubs[0].club_id);
          setActiveTab('my_clubs');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (clubId: number) => {
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to apply');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeaveClub = async (clubId: number, membershipId?: number) => {
    if (!membershipId) return;
    if (!confirm('Are you sure you want to leave this club?')) return;
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/members/${membershipId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setSelectedClubId(null);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateClubClick = () => {
    if (!canAccess('create_club', currentUser?.plan, currentUser?.role)) {
      showNotification('error', t('admin.featureAccess.allowedPlan'));
      return;
    }
    setIsCreatingClub(true);
  };

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth('/api/clubs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClubData)
      });
      if (res.ok) {
        showNotification('success', 'MotoClub created successfully!');
        setIsCreatingClub(false);
        setNewClubData({ name: '', description: '', chapter_label: 'Chapter' });
        fetchData();
      } else {
        const data = await res.json();
        showNotification('error', data.error || 'Failed to create MotoClub');
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'An error occurred while creating the MotoClub');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const renderDiscover = () => {
    const isEcosystem = currentUser?.type === 'ecosystem';
    
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-display font-black uppercase italic tracking-tight text-chrome mb-6">Discover MotoClubs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allClubs.map(club => {
            const isMember = memberships.some(m => m.club_id === club.club_id);
            const membership = memberships.find(m => m.club_id === club.club_id);
            
  const isEcosystem = currentUser?.type === 'ecosystem' && currentUser?.service_category === 'club';
  const isOwner = ownedClubs.some(c => c.club_id === club.club_id);
  
  return (
    <div key={club.club_id} className="glass-card p-6 flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden border border-inverse/10 bg-oil shrink-0">
          {club.logo_url ? (
            <img src={club.logo_url} alt={club.name} className="w-full h-full object-cover" />
          ) : (
            <Shield className="w-8 h-8 text-steel m-4" />
          )}
        </div>
        <div>
          <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-chrome flex items-center gap-1.5">
            {club.name}
            {club.plan === 'premium' && <PremiumBadge size={12} />}
          </h3>
          <div className="text-[10px] font-mono text-steel uppercase tracking-widest">
            {club.member_count || 0} Members
          </div>
        </div>
      </div>
      <p className="text-sm text-steel font-light mb-6 flex-1 line-clamp-3">{club.description}</p>
      
      {isMember ? (
        <div className="text-center py-2 px-4 rounded-xl text-xs font-mono uppercase tracking-widest border border-inverse/5 bg-engine/50 text-steel">
          Status: <span className={membership.status === 'approved' ? 'text-primary' : 'text-accent'}>{membership.status}</span>
        </div>
      ) : isOwner ? (
        <div className="text-center py-2 px-4 rounded-xl text-[10px] font-mono uppercase tracking-widest border border-inverse/5 bg-primary/10 text-primary">
          You are the Owner
        </div>
      ) : !isEcosystem ? (
        <button 
          onClick={() => handleApply(club.club_id)}
          className="w-full btn-primary py-2 text-xs"
        >
          Apply to Join
        </button>
      ) : (
        <div className="text-center py-2 px-4 rounded-xl text-[10px] font-mono uppercase tracking-widest border border-inverse/5 bg-engine/50 text-steel/50">
          Clubs cannot join other clubs
        </div>
      )}
    </div>
  );
          })}
          {allClubs.length === 0 && (
            <div className="col-span-full text-center py-12 text-steel font-light">
              No MotoClubs found on the platform yet.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10">
            <h1 className="text-4xl sm:text-5xl font-display font-black uppercase italic tracking-tighter text-chrome mb-2">
              Moto <span className="text-primary">Clubs</span> Hub
            </h1>
            <p className="text-steel font-light text-lg">Discover clubs, manage your memberships, and connect with riders.</p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
            <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
              <button
                onClick={() => { setActiveTab('discover'); setSelectedClubId(null); }}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-mono font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${
                  activeTab === 'discover' 
                    ? 'bg-primary text-inverse shadow-lg shadow-primary/20' 
                    : 'bg-oil/50 text-steel hover:text-chrome border border-inverse/5'
                }`}
              >
                <Search className="w-4 h-4" />
                Discover
              </button>
              {(ownedClubs.length > 0 || memberships.length > 0) && (
                <button
                  onClick={() => { setActiveTab('my_clubs'); if(ownedClubs.length > 0) setSelectedClubId(ownedClubs[0].club_id); }}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-mono font-black text-[10px] uppercase tracking-widest whitespace-nowrap transition-all ${
                    activeTab === 'my_clubs' 
                      ? 'bg-primary text-inverse shadow-lg shadow-primary/20' 
                      : 'bg-oil/50 text-steel hover:text-chrome border border-inverse/5'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  My Clubs
                </button>
              )}
            </div>

            {isAmbassador && (
              <button
                onClick={handleCreateClubClick}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-inverse/5 hover:bg-inverse/10 text-chrome border border-inverse/10 transition-all font-mono font-black text-[10px] uppercase tracking-widest"
              >
                <Crown className="w-4 h-4 text-primary" />
                Create MotoClub
              </button>
            )}
          </div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'discover' && renderDiscover()}
            {activeTab === 'my_clubs' && (
              <div className="flex flex-col md:flex-row gap-8">
                <div className="w-full md:w-64 shrink-0 space-y-6">
                  {ownedClubs.length > 0 && (
                    <div>
                      <h3 className="text-xs font-mono uppercase tracking-widest text-steel mb-3">Managed by You</h3>
                      <div className="space-y-2">
                        {ownedClubs.map(club => (
                          <button
                            key={`owned-${club.club_id}`}
                            onClick={() => setSelectedClubId(club.club_id)}
                            className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                              selectedClubId === club.club_id 
                                ? 'bg-primary/10 border border-primary/30 text-chrome' 
                                : 'bg-engine/30 border border-inverse/5 text-steel hover:text-chrome hover:border-inverse/20'
                            }`}
                          >
                            <div className="font-bold truncate flex items-center gap-1.5">
                              {club.name}
                              {club.plan === 'premium' && <PremiumBadge size={10} />}
                            </div>
                            <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">Owner</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {memberships.length > 0 && (
                    <div>
                      <h3 className="text-xs font-mono uppercase tracking-widest text-steel mb-3">Your Memberships</h3>
                      <div className="space-y-2">
                        {memberships.map(m => (
                          <button
                            key={`member-${m.club_id}`}
                            onClick={() => setSelectedClubId(m.club_id)}
                            className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                              selectedClubId === m.club_id 
                                ? 'bg-inverse/10 border border-inverse/30 text-chrome' 
                                : 'bg-engine/30 border border-inverse/5 text-steel hover:text-chrome hover:border-inverse/20'
                            }`}
                          >
                            <div className="font-bold truncate flex items-center gap-1.5">
                              {m.name}
                              {m.plan === 'premium' && <PremiumBadge size={10} />}
                            </div>
                            <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">Status: {m.status}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex-1">
                  {selectedClubId ? (
                    <ClubManager 
                      clubId={selectedClubId} 
                      isOwner={ownedClubs.some(c => c.club_id === selectedClubId) || currentUser?.role === 'admin'} 
                      membershipId={memberships.find(m => m.club_id === selectedClubId)?.id}
                      onLeave={() => handleLeaveClub(selectedClubId, memberships.find(m => m.club_id === selectedClubId)?.id)}
                      onChat={(name: string) => handleChat(selectedClubId, name)}
                    />
                  ) : (
                    <div className="glass-card p-12 text-center text-steel">
                      Select a club to view details.
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Create Club Modal */}
      <AnimatePresence>
        {isCreatingClub && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-engine/80 backdrop-blur-sm"
              onClick={() => setIsCreatingClub(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-oil border border-inverse/10 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-inverse/5 flex items-center justify-between">
                <h2 className="text-2xl font-display font-black uppercase italic tracking-tight text-chrome">Create MotoClub</h2>
                <button onClick={() => setIsCreatingClub(false)} className="text-steel hover:text-chrome transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleCreateClub} className="p-6 space-y-6">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Club Name</label>
                  <input
                    type="text"
                    required
                    autoCapitalize="sentences"
                    value={newClubData.name}
                    onChange={e => setNewClubData({ ...newClubData, name: e.target.value })}
                    className="w-full bg-engine/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary transition-colors"
                    placeholder="e.g. Iron Riders MC"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Description</label>
                  <textarea
                    required
                    autoCapitalize="sentences"
                    value={newClubData.description}
                    onChange={e => setNewClubData({ ...newClubData, description: e.target.value })}
                    className="w-full bg-engine/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary transition-colors h-32 resize-none"
                    placeholder="Tell us about your club..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Chapter Label</label>
                  <input
                    type="text"
                    required
                    autoCapitalize="sentences"
                    value={newClubData.chapter_label}
                    onChange={e => setNewClubData({ ...newClubData, chapter_label: e.target.value })}
                    className="w-full bg-engine/50 border border-inverse/10 rounded-xl px-4 py-3 text-chrome focus:outline-none focus:border-primary transition-colors"
                    placeholder="e.g. Chapter, Wing, Division"
                  />
                </div>
                <button type="submit" className="w-full btn-primary py-4 font-display font-black uppercase italic tracking-widest">
                  Create MotoClub
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isChatOpen && chatId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-engine/50 backdrop-blur-sm p-4">
          <div className="bg-oil border border-inverse/10 rounded-2xl w-full max-w-md h-[500px] flex flex-col">
            <div className="p-4 border-b border-inverse/10 flex justify-between items-center">
              <h3 className="text-chrome font-bold">{chatTitle}</h3>
              <button onClick={() => setIsChatOpen(false)} className="text-steel hover:text-chrome">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ChatWindow chatId={chatId} />
          </div>
        </div>
      )}
    </div>
  );
}

function ClubManager({ clubId, isOwner, membershipId, onLeave, onChat }: { clubId: number, isOwner: boolean, membershipId?: number, onLeave?: () => void, onChat: (name: string) => void }) {
  const { t } = useLanguage();
  const { showNotification } = useNotification();
  const [clubData, setClubData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'roles' | 'chapters' | 'settings'>('overview');
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchClubData = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/clubs/${clubId}`);
      if (res.ok) {
        const data = await res.json();
        setClubData(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClubData();
  }, [clubId]);

  const handleMemberStatus = async (membershipId: number, status: string) => {
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/members/${membershipId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) fetchClubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignRole = async (membershipId: number, roleId: number | null) => {
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/members/${membershipId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: roleId })
      });
      if (res.ok) fetchClubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignChapter = async (membershipId: number, chapterId: number | null) => {
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/members/${membershipId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId })
      });
      if (res.ok) fetchClubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearchUsers = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetchWithAuth(`/api/users/search?q=${q}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddMember = async (userId: number) => {
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      if (res.ok) {
        showNotification('success', 'Member added successfully');
        setShowAddMember(false);
        setSearchQuery('');
        setSearchResults([]);
        fetchClubData();
      } else {
        const data = await res.json();
        showNotification('error', data.error || 'Failed to add member');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !clubData) return <div className="py-12 text-center text-steel"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;

  const { club, members, roles, chapters } = clubData;
  const pendingMembers = members.filter((m: any) => m.status === 'pending');
  const approvedMembers = members.filter((m: any) => m.status === 'approved');

  return (
    <div className="space-y-8">
      <div className="glass-card p-6 sm:p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl overflow-hidden border border-inverse/10 shadow-2xl shrink-0 bg-oil">
            {club.logo_url && <img src={club.logo_url} alt={club.name} className="w-full h-full object-cover" />}
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-3xl sm:text-4xl font-display font-black uppercase italic tracking-tight text-chrome flex items-center gap-2">
                {club.name}
                {club.plan === 'premium' && <PremiumBadge size={20} />}
              </h2>
              <button onClick={() => onChat(club.name)} className="btn-secondary py-2 px-4 text-xs flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Chat
              </button>
            </div>
            <p className="text-steel mb-6 font-light text-lg max-w-2xl">{club.description}</p>
            <div className="flex flex-wrap gap-6 text-[10px] font-mono text-steel uppercase tracking-widest">
              <span className="flex items-center gap-2 bg-engine/50 px-3 py-1.5 rounded-full border border-inverse/5">
                <Users className="w-4 h-4 text-primary" /> {approvedMembers.length} {t('club.mgmt.members')}
              </span>
              <span className="flex items-center gap-2 bg-engine/50 px-3 py-1.5 rounded-full border border-inverse/5">
                <MapPin className="w-4 h-4 text-primary" /> {chapters.length} {club.chapter_label || t('club.mgmt.chapters')}
              </span>
            </div>
            {!isOwner && membershipId && onLeave && (
              <button 
                onClick={onLeave}
                className="mt-6 btn-secondary py-2 px-4 text-xs text-error hover:text-error border-error/20 hover:border-error/50"
              >
                {t('club.mgmt.leaveClub')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
        {['overview', 'members', 'roles', 'chapters', 'settings'].map(tab => {
          if (!isOwner && (tab === 'roles' || tab === 'chapters' || tab === 'settings')) return null;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest transition-all ${
                activeTab === tab ? 'bg-inverse/10 text-chrome' : 'text-steel hover:text-chrome hover:bg-inverse/5'
              }`}
            >
              {tab === 'chapters' ? (club.chapter_label || t('club.mgmt.chapters')) : t(`club.mgmt.${tab}`)}
              {tab === 'members' && pendingMembers.length > 0 && isOwner && (
                <span className="ml-2 bg-primary text-inverse px-1.5 py-0.5 rounded-full text-[8px]">{pendingMembers.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isOwner && (
            <div className="glass-card p-6">
              <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-chrome mb-4">{t('club.mgmt.pendingApps')}</h3>
              {pendingMembers.length === 0 ? (
                <p className="text-steel font-light text-sm">{t('club.mgmt.noPending')}</p>
              ) : (
                <div className="space-y-4">
                  {pendingMembers.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between bg-engine/30 p-4 rounded-xl border border-inverse/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-oil">
                          {m.avatar_url && <img src={m.avatar_url} className="w-full h-full object-cover" />}
                        </div>
                        <div>
                          <div className="font-bold text-chrome flex items-center gap-1.5">
                            {m.rider_name || m.username}
                            {m.plan === 'premium' && <PremiumBadge size={10} />}
                          </div>
                          <div className="text-[10px] font-mono text-steel">@{m.username}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleMemberStatus(m.id, 'approved')} className="p-2 bg-primary/20 text-primary rounded-lg hover:bg-primary hover:text-inverse transition-colors" title={t('common.approve')}><Check className="w-4 h-4" /></button>
                        <button onClick={() => handleMemberStatus(m.id, 'rejected')} className="p-2 bg-error/20 text-error rounded-lg hover:bg-error hover:text-chrome transition-colors" title={t('common.reject')}><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className={`glass-card p-6 ${!isOwner ? 'md:col-span-2' : ''}`}>
            <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-chrome mb-4">{t('club.mgmt.recentMembers')}</h3>
            <div className="space-y-4">
              {approvedMembers.slice(0, 5).map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 bg-engine/30 p-4 rounded-xl border border-inverse/5">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-oil">
                    {m.avatar_url && <img src={m.avatar_url} className="w-full h-full object-cover" />}
                  </div>
                  <div>
                    <div className="font-bold text-chrome flex items-center gap-1.5">
                      {m.rider_name || m.username}
                      {m.plan === 'premium' && <PremiumBadge size={10} />}
                    </div>
                    <div className="text-[10px] font-mono text-steel">
                      {roles.find((r: any) => r.id === m.role_id)?.name || t('club.mgmt.noRole')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'members' && (
        <div className="space-y-6">
          {isOwner && pendingMembers.length > 0 && (
            <div className="glass-card p-6 border-primary/20 bg-primary/5">
              <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-primary mb-6">{t('club.mgmt.pendingApps')}</h3>
              <div className="space-y-4">
                {pendingMembers.map((m: any) => (
                  <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-engine/30 p-4 rounded-xl border border-inverse/5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-oil">
                        {m.avatar_url && <img src={m.avatar_url} className="w-full h-full object-cover" />}
                      </div>
                      <div>
                        <div className="font-bold text-chrome flex items-center gap-1.5">
                          {m.rider_name || m.username}
                          {m.plan === 'premium' && <PremiumBadge size={10} />}
                        </div>
                        <div className="text-[10px] font-mono text-steel">@{m.username}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleMemberStatus(m.id, 'approved')} className="btn-primary py-2 px-4 text-[10px] flex items-center gap-2">
                        <Check className="w-3 h-3" /> {t('common.approve')}
                      </button>
                      <button onClick={() => handleMemberStatus(m.id, 'rejected')} className="btn-secondary py-2 px-4 text-[10px] flex items-center gap-2 border-error/20 text-error">
                        <X className="w-3 h-3" /> {t('common.reject')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-chrome">{t('club.mgmt.members')}</h3>
              {isOwner && (
                <button 
                  onClick={() => setShowAddMember(true)}
                  className="btn-primary py-2 px-4 text-[10px] flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" /> Add Member
                </button>
              )}
            </div>
            <div className="space-y-4">
              {approvedMembers.map((m: any) => (
              <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-engine/30 p-4 rounded-xl border border-inverse/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-oil">
                    {m.avatar_url && <img src={m.avatar_url} className="w-full h-full object-cover" />}
                  </div>
                  <div>
                    <div className="font-bold text-chrome flex items-center gap-1.5">
                      {m.rider_name || m.username}
                      {m.plan === 'premium' && <PremiumBadge size={10} />}
                    </div>
                    <div className="text-[10px] font-mono text-steel">@{m.username}</div>
                  </div>
                </div>
                {isOwner ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-mono uppercase tracking-widest text-steel ml-1">{t('club.mgmt.assignRole')}</label>
                      <select 
                        className="input-field py-2 text-xs w-32 sm:w-40"
                        value={m.role_id || ''}
                        onChange={(e) => handleAssignRole(m.id, e.target.value ? parseInt(e.target.value) : null)}
                      >
                        <option value="">{t('club.mgmt.noRole')}</option>
                        {roles.map((r: any) => (
                          <option key={r.id} value={r.id || ''}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-mono uppercase tracking-widest text-steel ml-1">{club.chapter_label || t('club.mgmt.chapters')}</label>
                      <select 
                        className="input-field py-2 text-xs w-32 sm:w-40"
                        value={m.chapter_id || ''}
                        onChange={(e) => handleAssignChapter(m.id, e.target.value ? parseInt(e.target.value) : null)}
                      >
                        <option value="">No {club.chapter_label || 'Chapter'}</option>
                        {chapters.map((c: any) => (
                          <option key={c.id} value={c.id || ''}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <button onClick={() => handleMemberStatus(m.id, 'banned')} className="text-error hover:text-error p-2 self-end mb-1" title={t('common.delete')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-[10px] font-mono text-steel uppercase tracking-widest bg-inverse/5 px-3 py-1 rounded-full border border-inverse/5">
                      {roles.find((r: any) => r.id === m.role_id)?.name || t('club.mgmt.noRole')}
                    </div>
                    {m.chapter_id && (
                      <div className="text-[8px] font-mono text-primary uppercase tracking-widest">
                        {chapters.find((c: any) => c.id === m.chapter_id)?.name}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {activeTab === 'roles' && (
        <RoleManager clubId={clubId} roles={roles} onUpdate={fetchClubData} />
      )}

      {activeTab === 'chapters' && (
        <ChapterManager clubId={clubId} chapters={chapters} onUpdate={fetchClubData} chapterLabel={club.chapter_label} />
      )}

      {activeTab === 'settings' && isOwner && (
        <ClubSettings club={club} onUpdate={fetchClubData} />
      )}

      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-engine/50 backdrop-blur-sm p-4">
          <div className="bg-oil border border-inverse/10 rounded-3xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-chrome">Add Member</h3>
              <button onClick={() => setShowAddMember(false)} className="text-steel hover:text-chrome">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-steel" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchUsers(e.target.value)}
                placeholder="Search by username..."
                className="w-full bg-engine border border-inverse/10 rounded-xl pl-10 pr-4 py-3 text-chrome focus:outline-none focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {isSearching ? (
                <div className="text-center py-4"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
              ) : searchResults.length > 0 ? (
                searchResults.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 bg-inverse/5 rounded-xl border border-inverse/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-oil">
                        {u.profile_picture_url && <img src={u.profile_picture_url} className="w-full h-full object-cover" />}
                      </div>
                      <span className="text-chrome font-bold text-sm">@{u.username}</span>
                    </div>
                    <button 
                      onClick={() => handleAddMember(u.id)}
                      className="p-2 bg-primary/20 text-primary rounded-lg hover:bg-primary hover:text-inverse transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : searchQuery.length >= 2 ? (
                <p className="text-center py-4 text-steel text-sm">No users found</p>
              ) : (
                <p className="text-center py-4 text-steel text-sm italic">Type at least 2 characters to search</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClubSettings({ club, onUpdate }: { club: any, onUpdate: () => void }) {
  const [formData, setFormData] = useState({
    name: club.name || '',
    description: club.description || '',
    chapter_label: club.chapter_label || 'Chapter'
  });
  const [saving, setSaving] = useState(false);
  const { t } = useLanguage();
  const { showNotification } = useNotification();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetchWithAuth(`/api/clubs/${club.club_id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        showNotification('success', 'Club settings updated successfully');
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-6">
      <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-chrome mb-6">{t('club.mgmt.settings')}</h3>
      <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Club Name</label>
            <input 
              type="text" 
              required 
              autoCapitalize="sentences"
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              className="input-field" 
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Description</label>
            <textarea 
              required 
              autoCapitalize="sentences"
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
              className="input-field min-h-[100px]" 
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">Chapter Label (e.g. Chapter, Party, Faction)</label>
            <input 
              type="text" 
              required 
              autoCapitalize="sentences"
              value={formData.chapter_label} 
              onChange={e => setFormData({...formData, chapter_label: e.target.value})} 
              className="input-field" 
            />
          </div>
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary py-2 px-8 text-xs">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RoleManager({ clubId, roles, onUpdate }: { clubId: number, roles: any[], onUpdate: () => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [localRoles, setLocalRoles] = useState(roles);

  const { t } = useLanguage();

  useEffect(() => {
    setLocalRoles(roles);
  }, [roles]);

  const handleReorder = async (newOrder: any[]) => {
    setLocalRoles(newOrder);
    try {
      const rolesToUpdate = newOrder.map((role, index) => ({
        id: role.id,
        hierarchy_order: index
      }));
      await fetchWithAuth(`/api/clubs/${clubId}/roles/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: rolesToUpdate })
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to reorder roles', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setFormData({ name: '', description: '' });
        setIsAdding(false);
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (roleId: number) => {
    if (!confirm(t('club.mgmt.deleteRoleConfirm'))) return;
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/roles/${roleId}`, {
        method: 'DELETE'
      });
      if (res.ok) onUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-chrome">{t('club.mgmt.roles')}</h3>
        <button onClick={() => setIsAdding(!isAdding)} className="btn-primary py-2 px-4 text-xs flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('club.mgmt.newRole')}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="glass-card p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">{t('club.mgmt.roleName')}</label>
            <input type="text" required autoCapitalize="sentences" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="input-field" placeholder="e.g. Road Captain" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">{t('club.mgmt.roleDesc')}</label>
            <input type="text" autoCapitalize="sentences" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="input-field" placeholder="Role responsibilities" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsAdding(false)} className="btn-secondary py-2 px-4 text-xs">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary py-2 px-4 text-xs">{t('club.mgmt.saveRole')}</button>
          </div>
        </form>
      )}

      <Reorder.Group axis="y" values={localRoles} onReorder={handleReorder} className="space-y-4">
        {localRoles.map(role => (
          <Reorder.Item 
            key={role.id} 
            value={role}
            className="glass-card p-4 flex items-center gap-4 cursor-grab active:cursor-grabbing"
          >
            <div className="text-steel">
              <GripVertical className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-1">
                <h4 className="text-lg font-bold text-chrome">{role.name}</h4>
                <button onClick={() => handleDelete(role.id)} className="text-steel hover:text-error transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-steel font-light">{role.description}</p>
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {localRoles.length === 0 && !isAdding && (
        <div className="text-center py-8 text-steel font-light">
          No roles defined yet. Create roles to assign to your members.
        </div>
      )}
    </div>
  );
}

function ChapterManager({ clubId, chapters, onUpdate, chapterLabel }: { clubId: number, chapters: any[], onUpdate: () => void, chapterLabel?: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', city: '', country: '', description: '' });
  const { t } = useLanguage();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setFormData({ name: '', city: '', country: '', description: '' });
        setIsAdding(false);
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (chapterId: number) => {
    if (!confirm(t('club.mgmt.deleteChapterConfirm'))) return;
    try {
      const res = await fetchWithAuth(`/api/clubs/${clubId}/chapters/${chapterId}`, {
        method: 'DELETE'
      });
      if (res.ok) onUpdate();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-display font-black uppercase italic tracking-tight text-chrome">{chapterLabel || t('club.mgmt.chapters')}</h3>
        <button onClick={() => setIsAdding(!isAdding)} className="btn-primary py-2 px-4 text-xs flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('club.mgmt.newChapter')}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="glass-card p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">{chapterLabel ? `${chapterLabel} Name` : t('club.mgmt.chapterName')}</label>
              <input type="text" required autoCapitalize="sentences" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="input-field" placeholder={`e.g. Central ${chapterLabel || 'Chapter'}`} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">{t('club.mgmt.city')}</label>
              <LocationAutocomplete 
                value={formData.city || ''} 
                onChange={val => setFormData({...formData, city: val})} 
                placeholder="Search city/location..."
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">{t('club.mgmt.country')}</label>
              <input type="text" autoCapitalize="sentences" value={formData.country || ''} onChange={e => setFormData({...formData, country: e.target.value})} className="input-field" placeholder="Country" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-steel mb-2">{chapterLabel ? `${chapterLabel} Details` : t('club.mgmt.roleDesc')}</label>
            <input type="text" autoCapitalize="sentences" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="input-field" placeholder={`${chapterLabel || 'Chapter'} details`} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsAdding(false)} className="btn-secondary py-2 px-4 text-xs">{t('common.cancel')}</button>
            <button type="submit" className="btn-primary py-2 px-4 text-xs">{chapterLabel ? `Save ${chapterLabel}` : t('club.mgmt.saveChapter')}</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {chapters.map(chapter => (
          <div key={chapter.id} className="glass-card p-6 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-chrome">{chapter.name}</h4>
                  <div className="text-[10px] font-mono text-steel uppercase tracking-widest">{chapter.city}, {chapter.country}</div>
                </div>
              </div>
              <button onClick={() => handleDelete(chapter.id)} className="text-steel hover:text-error transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-steel font-light">{chapter.description}</p>
          </div>
        ))}
        {chapters.length === 0 && !isAdding && (
          <div className="col-span-full text-center py-8 text-steel font-light">
            No {chapterLabel?.toLowerCase() || 'chapters'} defined yet.
          </div>
        )}
      </div>
    </div>
  );
}
