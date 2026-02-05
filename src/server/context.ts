import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { auth, type User, type Session } from './auth.js';

export const createContext = async (
  opts: CreateHTTPContextOptions | CreateWSSContextFnOptions | CreateExpressContextOptions
) => {
  let user: User | null = null;
  let session: Session | null = null;

  // Extract headers from the request
  const req = opts.req;
  const headers = new Headers();

  // Copy relevant headers for session validation
  if (req.headers.cookie) {
    headers.set('cookie', req.headers.cookie as string);
  }
  if (req.headers.authorization) {
    headers.set('authorization', req.headers.authorization as string);
  }

  try {
    const sessionData = await auth.api.getSession({
      headers,
    });

    if (sessionData) {
      user = sessionData.user;
      session = sessionData.session;
    }
  } catch {
    // Session validation failed, user remains null
  }

  return {
    user,
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
