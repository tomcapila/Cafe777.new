import React, { useState, useEffect } from 'react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      fetchNotifications(user.id);
    }
  }, []);

  const fetchNotifications = async (userId: number) => {
    try {
      const res = await fetch(`/api/notifications?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      fetchNotifications(currentUser.id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Notifications</h1>
      <div className="space-y-4">
        {notifications.map((n: any) => (
          <div key={n.id} className={`p-4 rounded-xl border ${n.is_read ? 'bg-zinc-900 border-white/5' : 'bg-zinc-800 border-orange-500/50'}`}>
            <p>{n.content}</p>
            {!n.is_read && (
              <button onClick={() => markAsRead(n.id)} className="text-xs text-orange-500 mt-2">Mark as read</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
