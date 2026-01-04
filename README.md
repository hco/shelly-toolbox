# Shelly Toolbox

A TypeScript-based tool for managing local Shelly smart home devices with a modern React frontend.

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

## Manual Testing

- Run `pnpm run dev` and open `http://localhost:3001` in a browser.
- Verify that the initial list of Shelly devices appears.
- Trigger device actions from the UI and confirm that the list updates in real time.
- Check your browser DevTools Network/WebSocket tab to confirm a WebSocket connection to `/trpc` is established and stays connected.
