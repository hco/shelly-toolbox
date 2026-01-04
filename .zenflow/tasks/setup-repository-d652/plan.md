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

### [ ] Step: Shared Schemas

Create shared Zod schemas and TypeScript types.

**Tasks**:
- Create `src/shared/types.ts` with Zod schemas (DeviceSchema, DeviceCommandSchema, etc.)
- Export TypeScript types inferred from Zod schemas
- Create `src/shared/constants.ts` with shared constants

**Verification**:
- Files exist and export correct schemas and types
- No TypeScript errors
- Zod schemas validate correctly

**References**: See `spec.md` - Data Model / API / Interface Changes

---

### [ ] Step: Backend Server Setup

Set up the Node.js backend server with tRPC router (subscription-first) and frontend serving.

**Tasks**:
- Create `src/server/trpc.ts` - tRPC router with:
  - Mutations: `controlDevice`, `discoverDevices`
  - Subscriptions: `onDevices` (primary data source), `onDeviceUpdate`, `onDeviceDiscovered`
  - Minimal queries (only if needed for non-reactive data)
- Create `src/server/context.ts` - tRPC context factory (can be minimal for now)
- Create `src/server/index.ts` - Express HTTP server with:
  - tRPC HTTP handler (for queries/mutations)
  - tRPC WebSocket handler using `applyWSSHandler` (for subscriptions)
  - Frontend serving (production) or proxy to Vite (development)
- Create `src/server/services/shellyService.ts` - Stub service with EventEmitter that:
  - Maintains device state
  - Emits `devicesChanged` when full list changes
  - Emits `deviceUpdate` for individual device updates
  - Provides initial data immediately on subscription
- Configure development script (tsx or ts-node-dev) in package.json
- Add `concurrently` to run both Vite and server with single `dev` command

**Verification**:
- `pnpm run dev:server` starts server without errors (port 3001)
- `pnpm run dev` starts both Vite and server
- Accessing localhost:3001 shows proxied Vite dev server
- tRPC HTTP endpoint responds
- tRPC WebSocket server listens correctly
- No CORS errors in browser console

**References**: See `spec.md` - Implementation Approach section 3

---

### [ ] Step: Frontend Application Setup

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

### [ ] Step: tRPC Integration & Type Safety Testing

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

### [ ] Step: Final Verification & Documentation

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
