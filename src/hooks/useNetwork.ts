import { useState, useEffect } from 'react';
import { Network, ConnectionStatus } from '@capacitor/network';
import { SyncEngine } from '../services/syncEngine';

export function useNetwork() {
  const [status, setStatus] = useState<ConnectionStatus>({
    connected: true,
    connectionType: 'unknown'
  });

  useEffect(() => {
    // Get initial status
    Network.getStatus().then(setStatus);

    // Listen for changes
    const listener = Network.addListener('networkStatusChange', (newStatus) => {
      setStatus(newStatus);
      
      // Trigger sync when connection is restored
      if (newStatus.connected) {
        SyncEngine.sync();
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  return status;
}
