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
- **Type-safe API**: tRPC (latest) with WebSocket subscriptions
- **Validation**: Zod (latest) for runtime type validation
- **Data Fetching**: @tanstack/react-query (required by tRPC React)

**Note**: All dependencies will use `@latest` versions during installation.

### Project Structure
Single package with organized source directories:
```
shelly-toolbox/
├── src/
│   ├── server/           # Node.js backend server
│   │   ├── index.ts      # Server entry point (Express + tRPC handlers)
│   │   ├── trpc.ts       # tRPC router definition
│   │   ├── context.ts    # tRPC context (optional)
│   │   └── services/     # Business logic
│   ├── client/           # React frontend
│   │   ├── main.tsx      # React entry point
│   │   ├── App.tsx       # Root component
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom hooks
│   │   └── utils/        # Client utilities
│   │       └── trpc.ts   # tRPC client setup
│   └── shared/           # Shared types and schemas
│       ├── types.ts      # Data models (Zod schemas)
│       └── router.ts     # Exported AppRouter type
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

### 2. Shared Types & Schemas (`src/shared/`)
- Define Zod schemas for data models (Device, etc.)
- Export TypeScript types inferred from Zod schemas
- No manual type syncing needed - tRPC infers types from router

### 3. Backend Server (`src/server/`)
- Set up Node.js/TypeScript server with Express
- Create tRPC router with:
  - **Queries**: Read operations (getDevices, etc.)
  - **Mutations**: Write operations (controlDevice, etc.)
  - **Subscriptions**: Real-time updates (onDeviceUpdate, etc.)
- Set up tRPC HTTP handler for queries/mutations
- Set up tRPC WebSocket handler for subscriptions
- Use Zod for input validation
- **Serve frontend**: 
  - Production: Serve built frontend from `dist/` folder
  - Development: Proxy requests to Vite dev server (http://localhost:5173)
- Add development script with hot-reload (tsx or ts-node-dev)
- Create stub Shelly service for device management
- No CORS configuration needed (same origin)

### 4. Frontend Application (`src/client/`)
- Set up Vite with React and TypeScript
- Install and configure Mantine UI library (latest version)
- Set up tRPC React client with React Query
- Configure tRPC links:
  - HTTP link for queries/mutations
  - WebSocket link for subscriptions
- Create basic application structure:
  - App component with Mantine provider and tRPC provider
  - Example component using tRPC hooks
- Configure Vite for development and production builds
- Types are automatically inferred from backend router

### 5. Type-Safe Communication with tRPC
Strategy: Use tRPC for end-to-end type safety without manual type definitions

**Shared Schemas**:
```typescript
// src/shared/types.ts
import { z } from 'zod';

export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  ipAddress: z.string(),
  online: z.boolean(),
  lastSeen: z.date(),
});

export type Device = z.infer<typeof DeviceSchema>;

export const DeviceCommandSchema = z.object({
  capability: z.string(),
  action: z.string(),
  parameters: z.record(z.unknown()).optional(),
});

export type DeviceCommand = z.infer<typeof DeviceCommandSchema>;
```

**Backend Router**:
```typescript
// src/server/trpc.ts
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { DeviceCommandSchema } from '@/shared/types';

const t = initTRPC.create();

export const appRouter = t.router({
  getDevices: t.procedure.query(async () => {
    // Return devices - type automatically inferred
    return shellyService.getDevices();
  }),
  
  controlDevice: t.procedure
    .input(z.object({
      deviceId: z.string(),
      command: DeviceCommandSchema,
    }))
    .mutation(async ({ input }) => {
      return shellyService.controlDevice(input.deviceId, input.command);
    }),
  
  onDeviceUpdate: t.procedure.subscription(() => {
    return observable<Device>((emit) => {
      const handler = (device: Device) => emit.next(device);
      shellyService.on('deviceUpdate', handler);
      return () => shellyService.off('deviceUpdate', handler);
    });
  }),
});

export type AppRouter = typeof appRouter;
```

**Frontend Client Setup**:
```typescript
// src/client/utils/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/trpc';

export const trpc = createTRPCReact<AppRouter>();
```

**Frontend Usage**:
```typescript
// In a React component - fully typed automatically!
const devices = trpc.getDevices.useQuery();
const controlDevice = trpc.controlDevice.useMutation();
const deviceUpdates = trpc.onDeviceUpdate.useSubscription();

// Call mutation
controlDevice.mutate({ deviceId: '123', command: { ... } });
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
- `types.ts` - Zod schemas and inferred TypeScript types
- `constants.ts` - Shared constants

#### src/server/
- `index.ts` - Server entry point (Express + tRPC handlers + frontend serving/proxy)
- `trpc.ts` - tRPC router definition with procedures and subscriptions
- `context.ts` - tRPC context factory (optional, for auth/session later)
- `services/shellyService.ts` - Shelly device management logic (stub with EventEmitter)

