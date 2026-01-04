import { createTRPCReact } from '@trpc/react-query';
import {
  createWSClient,
  httpBatchLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import type { AppRouter } from '@/server/trpc.js';
import { SERVER_PORT } from '@/shared/constants.js';

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return `http://localhost:${SERVER_PORT}`;
};

const getWsUrl = () => {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  return `ws://localhost:${SERVER_PORT}`;
};

export const wsClient =
  typeof window === 'undefined'
    ? null
    : createWSClient({
        url: `${getWsUrl()}/trpc`,
      });

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition(op) {
        return op.type === 'subscription';
      },
      true: wsClient
        ? wsLink<AppRouter>({
            client: wsClient,
          })
        : httpBatchLink({
            url: `${getBaseUrl()}/trpc`,
          }),
      false: httpBatchLink({
        url: `${getBaseUrl()}/trpc`,
      }),
    }),
  ],
});
