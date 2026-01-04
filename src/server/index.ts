import express from 'express';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { WebSocketServer } from 'ws';
import { appRouter } from './trpc.js';
import { createContext } from './context.js';
import { SERVER_PORT, VITE_DEV_PORT } from '@/shared/constants.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const isDev = process.env.NODE_ENV !== 'production';

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

if (isDev) {
  console.log('Development mode: Proxying to Vite dev server');
  const { createProxyMiddleware } = await import('http-proxy-middleware');
  app.use(
    createProxyMiddleware({
      target: `http://localhost:${VITE_DEV_PORT}`,
      changeOrigin: true,
      ws: true,
      pathFilter: (pathname) => !pathname.startsWith('/trpc'),
    })
  );
} else {
  const distPath = path.join(__dirname, '../../dist/client');
  console.log(`Production mode: Serving static files from ${distPath}`);
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = app.listen(SERVER_PORT, () => {
  console.log(`Server listening on http://localhost:${SERVER_PORT}`);
});

const wss = new WebSocketServer({ server });

applyWSSHandler({
  wss,
  router: appRouter,
  createContext,
});

console.log(`WebSocket server is running`);

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  wss.close();
  server.close();
});
