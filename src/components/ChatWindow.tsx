import React, { useState, useEffect, useRef } from 'react';
import { Send, User } from 'lucide-react';
import { subscribeToMessages, sendMessage, markAsRead } from '../services/messagingService';

interface ChatWindowProps {
  chatId: number;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chatId }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToMessages(chatId, (msgs) => {
      setMessages(msgs);
      // Mark new messages as read
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        markAsRead(chatId, lastMsg.id, currentUser.id);
      }
    });
    return () => unsubscribe();
  }, [chatId, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser) return;
    await sendMessage(chatId, currentUser.id, newMessage);
    setNewMessage('');
  };

  return (
    <div className="flex flex-col h-full bg-engine rounded-2xl border border-inverse/5 shadow-2xl">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] p-3 rounded-2xl ${msg.sender_id === currentUser?.id ? 'bg-primary text-inverse' : 'bg-oil text-chrome'}`}>
              <p className="text-sm">{msg.text}</p>
              <span className="text-[10px] opacity-50 block mt-1">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSend} className="p-4 border-t border-inverse/5 flex gap-2">
        <input
          type="text"
          value={newMessage}
          autoCapitalize="sentences"
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="input-field flex-1"
        />
        <button type="submit" className="btn-primary p-3">
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};