#### src/client/
- `main.tsx` - React application entry point
- `App.tsx` - Root React component with tRPC provider
- `utils/trpc.ts` - tRPC client setup and configuration
- `components/DeviceList.tsx` - Example component using tRPC hooks
- `theme.ts` - Mantine theme configuration (optional)
- `vite-env.d.ts` - Vite type declarations

#### public/
- (Empty or minimal static assets)

---

## Data Model / API / Interface Changes

### tRPC Procedures

#### Queries (Read operations)
- `getDevices` - Get list of all Shelly devices
- `getDevice` - Get specific device by ID

#### Mutations (Write operations)
- `controlDevice` - Send command to specific device
- `discoverDevices` - Trigger device discovery on local network

#### Subscriptions (Real-time updates)
- `onDeviceUpdate` - Subscribe to device status changes
- `onDeviceDiscovered` - Subscribe to newly discovered devices

### Device Model (Zod Schema)
```typescript
// src/shared/types.ts
import { z } from 'zod';

export const DeviceCapabilitySchema = z.object({
  type: z.enum(['switch', 'dimmer', 'sensor', 'meter']),
  id: z.string(),
  state: z.unknown(),
});

export const DeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  ipAddress: z.string().ip(),
  online: z.boolean(),
  lastSeen: z.date(),
  capabilities: z.array(DeviceCapabilitySchema),
});

export const DeviceCommandSchema = z.object({
  capability: z.string(),
  action: z.string(),
  parameters: z.record(z.unknown()).optional(),
});

// Inferred TypeScript types (automatically typed)
export type Device = z.infer<typeof DeviceSchema>;
export type DeviceCapability = z.infer<typeof DeviceCapabilitySchema>;
export type DeviceCommand = z.infer<typeof DeviceCommandSchema>;
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
1. **Development Mode**:
   - Start Vite dev server: `pnpm run dev:vite` (runs on port 5173)
   - Start backend server: `pnpm run dev:server` (runs on port 3001, proxies to Vite)
   - Or use single command: `pnpm run dev` (starts both concurrently)
   - Open browser to localhost:3001 (backend serves/proxies frontend)
   - Verify Mantine UI renders correctly
   - Verify WebSocket server is listening
   
2. **Production Mode**:
   - Build frontend: `pnpm run build`
   - Start backend: `pnpm run start`
   - Backend serves built frontend from `dist/` folder
   - Open browser to localhost:3001

3. **Type Safety**:
   - Modify a procedure in `src/server/trpc.ts` (change input/output type)
   - Verify TypeScript errors appear immediately in client code
   - This confirms end-to-end type inference works

4. **tRPC Communication**:
   - With both frontend and backend running, verify:
     - Queries work (getDevices)
     - Mutations work (controlDevice)
     - Subscriptions establish WebSocket connection
     - Real-time updates flow from server to client
     - All operations are fully typed

### Manual Testing Checklist
- [ ] Backend starts without errors
- [ ] Frontend starts and displays Mantine UI
- [ ] tRPC queries return data successfully
- [ ] tRPC mutations execute successfully
- [ ] tRPC subscriptions establish WebSocket connection
- [ ] Real-time updates flow from server to client
- [ ] Type errors are caught when modifying router procedures
- [ ] Linting passes
- [ ] Build process completes successfully

---

## Implementation Notes

### Technology Decisions
- **tRPC over Socket.io/REST**: End-to-end type safety without code generation, automatic type inference, no manual type syncing
- **Zod for validation**: Runtime type validation, schemas as single source of truth
- **Single package structure**: Simpler setup, direct imports, easier to start
- **pnpm**: Faster, more efficient than npm, better disk space usage
- **Latest versions**: All dependencies installed with `@latest` tag
- **Mantine over Material-UI/Ant Design**: Modern, TypeScript-first, excellent documentation, active development
- **Vite over Create React App**: Faster dev server, better build performance, modern tooling
- **Backend serves frontend**: No CORS issues, single origin, simpler deployment
  - Development: Backend proxies to Vite dev server
  - Production: Backend serves static files from `dist/`
- **React Query**: Required by tRPC React, provides excellent data fetching/caching

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
- **tRPC setup complexity**: Initial setup has more moving parts than REST
  - **Mitigation**: Follow official tRPC docs carefully, use latest examples
- **WebSocket subscriptions**: Requires separate WebSocket server setup
  - **Mitigation**: tRPC provides `applyWSSHandler` for easy WebSocket integration
- **Development workflow**: Running both Vite dev server and backend server
  - **Mitigation**: Use `concurrently` to run both with single command
- **Proxy configuration**: Backend must correctly proxy to Vite in development
  - **Mitigation**: Use `http-proxy-middleware` for Express proxy setup
- **Date serialization**: Dates need special handling in tRPC
  - **Mitigation**: Use superjson transformer or serialize dates as ISO strings

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
