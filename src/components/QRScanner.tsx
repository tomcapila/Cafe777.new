import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: any) => void;
}

export default function QRScanner({ onScanSuccess, onScanError }: QRScannerProps) {
  const { t } = useLanguage();
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    Html5Qrcode.getCameras().then(devices => {
      if (!isMounted) return;
      
      if (devices && devices.length) {
        setHasCamera(true);
        
        const startScanner = (config: any) => {
          return scanner.start(
            config,
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
              if (!hasScannedRef.current) {
                hasScannedRef.current = true;
                setScanSuccess(true);
                
                // Delay the callback slightly to show the success animation
                setTimeout(() => {
                  if (isMounted) {
                    onScanSuccess(decodedText);
                  }
                }, 500);
              }
            },
            (error) => {
              if (onScanError) onScanError(error);
            }
          );
        };

        startScanner({ facingMode: "environment" })
          .then(() => {
            if (isMounted) {
              setIsScanning(true);
            } else {
              scanner.stop().then(() => scanner.clear()).catch(console.error);
            }
          })
          .catch(err => {
            if (!isMounted) return;
            console.warn("Environment camera failed, trying first available camera...", err);
            // Fallback to the first available camera
            startScanner(devices[0].id)
              .then(() => {
                if (isMounted) {
                  setIsScanning(true);
                } else {
                  scanner.stop().then(() => scanner.clear()).catch(console.error);
                }
              })
              .catch(fallbackErr => {
                if (!isMounted) return;
                console.error("Error starting scanner with fallback", fallbackErr);
                setHasCamera(false);
              });
          });
      } else {
        setHasCamera(false);
      }
    }).catch(err => {
      if (!isMounted) return;
      console.error("Error getting cameras", err);
      setHasCamera(false);
    });

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        const currentScanner = scannerRef.current;
        if (currentScanner.isScanning) {
          currentScanner.stop().then(() => {
            currentScanner.clear();
          }).catch(console.error);
        } else {
          try {
            currentScanner.clear();
          } catch (e) {
            console.error("Error clearing scanner", e);
          }
        }
      }
    };
  }, [onScanSuccess, onScanError]);

  return (
    <div className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl border border-inverse/10 bg-engine relative aspect-square flex items-center justify-center">
      {hasCamera === false && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-steel text-sm p-4 text-center z-10 bg-engine">
          <Camera className="w-8 h-8 mb-2 opacity-50" />
          <p>{t('scanner.noCamera')}</p>
        </div>
      )}
      {hasCamera === null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-steel text-sm p-4 text-center z-10 bg-engine">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
          <p>{t('scanner.requesting')}</p>
        </div>
      )}
      <div id="qr-reader" className="w-full h-full [&>video]:object-cover [&>video]:w-full [&>video]:h-full" />
      
      {isScanning && !scanSuccess && (
        <div className="absolute inset-0 pointer-events-none border-[40px] border-inverse/50 z-20">
          <motion.div 
            className="w-full h-full border-2 border-primary/50 relative overflow-hidden"
            animate={{ 
              boxShadow: ['inset 0 0 0px rgba(242,125,38,0)', 'inset 0 0 20px rgba(242,125,38,0.5)', 'inset 0 0 0px rgba(242,125,38,0)'],
              borderColor: ['rgba(242,125,38,0.3)', 'rgba(242,125,38,0.8)', 'rgba(242,125,38,0.3)']
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary -mt-[2px] -ml-[2px]" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary -mt-[2px] -mr-[2px]" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary -mb-[2px] -ml-[2px]" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary -mb-[2px] -mr-[2px]" />
            
            {/* Pulsing scanning line */}
            <motion.div 
              className="absolute left-0 w-full h-0.5 bg-primary shadow-[0_0_15px_3px_rgba(242,125,38,0.8)]"
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {scanSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-success/20 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="w-24 h-24 bg-success rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.5)]"
            >
              <CheckCircle2 className="w-12 h-12 text-chrome" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
