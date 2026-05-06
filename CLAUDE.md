# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shelly Toolbox is a TypeScript full-stack application for managing local Shelly smart home devices. It combines a React frontend with a Node.js/Express backend, using tRPC for end-to-end type-safe RPC.

## Device Support

Going forward, only the Shelly Gen2 API is supported. Do not add or maintain code paths for Gen1 devices.

## Workflow

**IMPORTANT**: Always use `/commit` to create a git commit after finishing any task (feature implementation, bug fix, refactoring, etc.).

## Commands

```bash
# Development (runs frontend on :38732 and backend on :38731 concurrently)
pnpm run dev

# Individual servers
pnpm run dev:vite       # Frontend only
pnpm run dev:server     # Backend only

# Build and production
pnpm run build          # TypeScript compile + Vite build
pnpm run start          # Production server

# Code quality
pnpm run typecheck      # TypeScript type checking
pnpm run lint           # ESLint
pnpm run lint:fix       # ESLint with auto-fix
pnpm run format         # Prettier
```

## Architecture

```
src/
├── server/           # Express + tRPC backend
│   ├── index.ts      # Server entry, WebSocket setup
│   ├── trpc.ts       # tRPC router & procedures
│   ├── context.ts    # tRPC context factory
│   └── services/
│       └── shellyService.ts  # Device state singleton (EventEmitter)
├── client/           # React frontend
│   ├── App.tsx       # Root component
│   ├── components/   # React components
│   ├── hooks/        # Custom hooks
│   └── utils/trpc.ts # tRPC client setup
└── shared/           # Shared between client/server
    ├── types.ts      # Zod schemas + inferred TypeScript types
    └── constants.ts  # Ports, timeouts
```

**Key Patterns:**
- **tRPC** provides automatic type inference from backend to frontend - types defined once in router, consumed in React
- **ShellyService** is a singleton EventEmitter that manages device state and emits events for real-time updates
- **Dual transport**: WebSocket for subscriptions, HTTP for mutations
- **Path aliases**: `@/server/*`, `@/client/*`, `@/shared/*` (configured in tsconfig.json)

## Tech Stack

- **Backend**: Express, tRPC, WebSocket (ws library), Zod
- **Frontend**: React, Vite, Mantine UI, React Query, tRPC React
- **Package manager**: pnpm

## Testing

No automated testing framework. Manual testing via browser at http://localhost:38731.
