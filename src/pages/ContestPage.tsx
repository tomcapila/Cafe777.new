import React, { useState, useEffect } from 'react';
import { ThumbsUp, MessageSquare, Share2 } from 'lucide-react';

export default function ContestPage() {
  const [contest, setContest] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [comments, setComments] = useState<Record<number, any[]>>({});
  const [newComment, setNewComment] = useState<string>('');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
    fetchContest();
  }, []);

  const fetchContest = async () => {
    try {
      const res = await fetch('/api/contests/current/submissions');
      if (res.ok) {
        const data = await res.json();
        setContest(data.contest);
        setSubmissions(data.submissions);
        data.submissions.forEach((sub: any) => fetchComments(sub.id));
      }
    } catch (err) {
      console.error('Failed to fetch contest:', err);
    }
  };

  const fetchComments = async (submissionId: number) => {
    try {
      const res = await fetch(`/api/submissions/${submissionId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(prev => ({ ...prev, [submissionId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  };

  const handleVote = async (submissionId: number) => {
    if (!currentUser) return alert('Please login to vote');
    try {
      const res = await fetch('/api/contests/current/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, submission_id: submissionId }),
      });
      if (res.ok) {
        fetchContest();
      } else {
        const error = await res.json();
        alert(error.error);
      }
    } catch (err) {
      console.error('Voting failed:', err);
    }
  };

  const handleAddComment = async (submissionId: number) => {
    if (!currentUser) return alert('Please login to comment');
    try {
      const res = await fetch(`/api/submissions/${submissionId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, content: newComment }),
      });
      if (res.ok) {
        setNewComment('');
        fetchComments(submissionId);
      }
    } catch (err) {
      console.error('Commenting failed:', err);
    }
  };

  const handleShare = (submissionId: number) => {
    const url = `${window.location.origin}/contest?submission=${submissionId}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');

  const getWeekNumber = (date: Date) => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };

  const handleUpload = async () => {
    if (!currentUser || !uploadFile) return;
    const formData = new FormData();
    formData.append('user_id', currentUser.id);
    formData.append('photo', uploadFile);
    formData.append('description', uploadDescription);
    try {
      const res = await fetch('/api/contests/current/submissions', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        alert('Photo uploaded! Waiting for admin approval.');
        setIsUploadModalOpen(false);
        setUploadFile(null);
        setUploadDescription('');
      } else {
        const error = await res.json();
        alert(error.error);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  if (!contest) return <div className="p-6 text-center">No active contest at the moment.</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Photo of the Week Contest - Week {getWeekNumber(new Date())}</h1>
        <button 
          onClick={() => setIsUploadModalOpen(true)}
          className="bg-primary px-4 py-2 rounded-xl font-bold text-zinc-950"
        >
          Upload Photo
        </button>
      </div>

      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
          <div className="bg-zinc-900 p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Upload Photo</h2>
            <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="mb-4 w-full" />
            <textarea 
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="Description"
              className="w-full bg-zinc-800 rounded-xl p-3 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setIsUploadModalOpen(false)} className="flex-1 bg-zinc-800 py-2 rounded-xl">Cancel</button>
              <button onClick={handleUpload} className="flex-1 bg-primary py-2 rounded-xl text-zinc-950 font-bold">Upload</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6">
        {submissions.map((sub: any) => (
          <div key={sub.id} className="bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden">
            <img src={sub.photo_url} alt="Submission" className="w-full h-64 object-cover" />
            <div className="p-4">
              <p className="font-bold">{sub.username}</p>
              <p className="text-sm text-zinc-400 mb-4">{sub.description}</p>
              <div className="flex items-center justify-between mb-4">
                <span className="text-orange-500 font-bold">{sub.vote_count} votes</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleShare(sub.id)}
                    className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl transition-colors"
                  >
                    <Share2 className="w-4 h-4" /> Share
                  </button>
                  <button 
                    onClick={() => handleVote(sub.id)}
                    className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl transition-colors"
                  >
                    <ThumbsUp className="w-4 h-4" /> Vote
                  </button>
                </div>
              </div>
              <div className="border-t border-white/10 pt-4">
                <h3 className="font-bold mb-2">Comments</h3>
                {comments[sub.id]?.map((c: any) => (
                  <div key={c.id} className="text-sm mb-2">
                    <span className="font-bold">{c.username}: </span>
                    {c.content}
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input 
                    type="text" 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-grow bg-zinc-800 rounded-xl px-3 py-2 text-sm"
                  />
                  <button onClick={() => handleAddComment(sub.id)} className="bg-orange-500 px-3 py-2 rounded-xl text-sm font-bold">Post</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
