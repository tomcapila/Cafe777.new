import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, AlertCircle, X } from 'lucide-react';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
}

interface NotificationContextType {
  showNotification: (type: NotificationType, message: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = useCallback((type: NotificationType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-4 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95, transition: { duration: 0.2 } }}
              layout
              className="pointer-events-auto"
            >
              <div className={`
                flex items-center gap-4 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl w-[calc(100vw-2rem)] sm:w-auto sm:min-w-[320px] max-w-md
                ${n.type === 'success' ? 'bg-success/10 border-success/20 text-success' : ''}
                ${n.type === 'error' ? 'bg-primary/10 border-primary/20 text-primary' : ''}
                ${n.type === 'info' ? 'bg-info/10 border-info/20 text-info' : ''}
                ${n.type === 'warning' ? 'bg-accent/10 border-accent/20 text-accent' : ''}
              `}>
                <div className="shrink-0">
                  {n.type === 'success' && <CheckCircle2 className="w-6 h-6" />}
                  {n.type === 'error' && <XCircle className="w-6 h-6" />}
                  {n.type === 'info' && <Info className="w-6 h-6" />}
                  {n.type === 'warning' && <AlertCircle className="w-6 h-6" />}
                </div>
                
                <div className="flex-1 text-sm font-medium leading-tight">
                  {n.message}
                </div>

                <button 
                  onClick={() => removeNotification(n.id)}
                  className="shrink-0 p-1 hover:bg-inverse/5 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 opacity-50" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
