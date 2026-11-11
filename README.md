# SYNC – Offline-First Emergency Coordination System

SYNC is an **offline-first, distributed emergency reporting and resource coordination system** designed to work without centralized internet connectivity. Nearby Android devices exchange emergency information directly over Bluetooth Low Energy (BLE) using a store-carry-forward mesh approach.

---

## Monorepo Structure

```
SYNC/
├── apps/
│   ├── mobile/          → Expo (React Native) Android application
│   └── backend/         → Reserved for future NestJS implementation
├── packages/
│   └── shared/          → Shared TypeScript types, Zod schemas, constants
├── simulation/          → Reserved for future BLE/network simulation
├── docs/                → Architecture and protocol documentation
├── package.json         → Workspace root (npm workspaces)
└── README.md
```

---

## Prerequisites

| Tool        | Version       |
|-------------|---------------|
| Node.js     | ≥ 20          |
| npm         | ≥ 10          |
| Expo CLI    | Installed via `npx expo` |
| Android SDK | For Android builds |

---

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd SYNC

# Install all workspace dependencies from the monorepo root
npm install

# Build the shared package (must be done before running mobile)
npm run shared:build
```

---

## Running the Mobile Application

```bash
# Start the Expo development server
npm run mobile

# Open on a connected Android device or emulator
npm run mobile:android

# Open on iOS simulator (macOS only)
npm run mobile:ios
```

---

## Running Tests

```bash
# Run shared package unit tests (Zod schema + type validation)
npm run shared:test
```

---

## Linting & Type Checking

```bash
# Lint the mobile app
npm run lint

# Type-check all packages
npm run typecheck
```

---

## Package Manager Decision

**npm workspaces** was chosen because:
- The project already uses npm (from initial Expo scaffold).
- npm workspaces (since npm 7) provide first-class monorepo support with zero extra tooling.
- Avoids the complexity of Turborepo, Nx, or Lerna for a Phase 1 foundation.
- Simple `--workspace` flag delegates commands to individual packages.

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/system-overview.md`](docs/system-overview.md) | Problem statement, objectives, and requirements |
| [`docs/architecture.md`](docs/architecture.md) | System and app architecture |
| [`docs/database-design.md`](docs/database-design.md) | SQLite schema and persistence strategy |
| [`docs/data-models.md`](docs/data-models.md) | TypeScript interfaces and Zod schemas |
| [`docs/ble-communication-protocol.md`](docs/ble-communication-protocol.md) | BLE protocol design |

---

## Phase 1 Scope

Phase 1 establishes:
- ✅ Monorepo foundation
- ✅ Shared TypeScript types and Zod validation schemas
- ✅ SQLite database initialization
- ✅ Expo Router application shell
- ✅ Technical documentation (5 documents)
- ✅ Unit tests for schemas

**Out of scope (future phases):** Actual BLE communication, authentication, maps, backend APIs, cloud sync.

---

## License

MIT
