# Shelly Toolbox

A TypeScript-based tool for managing local Shelly smart home devices with a modern React frontend.

## Features

- **Device Discovery**: Automatically discovers Shelly devices on your local network via mDNS
- **WiFi Provisioning**: Detect and configure factory-default Shelly devices to join your WiFi network
  - Auto-detection of unprovisioned devices via WiFi scanning
  - Automated setup workflow (connects to device AP, configures WiFi, sets password, reconnects)
  - Real-time provisioning status with automatic retry logic
  - Supports both Gen1 and Gen2 Shelly devices
- **Device Management**: Control and monitor your Shelly devices from a web interface
- **Password Protection**: Configure and apply passwords to unprotected devices
- **Real-time Updates**: WebSocket-based subscriptions for live device status updates

## Tech Stack

- **Backend**: Node.js + TypeScript + Express + tRPC
- **Frontend**: React + TypeScript + Vite + Mantine UI
- **Type Safety**: tRPC with end-to-end type inference
- **Validation**: Zod schemas
- **Communication**: WebSocket subscriptions for real-time updates

## Prerequisites

- Node.js (LTS version)
- pnpm (`npm install -g pnpm`)

## Installation

```bash
pnpm install
```

## Development

Start both frontend and backend in development mode:

```bash
pnpm run dev
```

This will start:
- Vite dev server on port 5173
- Backend server on port 3001 (proxies to Vite)

Access the application at http://localhost:3001

Alternatively, run them separately:

```bash
# Terminal 1 - Frontend
pnpm run dev:vite

# Terminal 2 - Backend
pnpm run dev:server
```

## Scripts

- `pnpm run dev` - Start both frontend and backend in development mode
- `pnpm run dev:vite` - Start Vite dev server only
- `pnpm run dev:server` - Start backend server only
- `pnpm run build` - Build frontend for production
- `pnpm run start` - Start production server
- `pnpm run typecheck` - Run TypeScript type checking
- `pnpm run lint` - Run ESLint
- `pnpm run lint:fix` - Fix ESLint errors
- `pnpm run format` - Format code with Prettier

## Build

Build the project (typecheck and frontend bundle):

```bash
pnpm run build
```

## Production

Start the production server (serves built frontend):

```bash
pnpm run start
```

## Project Structure

```
shelly-toolbox/
├── src/
│   ├── server/          # Backend server
│   │   ├── index.ts     # Server entry point
│   │   ├── trpc.ts      # tRPC router
│   │   └── services/    # Business logic
│   ├── client/          # React frontend
│   │   ├── main.tsx     # React entry point
│   │   ├── App.tsx      # Root component
│   │   ├── components/  # React components
│   │   └── utils/       # Client utilities
│   └── shared/          # Shared types and schemas
│       └── types.ts     # Zod schemas
├── public/              # Static assets
└── index.html           # HTML entry point
```

## Type Safety

This project uses tRPC for end-to-end type safety. Types are automatically inferred from the backend router to the frontend - no manual type definitions needed!

When you modify a procedure in `src/server/trpc.ts`, TypeScript will immediately show errors in client code if the usage doesn't match.

## Docker

### Pre-built Image

Pull the pre-built multi-architecture image (supports amd64 and arm64):

```bash
docker pull ghcr.io/hco/shelly-toolbox:latest
```

### Running the Container

**Recommended: Host networking with WiFi provisioning** (required for mDNS discovery and WiFi provisioning):

```bash
docker run -d \
  --name shelly-toolbox \
  --network host \
  --cap-add=NET_ADMIN \
  -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket \
  -v shelly-data:/app/data \
  ghcr.io/hco/shelly-toolbox:latest
```

Access the application at http://localhost:3001

**Note**: WiFi provisioning requires access to the host's NetworkManager via D-Bus and NET_ADMIN capability. If you don't need provisioning, you can omit `--cap-add=NET_ADMIN` and the D-Bus socket mount.

**Alternative: Port mapping only** (mDNS discovery and WiFi provisioning won't work):

```bash
docker run -d \
  --name shelly-toolbox \
  -p 3001:3001 \
  -v shelly-data:/app/data \
  ghcr.io/hco/shelly-toolbox:latest
```

### Building Locally

```bash
docker build -t shelly-toolbox .
docker run -d \
  --network host \
  --cap-add=NET_ADMIN \
  -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket \
  -v shelly-data:/app/data \
  shelly-toolbox
```

### Data Persistence

The container stores configuration in `/app/data`. Mount a volume to persist settings across container restarts.

## Manual Testing

- Run `pnpm run dev` and open `http://localhost:3001` in a browser.
- Verify that the initial list of Shelly devices appears.
- Trigger device actions from the UI and confirm that the list updates in real time.
- Check your browser DevTools Network/WebSocket tab to confirm a WebSocket connection to `/trpc` is established and stays connected.
- (Optional) Test WiFi provisioning:
  - Configure a target WiFi network in Settings
  - Place a Shelly device in factory-default mode (unprovisioned)
  - Verify it appears in the "Unprovisioned Devices" section
  - Click "Provision" to automatically configure the device
