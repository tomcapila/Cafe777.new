import React, { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import QRCode from 'qrcode';

interface EventTicketModalProps {
  eventId: string;
  eventName: string;
  userId: number;
  participationStampName?: string;
  onClose: () => void;
}

export default function EventTicketModal({ eventId, eventName, userId, participationStampName, onClose }: EventTicketModalProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    const generateQR = async () => {
      try {
        const text = `event_checkin_${eventId}_${userId}`;
        const url = await QRCode.toDataURL(text, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeUrl(url);
      } catch (err) {
        console.error(err);
      }
    };
    generateQR();
  }, [eventId, userId]);

  return (
    <div className="fixed inset-0 bg-engine/80 z-50 flex items-center justify-center p-4">
      <div className="glass-card p-8 max-w-sm w-full relative flex flex-col items-center text-center">
        <button onClick={onClose} className="absolute top-4 right-4 text-steel hover:text-chrome">
          <X className="w-6 h-6" />
        </button>
        
        <h2 className="text-2xl font-display font-black uppercase italic tracking-tighter mb-2 text-primary">Your Ticket</h2>
        <p className="text-sm text-steel mb-8 font-mono uppercase tracking-widest">{eventName}</p>
        
        <div className="bg-chrome p-4 rounded-2xl mb-8 shadow-2xl">
          {qrCodeUrl ? (
            <img src={qrCodeUrl} alt="Event Ticket QR Code" className="w-64 h-64" />
          ) : (
            <div className="w-64 h-64 flex items-center justify-center bg-engine rounded-xl">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {participationStampName && (
          <div className="mb-6 px-4 py-2 bg-accent/10 border border-accent/20 rounded-xl flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-accent" />
            </div>
            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-accent">
              Earn: {participationStampName}
            </span>
          </div>
        )}

        <p className="text-xs text-steel font-mono uppercase tracking-widest leading-relaxed">
          Present this QR code to the event host for check-in.
        </p>
      </div>
    </div>
  );
}
