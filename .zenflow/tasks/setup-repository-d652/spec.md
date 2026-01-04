# Technical Specification: Shelly Toolbox Repository Setup

## Task Complexity Assessment
**Complexity Level**: Medium

**Rationale**: This task requires setting up a full-stack TypeScript application with multiple components (backend, frontend, shared types), configuring build tools, implementing typesafe WebSocket communication, and establishing proper project structure and tooling. While not architecturally complex, it involves coordinating multiple technologies and ensuring type safety across the stack.

---

## Technical Context

### Language & Runtime
- **Backend**: Node.js (LTS) with TypeScript
- **Frontend**: ReactJS with TypeScript
- **Package Manager**: pnpm

### Key Dependencies (Latest Versions)
- **Frontend Framework**: React (latest)
- **Frontend Build Tool**: Vite (latest)
- **UI Library**: Mantine (latest - https://mantine.dev)
- **WebSocket Communication**: Socket.io (latest) with TypeScript support
- **Type Sharing**: Shared TypeScript definitions for frontend/backend

**Note**: All dependencies will use `@latest` versions during installation.

### Project Structure
Single package with organized source directories:
```
shelly-toolbox/
├── src/
│   ├── server/           # Node.js backend server
│   │   ├── index.ts      # Server entry point
│   │   ├── websocket.ts  # WebSocket server
│   │   └── services/     # Business logic
│   ├── client/           # React frontend
│   │   ├── main.tsx      # React entry point
│   │   ├── App.tsx       # Root component
│   │   ├── components/   # React components
│   │   └── hooks/        # Custom hooks
│   └── shared/           # Shared types and utilities
│       ├── types.ts      # Data models
│       └── websocket.ts  # WebSocket event types
├── public/               # Static assets for frontend
├── index.html            # HTML entry point
├── package.json          # Single package.json
├── tsconfig.json         # TypeScript configuration
├── vite.config.ts        # Vite configuration
├── .gitignore
└── README.md
```

---

## Implementation Approach

### 1. Repository Foundation
- Initialize `package.json` with all dependencies
- Create comprehensive `.gitignore` for Node.js, TypeScript, and IDE files
- Set up TypeScript configuration (`tsconfig.json`)
- Configure ESLint and Prettier for consistent code quality
- Install all dependencies using `pnpm add <package>@latest`

### 2. Shared Types (`src/shared/`)
- Define TypeScript interfaces for WebSocket messages
- Create type-safe event schemas (request/response pairs)
- Export shared utilities and constants
- Types are imported directly with `@/shared/*` path aliases

### 3. Backend Server (`src/server/`)
- Set up Node.js/TypeScript server with Express
- Implement WebSocket server using Socket.io with type-safe handlers
- Use shared types from `src/shared/`
- Add development script with hot-reload (tsx or ts-node-dev)
- Create stub Shelly service for device management

### 4. Frontend Application (`src/client/`)
- Set up Vite with React and TypeScript
- Install and configure Mantine UI library (latest version)
- Set up WebSocket client with type-safe event handlers
- Create basic application structure:
  - App component with Mantine provider
  - WebSocket connection management hook
  - Example component demonstrating Shelly device management
- Configure Vite for development and production builds
- Use shared types from `src/shared/`

### 5. Type-Safe WebSocket Communication
Strategy: Use Socket.io with TypeScript for bidirectional type safety

**Shared Types Structure**:
```typescript
// src/shared/websocket.ts
export interface ServerToClientEvents {
  deviceStatus: (data: DeviceStatus) => void;
  deviceList: (devices: Device[]) => void;
}

export interface ClientToServerEvents {
  getDevices: () => void;
  controlDevice: (deviceId: string, command: DeviceCommand) => void;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  online: boolean;
}

// Additional interfaces...
```

**Backend Implementation**:
```typescript
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@/shared/websocket';

const io = new Server<ClientToServerEvents, ServerToClientEvents>();
```

**Frontend Implementation**:
```typescript
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/shared/websocket';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io('http://localhost:3001');
```

### 6. Development Tooling
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier
- **Type Checking**: TypeScript strict mode enabled
- **Testing** (future): Jest/Vitest for unit tests, Playwright for E2E
- **Git Hooks** (optional): Husky with lint-staged for pre-commit checks

---

## Source Code Structure Changes

### Files to Create

#### Root Level
- `package.json` - All dependencies and scripts
- `tsconfig.json` - TypeScript configuration with path aliases
- `vite.config.ts` - Vite configuration
- `.gitignore` - Git ignore patterns
- `eslint.config.js` - ESLint configuration (flat config)
- `.prettierrc` - Prettier configuration
- `README.md` - Project documentation
- `index.html` - HTML entry point for Vite

#### src/shared/
- `types.ts` - Shared data model types (Device, etc.)
- `websocket.ts` - WebSocket event type definitions
- `constants.ts` - Shared constants

#### src/server/
- `index.ts` - Server entry point
- `websocket.ts` - WebSocket server implementation
- `services/shellyService.ts` - Shelly device management logic (stub)
- `.env.example` - Environment variables template (if needed)

#### src/client/
- `main.tsx` - React application entry point
- `App.tsx` - Root React component
- `hooks/useWebSocket.ts` - WebSocket connection hook
- `components/DeviceList.tsx` - Example component
- `theme.ts` - Mantine theme configuration (optional)
- `vite-env.d.ts` - Vite type declarations

#### public/
- (Empty or minimal static assets)

---

## Data Model / API / Interface Changes

### WebSocket Events

#### Client → Server
- `getDevices` - Request list of Shelly devices
- `controlDevice` - Send command to specific device
- `discoverDevices` - Trigger device discovery on local network

#### Server → Client
- `deviceList` - Send current device list
- `deviceStatus` - Update status of specific device
- `deviceDiscovered` - Notify about newly discovered device
- `error` - Error notification

### Device Model (Shared Type)
```typescript
interface Device {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  online: boolean;
  lastSeen: Date;
  capabilities: DeviceCapability[];
}

interface DeviceCapability {
  type: 'switch' | 'dimmer' | 'sensor' | 'meter';
  id: string;
  state: unknown;
}

interface DeviceCommand {
  capability: string;
  action: string;
  parameters?: Record<string, unknown>;
}
```

---

## Verification Approach

### Setup Verification
1. **Dependencies Installation**: Run `pnpm install` - should install all dependencies
2. **TypeScript Compilation**: 
   - `pnpm run build` - Should compile server and build client
   - `pnpm run typecheck` - TypeScript check across entire codebase
3. **Linting**: `pnpm run lint` - Should pass without errors

### Functional Verification
1. **Backend Server**:
   - Start backend: `pnpm run dev:server`
   - Verify server starts on configured port (e.g., 3001)
   - Verify WebSocket server is listening
   
2. **Frontend Application**:
   - Start frontend: `pnpm run dev` or `pnpm run dev:client`
   - Verify Vite dev server starts
   - Verify Mantine UI renders correctly
   - Open browser to localhost:5173 (default Vite port)

3. **Type Safety**:
   - Modify a WebSocket event signature in `src/shared/websocket.ts`
   - Verify TypeScript errors appear in both `src/server/` and `src/client/`
   - This confirms type sharing works correctly

4. **WebSocket Communication**:
   - With both frontend and backend running, verify:
     - WebSocket connection established (check browser console)
     - Can send/receive test messages
     - Type-safe event handlers work correctly

### Manual Testing Checklist
- [ ] Backend starts without errors
- [ ] Frontend starts and displays Mantine UI
- [ ] WebSocket connection establishes between frontend and backend
- [ ] Type errors are caught when modifying shared types
- [ ] Linting passes
- [ ] Build process completes successfully

---

## Implementation Notes

### Technology Decisions
- **Socket.io over native WebSocket**: Better browser compatibility, automatic reconnection, TypeScript support
- **Single package structure**: Simpler setup, direct imports, easier to start
- **pnpm**: Faster, more efficient than npm, better disk space usage
- **Latest versions**: All dependencies installed with `@latest` tag
- **Mantine over Material-UI/Ant Design**: Modern, TypeScript-first, excellent documentation, active development
- **Vite over Create React App**: Faster dev server, better build performance, modern tooling

### Future Considerations
- Testing infrastructure (Vitest for unit tests, Playwright for E2E)
- Docker containerization for deployment
- Environment-based configuration management
- Shelly device discovery protocol implementation
- Authentication/authorization if needed
- State management (Zustand/Redux if complexity grows)
- API documentation (if REST API is added alongside WebSocket)
- Consider splitting into monorepo if complexity grows

### Potential Challenges
- **Type synchronization**: Ensuring shared types stay in sync between frontend/backend
  - **Mitigation**: TypeScript path aliases (`@/shared/*`), strict TypeScript checking
- **WebSocket connection management**: Handling disconnections, reconnections
  - **Mitigation**: Socket.io handles this automatically
- **Build process**: Server needs separate build/run process from frontend
  - **Mitigation**: Separate npm scripts for server and client development

---

## Success Criteria

The repository setup is complete when:
1. ✅ All code compiles without TypeScript errors
2. ✅ Backend server starts and WebSocket server is accessible
3. ✅ Frontend application starts and renders Mantine UI components
4. ✅ WebSocket connection establishes between frontend and backend
5. ✅ Type-safe communication is verified (shared types work correctly)
6. ✅ Linting and formatting configurations are in place
7. ✅ README.md documents how to install, develop, and build the project
8. ✅ `.gitignore` properly excludes generated files and dependencies
9. ✅ All dependencies use latest versions
