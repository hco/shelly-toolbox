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
- **Stack**: Node.js/TypeScript backend, React+Vite+Mantine frontend, Socket.io for WebSocket
- **Package Manager**: pnpm with latest versions
- **Type Safety**: Shared TypeScript types in `src/shared/` for frontend/backend communication

---

### [ ] Step: Repository Foundation & Tooling

Set up the basic repository structure and development tooling.

**Tasks**:
- Create `package.json` with all dependencies (using `@latest`)
- Set up comprehensive `.gitignore` for Node.js, TypeScript, build artifacts
- Configure `tsconfig.json` with path aliases (`@/shared/*`, etc.)
- Set up ESLint (flat config) and Prettier configurations
- Create basic `README.md` with project overview
- Create directory structure: `src/server/`, `src/client/`, `src/shared/`, `public/`

**Verification**:
- `pnpm install` completes successfully
- Directory structure matches spec

---

### [ ] Step: Shared Types

Create shared TypeScript types for communication.

**Tasks**:
- Create `src/shared/websocket.ts` with event interfaces (ServerToClientEvents, ClientToServerEvents)
- Create `src/shared/types.ts` with Device and related data models
- Create `src/shared/constants.ts` with shared constants

**Verification**:
- Files exist and export correct types
- No TypeScript errors

**References**: See `spec.md` - Data Model / API / Interface Changes

---

### [ ] Step: Backend Server Setup

Set up the Node.js backend server with WebSocket support and frontend serving.

**Tasks**:
- Create `src/server/index.ts` - Express HTTP server + Socket.io setup
- Add frontend serving logic:
  - Production: Serve static files from `dist/` folder
  - Development: Proxy to Vite dev server (http://localhost:5173) using `http-proxy-middleware`
- Create `src/server/websocket.ts` - WebSocket event handlers using shared types
- Create `src/server/services/shellyService.ts` - Stub service for device management
- Configure development script (tsx or ts-node-dev) in package.json
- Add `concurrently` to run both Vite and server with single `dev` command

**Verification**:
- `pnpm run dev:server` starts server without errors (port 3001)
- `pnpm run dev` starts both Vite and server
- Accessing localhost:3001 shows proxied Vite dev server
- WebSocket server listens correctly
- No CORS errors in browser console
- Type safety works (changing shared types causes errors)

**References**: See `spec.md` - Implementation Approach section 3

---

### [ ] Step: Frontend Application Setup

Set up the React frontend with Vite and Mantine.

**Tasks**:
- Create `index.html` as Vite entry point
- Create `vite.config.ts` with path aliases and configuration
- Create `src/client/main.tsx` - React entry point
- Create `src/client/App.tsx` - Root component with Mantine provider
- Create `src/client/hooks/useWebSocket.ts` - WebSocket connection hook
- Create `src/client/components/DeviceList.tsx` - Example component
- Configure Vite dev and build scripts in package.json

**Verification**:
- `pnpm run dev` or `pnpm run dev:client` starts Vite dev server
- Application renders in browser with Mantine UI
- No TypeScript errors
- Mantine theme applies correctly

**References**: See `spec.md` - Implementation Approach section 4

---

### [ ] Step: WebSocket Integration & Type Safety

Integrate WebSocket communication between frontend and backend with full type safety.

**Tasks**:
- Implement Socket.io server event handlers in `src/server/websocket.ts`
- Implement Socket.io client connection in `src/client/hooks/useWebSocket.ts`
- Test bidirectional communication with sample events
- Add connection state management in frontend hook
- Add error handling for WebSocket events

**Verification**:
- Start both with `pnpm run dev` (or separately: `pnpm run dev:vite` and `pnpm run dev:server`)
- Access application at localhost:3001 (backend proxies to frontend)
- WebSocket connection establishes (check browser console)
- Can send test messages from frontend to backend
- Backend can broadcast to connected clients
- No CORS errors
- Modifying `src/shared/websocket.ts` causes TypeScript errors in both client and server

**References**: See `spec.md` - Type-Safe WebSocket Communication section

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
