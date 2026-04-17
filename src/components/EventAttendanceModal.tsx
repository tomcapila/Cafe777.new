import React, { useEffect, useState } from 'react';
import { X, Check, Download, QrCode, Search } from 'lucide-react';
import { fetchWithAuth } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRScanner from './QRScanner';

interface Attendee {
  id: number;
  username: string;
  profile_picture_url: string;
  checked_in: number;
}

interface EventAttendanceModalProps {
  eventId: string;
  eventName: string;
  eventDate: string;
  hostName: string;
  participationStampName?: string;
  onClose: () => void;
}

export default function EventAttendanceModal({ eventId, eventName, eventDate, hostName, participationStampName, onClose }: EventAttendanceModalProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const { showNotification } = useNotification();

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<{userId: number, checkedIn: boolean}[]>([]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Load offline queue from localStorage
    const savedQueue = localStorage.getItem(`offline_checkins_${eventId}`);
    if (savedQueue) {
      setOfflineQueue(JSON.parse(savedQueue));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [eventId]);

  useEffect(() => {
    // Sync offline queue when coming back online
    if (isOnline && offlineQueue.length > 0) {
      const syncQueue = async () => {
        let successCount = 0;
        const remainingQueue = [];
        for (const item of offlineQueue) {
          try {
            const res = await fetchWithAuth(`/api/events/${eventId}/checkin`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: item.userId, checkedIn: item.checkedIn }),
            });
            if (res.ok) {
              successCount++;
            } else {
              remainingQueue.push(item);
            }
          } catch (err) {
            console.error('Failed to sync check-in', err);
            remainingQueue.push(item);
          }
        }
        
        if (successCount > 0) {
          showNotification('success', `Synced ${successCount} offline check-ins`);
          setOfflineQueue(remainingQueue);
          if (remainingQueue.length === 0) {
            localStorage.removeItem(`offline_checkins_${eventId}`);
          } else {
            localStorage.setItem(`offline_checkins_${eventId}`, JSON.stringify(remainingQueue));
          }
          fetchAttendees(); // Refresh the list
        }
      };
      
      syncQueue();
    }
  }, [isOnline, offlineQueue, eventId]);

  const fetchAttendees = async () => {
    try {
      const res = await fetchWithAuth(`/api/events/${eventId}/attendees`);
      if (res.ok) {
        const data = await res.json();
        
        // Apply offline queue to fetched data
        const updatedData = data.map((attendee: Attendee) => {
          const queuedItem = offlineQueue.find(q => q.userId === attendee.id);
          if (queuedItem) {
            return { ...attendee, checked_in: queuedItem.checkedIn ? 1 : 0 };
          }
          return attendee;
        });
        
        setAttendees(updatedData);
      }
    } catch (err) {
      console.error(err);
      if (!isOnline) {
        showNotification('error', 'Cannot fetch attendees while offline');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendees();
  }, [eventId]);

  const handleCheckIn = async (userId: number, checkedIn: boolean) => {
    // Optimistically update UI
    setAttendees(prev => prev.map(a => a.id === userId ? { ...a, checked_in: checkedIn ? 1 : 0 } : a));

    if (!isOnline) {
      // Store in offline queue
      const newQueue = [...offlineQueue.filter(q => q.userId !== userId), { userId, checkedIn }];
      setOfflineQueue(newQueue);
      localStorage.setItem(`offline_checkins_${eventId}`, JSON.stringify(newQueue));
      showNotification('success', 'Saved offline. Will sync when connected.');
      return;
    }

    try {
      const res = await fetchWithAuth(`/api/events/${eventId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, checkedIn }),
      });
      if (!res.ok) {
        throw new Error('Failed to update check-in status');
      }
    } catch (err) {
      console.error(err);
      // Revert UI on failure
      setAttendees(prev => prev.map(a => a.id === userId ? { ...a, checked_in: !checkedIn ? 1 : 0 } : a));
      showNotification('error', 'Failed to update check-in status');
    }
  };

  const exportPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(22);
      doc.setTextColor(255, 99, 33); // Primary color #FF6321
      doc.text('CAFE777 ATTENDANCE REPORT', 14, 22);
      
      doc.setFontSize(14);
      doc.setTextColor(100, 100, 100);
      doc.text(`Event: ${eventName}`, 14, 32);
      doc.text(`Date: ${eventDate}`, 14, 40);
      doc.text(`Host: ${hostName}`, 14, 48);
      
      const tableData = attendees.map(a => [
        a.username,
        a.checked_in ? 'CHECKED IN' : 'NOT CHECKED IN'
      ]);

      autoTable(doc, {
        startY: 55,
        head: [['USERNAME', 'STATUS']],
        body: tableData,
        headStyles: { fillColor: [255, 99, 33], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });

      doc.save(`attendance_${eventName.replace(/\s+/g, '_')}.pdf`);
    } catch (err: any) {
      console.error('PDF Export Error:', err);
      showNotification('error', `Failed to export PDF: ${err.message || 'Unknown error'}`);
    }
  };

  const filteredAttendees = attendees.filter(a => a.username.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-engine/80 z-50 flex items-center justify-center p-4">
      <div className="glass-card p-6 md:p-8 max-w-3xl w-full max-h-[90vh] flex flex-col relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-steel hover:text-chrome">
          <X className="w-6 h-6" />
        </button>
        
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-display font-black uppercase italic tracking-tighter text-primary">Manage Attendance</h2>
          <div className="flex items-center gap-4">
            {participationStampName && (
              <div className="px-3 py-1 bg-accent/10 text-accent border border-accent/30 rounded-full font-mono text-[10px] uppercase tracking-widest flex items-center gap-2">
                <QrCode className="w-3 h-3" />
                Prize: {participationStampName}
              </div>
            )}
            {!isOnline && (
              <div className="px-3 py-1 bg-primary/20 text-primary border border-primary/30 rounded-full font-mono text-[10px] uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Offline Mode
              </div>
            )}
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel" />
            <input 
              type="text" 
              value={searchQuery || ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search attendees..."
              className="w-full bg-oil border border-inverse/10 rounded-xl py-2 pl-10 pr-4 text-sm text-chrome focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsScanning(!isScanning)}
              className="px-4 py-2 bg-oil hover:bg-engine border border-inverse/10 rounded-xl text-chrome font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <QrCode className="w-4 h-4" />
              {isScanning ? 'Stop Scan' : 'Scan QR'}
            </button>
            <button 
              onClick={exportPDF}
              className="px-4 py-2 bg-primary hover:bg-oil rounded-xl text-inverse font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 transition-colors shadow-lg shadow-primary/20"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          </div>
        </div>

        {isScanning && (
          <div className="mb-6 bg-engine rounded-xl overflow-hidden border border-inverse/10">
            <QRScanner
              onScanSuccess={(decodedText) => {
                // Expected format: event_checkin_{eventId}_{userId}
                const parts = decodedText.split('_');
                if (parts.length === 4 && parts[0] === 'event' && parts[1] === 'checkin' && parts[2] === eventId) {
                  const userId = parseInt(parts[3], 10);
                  
                  // Check if already checked in
                  const attendee = attendees.find(a => a.id === userId);
                  if (attendee && attendee.checked_in) {
                     showNotification('error', 'User is already checked in');
                     setIsScanning(false);
                     return;
                  }

                  handleCheckIn(userId, true);
                  setIsScanning(false);
                  showNotification('success', 'User checked in successfully!');
                } else {
                  showNotification('error', 'Invalid QR code for this event');
                  setIsScanning(false);
                }
              }}
              onScanError={(error) => {
                // Ignore scan errors
              }}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredAttendees.length === 0 ? (
            <div className="text-center py-8 text-steel font-mono text-xs uppercase tracking-widest">
              No attendees found
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredAttendees.map(attendee => (
                <div key={attendee.id} className="flex items-center justify-between p-4 bg-oil/50 rounded-xl border border-inverse/5">
                  <div className="flex items-center gap-3">
                    <img 
                      src={attendee.profile_picture_url || `https://ui-avatars.com/api/?name=${attendee.username}&background=random`} 
                      alt={attendee.username} 
                      className="w-10 h-10 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="font-display font-bold uppercase tracking-tight text-chrome">{attendee.username}</span>
                    {offlineQueue.some(q => q.userId === attendee.id) && (
                      <span className="text-[8px] font-mono text-primary uppercase tracking-widest border border-primary/30 px-2 py-0.5 rounded-full bg-primary/10">Pending Sync</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleCheckIn(attendee.id, !attendee.checked_in)}
                    className={`px-4 py-2 rounded-lg font-mono text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all ${
                      attendee.checked_in 
                        ? 'bg-success/20 text-success border border-success/30 hover:bg-success/30' 
                        : 'bg-inverse/5 text-steel border border-inverse/10 hover:bg-inverse/10'
                    }`}
                  >
                    <Check className={`w-3 h-3 ${attendee.checked_in ? 'opacity-100' : 'opacity-0'}`} />
                    {attendee.checked_in ? 'Checked In' : 'Check In'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
