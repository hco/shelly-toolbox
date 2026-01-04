# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification
<!-- chat-id: 4044b206-e3e9-447b-b888-c0da3eac5441 -->

**Completed**: Technical specification created at `spec.md`
- **Complexity Assessment**: Medium
- **Approach**: Single package with organized `src/` directories (server, client, shared)
- **Stack**: Node.js/TypeScript backend, React+Vite+Mantine frontend, tRPC for type-safe API
- **Package Manager**: pnpm with latest versions
- **Type Safety**: tRPC with end-to-end type inference, Zod for validation

---

### [x] Step: Repository Foundation & Tooling
<!-- chat-id: 10754730-15d2-45d7-b7a7-0858fbb2e2f8 -->

**Completed**: Repository foundation and tooling set up successfully
- Created `package.json` with all dependencies at latest versions
- Set up comprehensive `.gitignore` for Node.js, TypeScript, build artifacts
- Configured `tsconfig.json` with path aliases (`@/shared/*`, etc.)
- Set up ESLint (flat config) and Prettier configurations
- Created basic `README.md` with project overview
- Created directory structure: `src/server/`, `src/client/`, `src/shared/`, `public/`

**Verification**:
- ✅ `pnpm install` completed successfully (304 packages installed)
- ✅ Directory structure matches spec

---

### [x] Step: Shared Schemas
<!-- chat-id: 1a2ae3af-cbf7-4921-9b68-c2c7af8a11f0 -->

**Completed**: Shared Zod schemas and TypeScript types created successfully
- Created `src/shared/types.ts` with Zod v4 schemas:
  - DeviceCapabilitySchema with type enum and state
  - DeviceSchema with IP validation (IPv4/IPv6), ISO datetime, and capabilities array
  - DeviceCommandSchema with optional parameters record
  - Exported inferred TypeScript types (Device, DeviceCapability, DeviceCommand)
- Created `src/shared/constants.ts` with shared constants:
  - Server ports (SERVER_PORT, VITE_DEV_PORT)
  - Device types constants
  - Timeout and interval settings

**Verification**:
- ✅ Files exist and export correct schemas and types
- ✅ TypeScript type checking passes without errors
- ✅ Zod v4 schemas properly configured with union for IP addresses and ISO datetime

**References**: See `spec.md` - Data Model / API / Interface Changes

---

### [x] Step: Backend Server Setup
<!-- chat-id: 7ffed81a-9df1-4ab0-a449-bc47e943a2c1 -->

**Completed**: Backend server with tRPC router and WebSocket support set up successfully
- Created `src/server/context.ts` - tRPC context factory with minimal setup
- Created `src/server/trpc.ts` - tRPC router with:
  - Mutations: `controlDevice`, `discoverDevices`
  - Subscriptions: `onDevices`, `onDeviceUpdate`, `onDeviceDiscovered` (subscription-first architecture)
- Created `src/server/services/shellyService.ts` - Stub service with EventEmitter:
  - Maintains mock device state (3 sample devices)
  - Emits `devicesChanged` when full list changes
  - Emits `deviceUpdate` for individual device updates
  - Emits `deviceDiscovered` for new devices
  - Provides initial data immediately on subscription
- Created `src/server/index.ts` - Express server with:
  - WebSocket handler using `applyWSSHandler` for subscriptions
  - Development mode: Proxies to Vite dev server (port 5173)
  - Production mode: Serves static files from dist/client
  - Graceful shutdown handling
- Added `http-proxy-middleware` dependency for dev proxying
- Development scripts already configured in package.json (tsx, concurrently)

**Verification**:
- ✅ `pnpm run dev:server` starts server without errors (port 3001)
- ✅ WebSocket server listening correctly
- ✅ Development mode proxying configured
- ✅ TypeScript type checking passes
- ✅ ESLint passes without errors
- ✅ Server starts and displays correct messages

**References**: See `spec.md` - Implementation Approach section 3

---

### [x] Step: Frontend Application Setup
<!-- chat-id: 219f3b13-fec8-4cff-899f-4087c32b7dba -->

Set up the React frontend with Vite, Mantine, and tRPC client.

**Tasks**:
- Create `index.html` as Vite entry point
- Create `vite.config.ts` with path aliases and configuration
- Create `src/client/utils/trpc.ts` - tRPC React client setup with:
  - HTTP link for queries/mutations
  - WebSocket link for subscriptions
  - Split link to route between them
- Create `src/client/main.tsx` - React entry point with QueryClientProvider and tRPC provider
- Create `src/client/App.tsx` - Root component with Mantine provider
- Create `src/client/components/DeviceList.tsx` - Example component using tRPC hooks
- Configure Vite dev and build scripts in package.json

**Verification**:
- `pnpm run dev:vite` starts Vite dev server
- Application renders in browser with Mantine UI
- No TypeScript errors
- Mantine theme applies correctly
- tRPC client types are inferred from server router

**References**: See `spec.md` - Implementation Approach section 4

---

### [x] Step: tRPC Integration & Type Safety Testing
<!-- chat-id: 54d157cd-674c-48ba-82c9-620b0b6d8285 -->

Integrate and test end-to-end type-safe communication with tRPC (subscription-first).

**Tasks**:
- Implement `onDevices` subscription in DeviceList component (primary data source)
- Implement mutations (`controlDevice`, `discoverDevices`) with proper callbacks
- Test that subscriptions receive initial data immediately
- Test that mutations trigger subscription updates automatically
- Verify type inference by modifying router procedure and seeing errors in client
- Add error handling and loading states in components
- Test connection state handling (disconnection/reconnection)

**Verification**:
- Start both with `pnpm run dev` (or separately: `pnpm run dev:vite` and `pnpm run dev:server`)
- Access application at localhost:3001 (backend proxies to frontend)
- Device list appears immediately via `onDevices` subscription
- Device list updates reactively when backend state changes
- Mutations execute successfully
- Executing mutation causes subscription to emit updated data
- WebSocket connection established (check DevTools Network tab)
- No CORS errors
- Modifying procedure types in `src/server/trpc.ts` causes immediate TypeScript errors in client
- All tRPC operations are fully typed (autocomplete works)

**References**: See `spec.md` - Type-Safe Communication with tRPC section

---

### [x] Step: Final Verification & Documentation
<!-- chat-id: 2611d13f-1900-4f66-9102-8543903227fc -->

Ensure everything works together and documentation is complete.

**Tasks**:
- Run full build process (`pnpm run build`)
- Run type checking (`pnpm run typecheck`)
- Run linting (`pnpm run lint`)
- Test complete workflow: start server, start client, verify WebSocket connection
- Update README.md with:
  - Installation instructions (`pnpm install`)
  - Development workflow
  - Available scripts
  - Project structure explanation
- Verify all dependencies are at latest versions

**Verification**:
- All build scripts succeed
- TypeScript has no errors
- Linting passes
- README accurately describes setup and usage
- Manual testing checklist from spec.md is complete

---

### [ ] Step: Implementation Report

Document what was implemented and any challenges encountered.

**Tasks**:
- Write `{@artifacts_path}/report.md` with:
  - Summary of implemented features
  - Testing approach used
  - Challenges encountered and solutions
  - Known limitations or future improvements
  - Any deviations from original spec
