# Technical Specification: Shelly Toolbox Repository Setup

## Task Complexity Assessment
**Complexity Level**: Medium

**Rationale**: This task requires setting up a full-stack TypeScript application with multiple components (backend, frontend, shared types), configuring build tools, implementing typesafe WebSocket communication, and establishing proper project structure and tooling. While not architecturally complex, it involves coordinating multiple technologies and ensuring type safety across the stack.

---

## Technical Context

### Language & Runtime
- **Backend**: Node.js (LTS) with TypeScript
- **Frontend**: ReactJS with TypeScript
- **Package Manager**: npm/pnpm (to be determined based on preference)

### Key Dependencies
- **Frontend Framework**: React 18+
- **Frontend Build Tool**: Vite
- **UI Library**: Mantine (https://mantine.dev)
- **WebSocket Communication**: Socket.io or similar with TypeScript support
- **Type Sharing**: Shared TypeScript definitions for frontend/backend

### Project Structure
Monorepo approach with workspaces:
```
shelly-toolbox/
├── packages/
│   ├── backend/          # Node.js backend server
│   ├── frontend/         # React+Vite frontend
│   └── shared/           # Shared TypeScript types and utilities
├── package.json          # Root package.json with workspace configuration
├── tsconfig.base.json    # Base TypeScript configuration
├── .gitignore
├── README.md
└── .eslintrc.js          # Shared linting configuration
```

---

## Implementation Approach

### 1. Repository Foundation
- Initialize root `package.json` with workspace configuration
- Create comprehensive `.gitignore` for Node.js, TypeScript, and IDE files
- Set up base TypeScript configuration (`tsconfig.base.json`)
- Configure ESLint and Prettier for consistent code quality

### 2. Shared Package (`packages/shared`)
- Define TypeScript interfaces for WebSocket messages
- Create type-safe event schemas (request/response pairs)
- Export shared utilities and constants
- Configure for dual ESM/CJS output if needed

### 3. Backend Package (`packages/backend`)
- Initialize Node.js/TypeScript server
- Set up WebSocket server (Socket.io recommended for TypeScript support)
- Implement type-safe WebSocket handlers using shared types
- Configure build process (TypeScript compilation)
- Add development scripts with hot-reload (ts-node-dev or tsx)
- Set up basic logging framework

### 4. Frontend Package (`packages/frontend`)
- Initialize Vite project with React and TypeScript template
- Install and configure Mantine UI library
- Set up WebSocket client with type-safe event handlers
- Create basic application structure:
  - App component with Mantine provider
  - WebSocket connection management hook
  - Example component demonstrating Shelly device management
- Configure Vite for development and production builds

### 5. Type-Safe WebSocket Communication
Strategy: Use Socket.io with TypeScript for bidirectional type safety

**Shared Types Structure**:
```typescript
// packages/shared/src/websocket.ts
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
import type { ServerToClientEvents, ClientToServerEvents } from '@shelly-toolbox/shared';

const io = new Server<ClientToServerEvents, ServerToClientEvents>();
```

**Frontend Implementation**:
```typescript
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@shelly-toolbox/shared';

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
- `package.json` - Workspace root configuration
- `tsconfig.base.json` - Base TypeScript configuration
- `.gitignore` - Git ignore patterns
- `.eslintrc.js` - ESLint configuration
- `.prettierrc` - Prettier configuration
- `README.md` - Project documentation

#### packages/shared
- `package.json` - Shared package configuration
- `tsconfig.json` - TypeScript config extending base
- `src/index.ts` - Main export file
- `src/websocket.ts` - WebSocket type definitions
- `src/types.ts` - Shared type definitions
- `src/constants.ts` - Shared constants

#### packages/backend
- `package.json` - Backend package configuration
- `tsconfig.json` - TypeScript config extending base
- `src/index.ts` - Server entry point
- `src/server.ts` - Express/HTTP server setup
- `src/websocket.ts` - WebSocket server implementation
- `src/services/shellyService.ts` - Shelly device management logic (stub)
- `.env.example` - Environment variables template

#### packages/frontend
- `package.json` - Frontend package configuration
- `tsconfig.json` - TypeScript config for React
- `vite.config.ts` - Vite configuration
- `index.html` - HTML entry point
- `src/main.tsx` - React application entry
- `src/App.tsx` - Root React component
- `src/hooks/useWebSocket.ts` - WebSocket connection hook
- `src/components/DeviceList.tsx` - Example component
- `src/theme.ts` - Mantine theme configuration

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
1. **Dependencies Installation**: Run `npm install` at root - should install all workspace dependencies
2. **TypeScript Compilation**: 
   - `npm run build` - Should compile all packages without errors
   - `npm run typecheck` - TypeScript check across all packages
3. **Linting**: `npm run lint` - Should pass without errors

### Functional Verification
1. **Backend Server**:
   - Start backend: `npm run dev:backend`
   - Verify server starts on configured port
   - Verify WebSocket server is listening
   
2. **Frontend Application**:
   - Start frontend: `npm run dev:frontend`
   - Verify Vite dev server starts
   - Verify Mantine UI renders correctly
   - Open browser to localhost:5173 (default Vite port)

3. **Type Safety**:
   - Modify a WebSocket event signature in `packages/shared`
   - Verify TypeScript errors appear in both frontend and backend
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
- [ ] Linting passes for all packages
- [ ] Build process completes successfully

---

## Implementation Notes

### Technology Decisions
- **Socket.io over native WebSocket**: Better browser compatibility, automatic reconnection, TypeScript support
- **Monorepo with workspaces**: Easier type sharing, unified tooling, single repository
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

### Potential Challenges
- **Type synchronization**: Ensuring shared types stay in sync between frontend/backend
  - **Mitigation**: Use workspace dependencies, strict TypeScript checking
- **WebSocket connection management**: Handling disconnections, reconnections
  - **Mitigation**: Socket.io handles this automatically
- **Build complexity**: Managing multiple package builds
  - **Mitigation**: Use workspace scripts, consider build tools like Turborepo if needed

---

## Success Criteria

The repository setup is complete when:
1. ✅ All packages compile without TypeScript errors
2. ✅ Backend server starts and WebSocket server is accessible
3. ✅ Frontend application starts and renders Mantine UI components
4. ✅ WebSocket connection establishes between frontend and backend
5. ✅ Type-safe communication is verified (shared types work correctly)
6. ✅ Linting and formatting configurations are in place
7. ✅ README.md documents how to install, develop, and build the project
8. ✅ `.gitignore` properly excludes generated files and dependencies
