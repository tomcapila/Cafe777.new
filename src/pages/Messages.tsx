import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ArrowLeft, Search, User, Plus, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { subscribeToUserChats, findChat, createChat } from '../services/messagingService';
import { ChatWindow } from '../components/ChatWindow';
import { fetchWithAuth } from '../utils/api';

export default function Messages() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [otherUsers, setOtherUsers] = useState<Record<string, any>>({});
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  useEffect(() => {
    if (!userSearchQuery.trim()) {
      setUserSearchResults([]);
      return;
    }

    const searchUsers = async () => {
      setSearchingUsers(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(userSearchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setUserSearchResults(data.filter((u: any) => u.id !== currentUser?.id));
        }
      } catch (err) {
        console.error('Failed to search users:', err);
      } finally {
        setSearchingUsers(false);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [userSearchQuery, currentUser]);

  const handleStartChat = async (userId: number) => {
    if (!currentUser) return;
    try {
      // Check if chat already exists
      let chatId = await findChat([currentUser.id, userId]);
      
      if (!chatId) {
        // Create new chat
        chatId = await createChat([currentUser.id, userId], 'one-on-one');
      }

      // Find the chat in the current list or wait for it to appear
      const existingChat = chats.find(c => c.id === chatId);
      if (existingChat) {
        setSelectedChat(existingChat);
      } else {
        // If it's a new chat, we might need to fetch it or just set a minimal object
        // The subscription will update it shortly
        setSelectedChat({ id: chatId, type: 'one-on-one', participantIds: [currentUser.id, userId] });
        
        // Also fetch the user details so the name shows up immediately
        if (!otherUsers[userId]) {
          const res = await fetchWithAuth(`/api/users/${userId}/basic`);
          if (res.ok) {
            const data = await res.json();
            setOtherUsers(prev => ({ ...prev, [userId]: data }));
          }
        }
      }
      
      setIsNewMessageModalOpen(false);
      setUserSearchQuery('');
    } catch (err) {
      console.error('Failed to start chat:', err);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    const user = JSON.parse(storedUser);
    setCurrentUser(user);

    const unsubscribe = subscribeToUserChats(user.id, async (fetchedChats) => {
      setChats(fetchedChats);
      
      // Fetch user details for the other participants
      const usersToFetch = new Set<number>();
      fetchedChats.forEach(chat => {
        if (chat.type === 'one-on-one' && chat.participantIds) {
          const otherId = chat.participantIds.find((id: number) => id !== user.id);
          if (otherId) usersToFetch.add(otherId);
        }
      });

      const newOtherUsers = { ...otherUsers };
      for (const userId of usersToFetch) {
        if (!newOtherUsers[userId]) {
          try {
            const res = await fetchWithAuth(`/api/users/${userId}/basic`);
            if (res.ok) {
              const data = await res.json();
              newOtherUsers[userId] = data;
            }
          } catch (err: any) {
            if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
              console.error('Failed to fetch user:', err);
            }
          }
        }
      }
      setOtherUsers(newOtherUsers);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  const getChatName = (chat: any) => {
    if (chat.type === 'group') return chat.title || 'Group Chat';
    
    const otherId = chat.participantIds?.find((id: number) => id !== currentUser?.id);
    if (otherId && otherUsers[otherId]) {
      const user = otherUsers[otherId];
      return user.name || user.username;
    }
    return 'Unknown User';
  };

  const getChatAvatar = (chat: any) => {
    if (chat.type === 'group') return null; // Could add group avatar logic

    const otherId = chat.participantIds?.find((id: number) => id !== currentUser?.id);
    if (otherId && otherUsers[otherId]) {
      return otherUsers[otherId].profile_picture_url;
    }
    return null;
  };

  const filteredChats = chats.filter(chat => 
    getChatName(chat).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-asphalt pb-20">
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-steel hover:text-chrome transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-xl">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-display font-black italic uppercase text-chrome">
                Messages
              </h1>
            </div>
          </div>
          {!selectedChat && (
            <button 
              onClick={() => setIsNewMessageModalOpen(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">New Message</span>
            </button>
          )}
        </div>

        {selectedChat ? (
          <div className="bg-carbon border border-white/10 rounded-2xl overflow-hidden flex flex-col h-[70vh]">
            <div className="p-4 border-b border-white/10 flex items-center gap-4 bg-asphalt/50">
              <button 
                onClick={() => setSelectedChat(null)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-steel hover:text-chrome transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div 
                className={`flex items-center gap-3 ${selectedChat.type !== 'group' ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                onClick={() => {
                  if (selectedChat.type !== 'group') {
                    const otherId = selectedChat.participantIds?.find((id: number) => id !== currentUser?.id);
                    if (otherId && otherUsers[otherId]) {
                      navigate(`/profile/${otherUsers[otherId].username}`);
                    }
                  }
                }}
              >
                {getChatAvatar(selectedChat) ? (
                  <img 
                    src={getChatAvatar(selectedChat)} 
                    alt="Avatar" 
                    className="w-10 h-10 rounded-full object-cover border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                )}
                <h2 className="text-chrome font-bold">{getChatName(selectedChat)}</h2>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatWindow 
                chatId={selectedChat.id} 
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel" />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-carbon border border-white/10 rounded-xl py-3 pl-12 pr-4 text-chrome placeholder:text-steel focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>

            {/* Chat List */}
            {loading ? (
              <div className="text-center py-12 text-steel">Loading messages...</div>
            ) : filteredChats.length === 0 ? (
              <div className="text-center py-12 text-steel">
                {searchQuery ? 'No messages found matching your search.' : 'No messages yet.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredChats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className="w-full flex items-center gap-4 p-4 bg-carbon border border-white/10 rounded-xl hover:border-primary/50 transition-colors text-left group"
                  >
                    {getChatAvatar(chat) ? (
                      <img 
                        src={getChatAvatar(chat)} 
                        alt="Avatar" 
                        className="w-12 h-12 rounded-full object-cover border border-white/10"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <User className="w-6 h-6 text-primary" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold text-chrome truncate group-hover:text-primary transition-colors">
                          {getChatName(chat)}
                        </h3>
                        <div className="flex items-center gap-2">
                          {chat.unread_count > 0 && (
                            <span className="bg-primary text-asphalt text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {chat.unread_count}
                            </span>
                          )}
                          {chat.last_message_timestamp && (
                            <span className="text-xs text-steel shrink-0 ml-2">
                              {new Date(chat.last_message_timestamp).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className={`text-sm truncate ${chat.unread_count > 0 ? 'text-white font-medium' : 'text-steel'}`}>
                        {chat.last_message || 'No messages yet'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* New Message Modal */}
        {isNewMessageModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-carbon border border-white/10 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-asphalt/50">
                <h2 className="text-lg font-display font-black italic uppercase text-chrome">New Message</h2>
                <button 
                  onClick={() => setIsNewMessageModalOpen(false)}
                  className="p-2 text-steel hover:text-white transition-colors rounded-lg hover:bg-white/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 border-b border-white/10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-steel" />
                  <input
                    type="text"
                    placeholder="Search users by username..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full bg-asphalt border border-white/10 rounded-xl py-2 pl-10 pr-4 text-chrome placeholder:text-steel focus:outline-none focus:border-primary/50 transition-all"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {searchingUsers ? (
                  <div className="text-center py-8 text-steel">Searching...</div>
                ) : userSearchResults.length > 0 ? (
                  <div className="space-y-1">
                    {userSearchResults.map(user => (
                      <button
                        key={user.id}
                        onClick={() => handleStartChat(user.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl transition-colors text-left"
                      >
                        {user.profile_picture_url ? (
                          <img 
                            src={user.profile_picture_url} 
                            alt={user.username} 
                            className="w-10 h-10 rounded-full object-cover border border-white/10"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-chrome">{user.username}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : userSearchQuery ? (
                  <div className="text-center py-8 text-steel">No users found.</div>
                ) : (
                  <div className="text-center py-8 text-steel">Type a username to search.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
