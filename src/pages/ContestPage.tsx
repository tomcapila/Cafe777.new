import { fetchWithAuth } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { ThumbsUp, MessageSquare, Share2, Camera, X, Clock, Trophy, User, Bike, ChevronRight, Upload, Settings, Star } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';
import { Link } from 'react-router-dom';

export default function ContestPage() {
  const { t } = useLanguage();
  const [contests, setContests] = useState<any[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<number | null>(null);
  const [contest, setContest] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [comments, setComments] = useState<Record<number, any[]>>({});
  const [newComment, setNewComment] = useState<string>('');
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [motorcycles, setMotorcycles] = useState<any[]>([]);
  const [selectedMotorcycleId, setSelectedMotorcycleId] = useState<string>('');
  const { showNotification } = useNotification();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      fetchMotorcycles(user.username);
    }
    fetchActiveContests();
  }, []);

  const fetchActiveContests = async () => {
    try {
      const res = await fetchWithAuth('/api/contests/active');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setContests(data);
          if (data.length > 0) {
            setSelectedContestId(data[0].id);
          }
        } else {
          console.error('Active contests data is not an array:', data);
          setContests([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch active contests:', err);
    }
  };

  useEffect(() => {
    if (selectedContestId) {
      fetchContest(selectedContestId);
    }
  }, [selectedContestId]);

  const fetchContest = async (id: number) => {
    try {
      const res = await fetchWithAuth(`/api/contests/${id}/submissions`);
      if (res.ok) {
        const data = await res.json();
        setContest(data.contest);
        // Sort submissions by vote count
        const sortedSubmissions = data.submissions.sort((a: any, b: any) => b.vote_count - a.vote_count);
        setSubmissions(sortedSubmissions);
        data.submissions.forEach((sub: any) => fetchComments(sub.id));
      }
    } catch (err) {
      console.error('Failed to fetch contest:', err);
    }
  };

  const fetchMotorcycles = async (username: string) => {
    try {
      const res = await fetchWithAuth(`/api/profile/${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (data.garage) {
        setMotorcycles(data.garage);
      }
    } catch (err) {
      console.error('Failed to fetch motorcycles:', err);
    }
  };

  const fetchComments = async (submissionId: number) => {
    try {
      const res = await fetchWithAuth(`/api/submissions/${submissionId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(prev => ({ ...prev, [submissionId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  };

  const handleVote = async (submissionId: number) => {
    if (!currentUser) {
      showNotification('error', t('contest.loginToVote'));
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/contests/${selectedContestId}/votes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, submission_id: submissionId }),
      });
      if (res.ok) {
        showNotification('success', t('contest.voteCounted'));
        if (selectedContestId) fetchContest(selectedContestId);
      } else {
        const error = await res.json();
        showNotification('error', error.error);
      }
    } catch (err) {
      console.error('Voting failed:', err);
    }
  };

  const handleAddComment = async (submissionId: number) => {
    if (!currentUser || !newComment.trim()) return;
    try {
      const res = await fetchWithAuth(`/api/submissions/${submissionId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, content: newComment }),
      });
      if (res.ok) {
        setNewComment('');
        fetchComments(submissionId);
        showNotification('success', t('contest.commentAdded'));
      }
    } catch (err) {
      console.error('Commenting failed:', err);
    }
  };

  const handleShare = (submissionId: number) => {
    const url = `${window.location.origin}/contest?submission=${submissionId}`;
    navigator.clipboard.writeText(url);
    showNotification('success', t('common.linkCopied'));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadPreview(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!currentUser || !uploadFile) return;
    const formData = new FormData();
    formData.append('user_id', currentUser.id);
    formData.append('photo', uploadFile);
    formData.append('description', uploadDescription);
    if (selectedMotorcycleId) formData.append('motorcycle_id', selectedMotorcycleId);

    try {
      const res = await fetchWithAuth(`/api/contests/${selectedContestId}/submissions`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        showNotification('success', t('contest.uploadSuccess'));
        setIsUploadModalOpen(false);
        setUploadFile(null);
        setUploadPreview(null);
        setUploadDescription('');
        setSelectedMotorcycleId('');
        if (selectedContestId) fetchContest(selectedContestId);
      } else {
        const error = await res.json();
        showNotification('error', error.error);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  if (contests.length === 0) return (
    <div className="min-h-[calc(100dvh-5rem)] flex items-center justify-center bg-engine">
      <div className="text-center">
        <Camera className="w-16 h-16 text-steel mx-auto mb-4 opacity-20" />
        <p className="text-steel font-mono uppercase tracking-widest">{t('contest.noActive')}</p>
      </div>
    </div>
  );

  const timeLeft = contest ? formatDistanceToNow(new Date(contest.end_date), { addSuffix: true }) : '';

  return (
    <div className="min-h-[calc(100dvh-5rem)] bg-engine text-chrome font-sans pb-28">
      {/* Contest Selector */}
      {contests.length > 1 && (
        <div className="max-w-7xl mx-auto px-8 py-6 flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {contests.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedContestId(c.id)}
              className={`px-6 py-3 rounded-full font-mono text-xs uppercase tracking-widest transition-all border-2 whitespace-nowrap ${
                selectedContestId === c.id
                  ? 'bg-primary text-inverse border-primary font-black'
                  : 'bg-transparent text-steel border-steel/20 hover:border-primary hover:text-chrome'
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      {!contest ? (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {/* Hero Section */}
          <section className="relative h-[60vh] flex items-end p-8 border-b-4 border-inverse overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1558981403-c5f91cbba527?q=80&w=2070&auto=format&fit=crop" 
            alt={t('contest.bgAlt')} 
            className="w-full h-full object-cover opacity-40 grayscale"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-asphalt to-transparent" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-end gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <span className="bg-primary text-inverse font-mono font-black px-3 py-1 text-xs uppercase tracking-tighter">
                {t('contest.active')}
              </span>
              <span className="flex items-center gap-2 text-steel font-mono text-xs uppercase tracking-widest">
                <Clock className="w-4 h-4" /> {t('common.ends')} {timeLeft}
              </span>
            </div>
            <h1 className="text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.85] mb-4">
              {contest.title}
            </h1>
            <p className="text-xl text-steel max-w-xl font-medium leading-tight mb-6">
              {contest.description}
            </p>
            
            {(contest.prize_description || contest.prize_badge_name) && (
              <div className="flex items-center gap-4 p-4 bg-inverse/5 border border-inverse/10 backdrop-blur-md rounded-2xl max-w-md">
                {contest.prize_badge_icon ? (
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30 shrink-0">
                    <Star className="w-6 h-6 text-primary fill-current" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-inverse/10 flex items-center justify-center shrink-0">
                    <Trophy className="w-6 h-6 text-primary" />
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-mono font-black text-primary uppercase tracking-widest mb-0.5">
                    {t('admin.contests.prize')}
                  </p>
                  <p className="text-sm font-bold text-chrome leading-tight">
                    {contest.prize_description || contest.prize_badge_name}
                  </p>
                  {contest.prize_badge_name && contest.prize_description && (
                    <p className="text-[10px] font-mono text-steel uppercase tracking-widest mt-1">
                      + {contest.prize_badge_name} Badge
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 w-full md:w-auto">
            {currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator') && (
              <Link 
                to="/admin?tab=contests"
                className="group relative bg-inverse text-inverse font-black uppercase tracking-widest py-4 px-8 text-sm hover:bg-primary transition-all duration-300 text-center"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <Settings className="w-4 h-4" /> {t('admin.tab.contests')}
                </span>
              </Link>
            )}
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="group relative bg-primary text-white font-black uppercase tracking-widest py-6 px-12 text-xl hover:bg-inverse hover:text-primary transition-all duration-300"
            >
              <span className="relative z-10 flex items-center gap-3">
                {t('contest.submit')} <ChevronRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
              </span>
              <div className="absolute top-2 left-2 w-full h-full border-2 border-primary -z-10 group-hover:top-0 group-hover:left-0 transition-all" />
            </button>
          </div>
        </div>
      </section>

      {/* Submissions Grid */}
      <main className="max-w-7xl mx-auto p-8">
        <div className="flex items-center justify-between mb-12 border-b-2 border-inverse/10 pb-4">
          <h2 className="text-2xl font-black uppercase tracking-widest flex items-center gap-4">
            <Trophy className="text-primary w-8 h-8" /> {t('contest.leaderboard')}
          </h2>
          <div className="text-steel font-mono text-sm">
            {submissions.length} {t('contest.submissions')}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          <AnimatePresence mode="popLayout">
            {submissions.map((sub, index) => (
              <motion.div 
                key={sub.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="group relative bg-oil border-2 border-inverse hover:border-primary transition-colors cursor-pointer"
                onClick={() => setSelectedSubmission(sub)}
              >
                <div className="aspect-[4/5] overflow-hidden relative">
                  <img 
                    src={sub.photo_url} 
                    alt={t('contest.submissionAlt')} 
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 scale-105 group-hover:scale-100"
                  />
                  <div className="absolute top-4 left-4 bg-inverse text-inverse font-mono font-black px-3 py-1 text-xl">
                    #{index + 1}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-oil/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-6 flex flex-col justify-end">
                    <p className="text-primary font-black uppercase tracking-widest text-sm mb-1">{t('common.viewDetails')}</p>
                    <h3 className="text-2xl font-black uppercase tracking-tighter">{sub.username}</h3>
                  </div>
                </div>

                <div className="p-6 flex items-center justify-between border-t-2 border-inverse">
                  <div>
                    <p className="text-steel text-xs uppercase font-mono tracking-widest mb-1">{t('contest.votes')}</p>
                    <p className="text-3xl font-black text-primary">{sub.vote_count}</p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleVote(sub.id); }}
                    className="bg-inverse text-inverse p-4 hover:bg-primary transition-colors"
                  >
                    <ThumbsUp className="w-6 h-6" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>

      {/* Submission Detail Modal */}
      <AnimatePresence>
        {selectedSubmission && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-engine/95"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-oil w-full max-w-6xl h-full max-h-[90vh] flex flex-col md:flex-row border-4 border-inverse overflow-hidden"
            >
              {/* Image Side */}
              <div className="flex-1 bg-engine relative overflow-hidden group">
                <img 
                  src={selectedSubmission.photo_url} 
                  alt={t('contest.submissionDetailAlt')} 
                  className="w-full h-full object-contain"
                />
                <button 
                  onClick={() => setSelectedSubmission(null)}
                  className="absolute top-6 left-6 bg-inverse text-inverse p-3 hover:bg-primary transition-colors z-10"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Info Side */}
              <div className="w-full md:w-[400px] flex flex-col border-l-4 border-inverse bg-oil">
                <div className="p-8 border-b-2 border-inverse">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-engine rounded-full flex items-center justify-center border-2 border-inverse">
                      <User className="w-6 h-6 text-steel" />
                    </div>
                    <div>
                      <p className="text-steel font-mono text-xs uppercase tracking-widest">{t('contest.submittedBy')}</p>
                      <h3 className="text-xl font-black uppercase tracking-tighter">{selectedSubmission.username}</h3>
                    </div>
                  </div>

                  <p className="text-lg text-steel italic leading-relaxed mb-8">
                    "{selectedSubmission.description || t('contest.noDescription')}"
                  </p>

                  {selectedSubmission.moto_make && (
                    <div className="flex items-center gap-3 mb-8 p-4 bg-engine border-2 border-inverse">
                      <Bike className="w-6 h-6 text-primary" />
                      <div>
                        <p className="text-steel font-mono text-[10px] uppercase tracking-widest">{t('contest.taggedRide')}</p>
                        <p className="font-bold">{selectedSubmission.moto_year} {selectedSubmission.moto_make} {selectedSubmission.moto_model}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-engine p-4 border-2 border-inverse">
                      <p className="text-steel font-mono text-[10px] uppercase tracking-widest mb-1">{t('contest.votes')}</p>
                      <p className="text-2xl font-black text-primary">{selectedSubmission.vote_count}</p>
                    </div>
                    <button 
                      onClick={() => handleVote(selectedSubmission.id)}
                      className="bg-primary text-white font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-inverse hover:text-primary transition-colors border-2 border-inverse"
                    >
                      <ThumbsUp className="w-5 h-5" /> {t('contest.vote')}
                    </button>
                  </div>
                </div>

                {/* Comments Section */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-8 pb-4">
                    <h4 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> {t('contest.comments')}
                    </h4>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-8 pt-0 space-y-6">
                    {comments[selectedSubmission.id]?.length === 0 ? (
                      <p className="text-steel font-mono text-xs uppercase italic">{t('review.noFound')}</p>
                    ) : (
                      comments[selectedSubmission.id]?.map((comment) => (
                        <div key={comment.id} className="border-l-2 border-primary pl-4">
                          <p className="text-xs font-black uppercase tracking-widest text-primary mb-1">{comment.username}</p>
                          <p className="text-sm text-steel">{comment.content}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="p-8 border-t-4 border-inverse bg-engine">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newComment || ''}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={t('contest.addComment')}
                        className="flex-1 bg-oil border-2 border-inverse p-3 text-sm focus:border-primary outline-none"
                      />
                      <button 
                        onClick={() => handleAddComment(selectedSubmission.id)}
                        className="bg-primary text-white font-black uppercase px-6 hover:bg-inverse hover:text-primary transition-colors border-2 border-inverse"
                      >
                        {t('common.post')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-engine/90"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-oil w-full max-w-xl border-4 border-inverse overflow-hidden"
            >
              <div className="p-8 border-b-4 border-inverse flex justify-between items-center">
                <h2 className="text-3xl font-black uppercase tracking-tighter">{t('contest.submit')}</h2>
                <button onClick={() => setIsUploadModalOpen(false)} className="text-steel hover:text-chrome">
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="p-8 space-y-8">
                {/* Photo Upload Area */}
                <div 
                  onClick={() => document.getElementById('photo-input')?.click()}
                  className="group relative aspect-video bg-engine border-4 border-dashed border-inverse hover:border-primary transition-colors cursor-pointer flex flex-col items-center justify-center overflow-hidden"
                >
                  {uploadPreview ? (
                    <img src={uploadPreview} alt={t('contest.previewAlt')} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-8">
                      <Upload className="w-12 h-12 text-steel mx-auto mb-4 group-hover:text-primary transition-colors" />
                      <p className="font-mono text-xs uppercase tracking-widest text-steel group-hover:text-chrome transition-colors">
                        {t('contest.clickToUpload')}
                      </p>
                    </div>
                  )}
                  <input 
                    id="photo-input"
                    type="file" 
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden" 
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-widest text-steel mb-2">{t('profile.description')}</label>
                    <textarea 
                      value={uploadDescription || ''}
                      onChange={(e) => setUploadDescription(e.target.value)}
                      placeholder={t('contest.tellUs')}
                      className="w-full bg-engine border-2 border-inverse p-4 text-chrome focus:border-primary outline-none min-h-[100px]"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-widest text-steel mb-2">{t('contest.taggedRide')}</label>
                    <select 
                      value={selectedMotorcycleId || ''}
                      onChange={(e) => setSelectedMotorcycleId(e.target.value)}
                      className="w-full bg-engine border-2 border-inverse p-4 text-chrome focus:border-primary outline-none appearance-none"
                    >
                      <option value="">{t('common.none')}</option>
                      {motorcycles.map(moto => (
                        <option key={moto.id} value={moto.id}>{moto.make} {moto.model} ({moto.year})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setIsUploadModalOpen(false)}
                    className="flex-1 bg-engine text-chrome font-black uppercase tracking-widest py-4 border-2 border-inverse hover:bg-inverse hover:text-primary transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button 
                    onClick={handleUpload}
                    disabled={!uploadFile}
                    className="flex-1 bg-primary text-white font-black uppercase tracking-widest py-4 border-2 border-inverse hover:bg-inverse hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('contest.submit')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );
}
