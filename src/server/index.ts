import { closeFileLogging } from './logger.js';
import express from 'express';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { WebSocketServer } from 'ws';
import { toNodeHandler } from 'better-auth/node';
import { appRouter } from './trpc.js';
import { createContext } from './context.js';
import { SERVER_PORT, VITE_DEV_PORT } from '@/shared/constants.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { shellyService } from './services/shellyService.js';
import { wifiConnectionService } from './services/wifiConnectionService.js';
import { auth } from './auth.js';
import { authService } from './services/authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const isDev = process.env.NODE_ENV !== 'production';

// Parse CLI flags and environment variables
const autoProvisionEnabled =
  process.env.SHELLY_AUTO_PROVISION === 'true' ||
  process.argv.includes('--auto-provision');

if (autoProvisionEnabled) {
  console.log('Auto-provisioning mode enabled');
}

// Initialize auth service cache
authService.refreshUserCache();
console.log(`Auth: ${authService.isSetupMode() ? 'Setup mode (no users)' : 'Users exist'}`);

// Mount better-auth handler before other routes
app.all('/api/auth/*splat', toNodeHandler(auth));

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
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = app.listen(SERVER_PORT, () => {
  console.log(`Server listening on http://localhost:${SERVER_PORT}`);
});

// Use noServer mode to handle WebSocket upgrades manually
// This prevents conflicts with Vite's HMR WebSocket in dev mode
const wss = new WebSocketServer({ noServer: true });

applyWSSHandler({
  wss,
  router: appRouter,
  createContext,
});

// Only handle /trpc WebSocket upgrades, let others pass through to proxy
server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/trpc')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
  // Non-/trpc WebSocket requests (like Vite HMR) are handled by the proxy
});

console.log(`WebSocket server is running`);

// Initialize auto-provisioning if enabled
if (autoProvisionEnabled) {
  (async () => {
    // Initialize WiFi connection service first
    await wifiConnectionService.initialize();

    // Enable auto-provisioning (starts WiFi scanning)
    const enabled = await shellyService.enableAutoProvisioning();
    if (!enabled) {
      console.warn(
        'Auto-provisioning could not be enabled. ' +
        'This feature requires Linux with NetworkManager.'
      );
    }
  })();
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  shellyService.disableAutoProvisioning();
  wss.close();
  server.close();
  closeFileLogging();
});
