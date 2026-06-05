import { fetchWithAuth } from '../utils/api';

// Runs `fn` immediately and then on `intervalMs`, but pauses while the tab is
// hidden (Page Visibility API) to avoid burning server quota for idle tabs.
// Returns a cleanup function that stops the poller and removes the listener.
function createPoller(fn: () => void, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const start = () => {
    if (timer !== null) return;
    fn();
    timer = setInterval(fn, intervalMs);
  };

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  start();

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

export const createChat = async (participantIds: number[], type: 'one-on-one' | 'group', title?: string) => {
  const res = await fetchWithAuth('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIds, type, title })
  });
  if (!res.ok) throw new Error('Failed to create chat');
  const data = await res.json();
  return data.id;
};

export const sendMessage = async (chatId: number, senderId: number, text: string) => {
  const res = await fetchWithAuth(`/api/conversations/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error('Failed to send message');
  const data = await res.json();
  return data.id;
};

export const subscribeToMessages = (chatId: number, callback: (messages: any[]) => void) => {
  let isSubscribed = true;

  const fetchMessages = async () => {
    if (!isSubscribed) return;
    try {
      const res = await fetchWithAuth(`/api/conversations/${chatId}/messages`);
      if (res.ok) {
        const data = await res.json();
        if (isSubscribed) callback(data);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
        console.error('Failed to fetch messages:', err);
      }
    }
  };

  const stopPoller = createPoller(fetchMessages, 3000);

  return () => {
    isSubscribed = false;
    stopPoller();
  };
};

export const markAsRead = async (chatId: number, messageId: number, userId: number) => {
  try {
    await fetchWithAuth(`/api/conversations/${chatId}/read`, {
      method: 'POST'
    });
  } catch (err: any) {
    if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
      console.error('Failed to mark chat as read:', err);
    }
  }
};

export const findChat = async (participantIds: number[]) => {
  const res = await fetchWithAuth('/api/conversations/find', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantIds })
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to find chat');
  const data = await res.json();
  return data.id;
};

export const subscribeToUserChats = (userId: number, callback: (chats: any[]) => void) => {
  let isSubscribed = true;

  const fetchChats = async () => {
    if (!isSubscribed) return;
    try {
      const res = await fetchWithAuth('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        if (isSubscribed) callback(data);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('NetworkError') && !err.message?.includes('Failed to fetch')) {
        console.error('Failed to fetch chats:', err);
      }
    }
  };

  const stopPoller = createPoller(fetchChats, 5000);

  return () => {
    isSubscribed = false;
    stopPoller();
  };
};
