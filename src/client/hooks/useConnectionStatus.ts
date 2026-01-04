import { useEffect, useState } from 'react';
import { wsClient } from '@/client/utils/trpc.js';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(() => {
    if (!wsClient) {
      return 'disconnected';
    }
    return 'connecting';
  });

  useEffect(() => {
    const client = wsClient;

    if (!client) {
      return;
    }

    const updateStatusFromClient = () => {
      const connectionState = client.connection?.state;

      if (connectionState === 'open') {
        setStatus('connected');
      } else if (connectionState === 'connecting') {
        setStatus('connecting');
      } else {
        setStatus('disconnected');
      }
    };

    updateStatusFromClient();

    if (typeof window === 'undefined') {
      return;
    }

    const intervalId = window.setInterval(updateStatusFromClient, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return status;
}
