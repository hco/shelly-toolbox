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
- **Approach**: Monorepo with workspaces (backend, frontend, shared)
- **Stack**: Node.js/TypeScript backend, React+Vite+Mantine frontend, Socket.io for WebSocket
- **Type Safety**: Shared TypeScript types package for frontend/backend communication

---

### [ ] Step: Repository Foundation & Tooling

Set up the basic repository structure and development tooling.

**Tasks**:
- Create root `package.json` with workspace configuration
- Set up comprehensive `.gitignore` for Node.js, TypeScript, build artifacts
- Configure base `tsconfig.base.json` for all packages
- Set up ESLint and Prettier configurations
- Create basic `README.md` with project overview

**Verification**:
- `npm install` completes successfully
- Directory structure matches spec

---

### [ ] Step: Shared Types Package

Create the shared package for TypeScript types and utilities.

**Tasks**:
- Initialize `packages/shared` package
- Define WebSocket event type interfaces (ServerToClientEvents, ClientToServerEvents)
- Define Device and related data models
- Configure TypeScript for dual compilation if needed
- Export all types through main index

**Verification**:
- Package builds without TypeScript errors
- Types are properly exported

**References**: See `spec.md` - Data Model / API / Interface Changes

---

### [ ] Step: Backend Package Setup

Set up the Node.js backend server with WebSocket support.

**Tasks**:
- Initialize `packages/backend` with TypeScript configuration
- Install dependencies (express, socket.io, ts-node-dev, etc.)
- Create HTTP server with Express
- Set up Socket.io server with type-safe event handlers using shared types
- Implement basic WebSocket handlers (getDevices, controlDevice stubs)
- Create stub Shelly service for future device management
- Configure development and build scripts

**Verification**:
- `npm run dev:backend` starts server without errors
- WebSocket server listens on configured port
- TypeScript compilation succeeds
- Type safety works (changing shared types causes errors)

**References**: See `spec.md` - Implementation Approach section 3

---

### [ ] Step: Frontend Package Setup

Set up the React frontend with Vite and Mantine.

**Tasks**:
- Initialize `packages/frontend` with Vite React-TypeScript template
- Install dependencies (react, mantine, socket.io-client, etc.)
- Configure Mantine provider in App.tsx
- Set up basic application structure
- Create WebSocket connection hook using shared types
- Implement example DeviceList component
- Configure Vite for development and production

**Verification**:
- `npm run dev:frontend` starts Vite dev server
- Application renders in browser with Mantine UI
- No TypeScript errors
- Mantine theme applies correctly

**References**: See `spec.md` - Implementation Approach section 4

---

### [ ] Step: WebSocket Integration & Type Safety

Integrate WebSocket communication between frontend and backend with full type safety.

**Tasks**:
- Verify Socket.io client connects to server
- Implement type-safe event emitters/listeners on both sides
- Test bidirectional communication with sample events
- Add connection state management in frontend
- Add error handling for WebSocket events

**Verification**:
- Start both frontend and backend
- WebSocket connection establishes (check browser console)
- Can send test messages from frontend to backend
- Backend can broadcast to connected clients
- Modifying shared types causes TypeScript errors in both packages

**References**: See `spec.md` - Type-Safe WebSocket Communication section

---

### [ ] Step: Final Verification & Documentation

Ensure everything works together and documentation is complete.

**Tasks**:
- Run full build process (`npm run build`)
- Run type checking across all packages (`npm run typecheck`)
- Run linting (`npm run lint`)
- Test complete workflow: start backend, start frontend, verify connection
- Update README.md with:
  - Installation instructions
  - Development workflow
  - Build commands
  - Project structure explanation
- Create `.env.example` files where needed

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
