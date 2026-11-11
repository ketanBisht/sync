# SYNC – System Architecture

## Overall Architecture

SYNC follows a **mobile-first, offline-first architecture** where the Android application is the primary system component. The backend is an optional enhancement — the system is fully functional without it.

```
┌─────────────────────────────────────────────────────────┐
│                    SYNC Mesh Network                      │
│                                                           │
│   ┌──────────┐    BLE     ┌──────────┐    BLE     ┌──────────┐
│   │ Device A │◄──────────►│ Device B │◄──────────►│ Device C │
│   │  (SYNC)  │            │  (SYNC)  │            │  (SYNC)  │
│   └──────────┘            └──────────┘            └──────────┘
│        │                        │                        │
│        └────────────────────────┴────────── When online: │
│                                             upload to     │
│                                       ┌──────────────┐   │
│                                       │ SYNC Backend  │   │
│                                       │  (NestJS +   │   │
│                                       │  PostgreSQL) │   │
│                                       └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key principle**: Device A and Device C can exchange data through Device B even if A and C are never in direct BLE range of each other. Device B stores messages and forwards them opportunistically.

---

## Mobile Application Architecture

The mobile application uses a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                     │
│         (Expo Router screens, React components)          │
├─────────────────────────────────────────────────────────┤
│                    Domain Layer                           │
│         (Business logic, state management hooks)         │
├─────────────────────────────────────────────────────────┤
│                    Data Layer                             │
│    ┌──────────────────┐   ┌──────────────────────────┐  │
│    │   SQLite Store    │   │    BLE Communication     │  │
│    │  (expo-sqlite)   │   │  (Phase 2 — Kotlin/RN)  │  │
│    └──────────────────┘   └──────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    Shared Package                         │
│         (@sync/shared — types, schemas, constants)       │
└─────────────────────────────────────────────────────────┘
```

### Directory Structure (apps/mobile/src/)

```
src/
├── app/                    # Expo Router screens (file-based routing)
│   ├── _layout.tsx         # Root layout and navigation shell
│   ├── index.tsx           # Home screen
│   └── explore.tsx         # Explore screen
├── components/             # Reusable UI components
├── constants/              # App-level constants and theme
├── db/                     # SQLite database layer
│   ├── schema.ts           # Table creation SQL
│   ├── database.ts         # Database initialization and connection
│   └── repositories/       # Data access objects per entity
├── hooks/                  # React hooks
└── services/               # Business logic services (BLE, sync, etc.)
```

---

## Offline-First Design

The offline-first design is built on three principles:

### 1. Local-First Storage
Every piece of data is written to SQLite before any network operation is attempted. The UI reads from the local database, never from the network directly.

### 2. Optimistic Local Operations
Creating an incident or sending a message succeeds immediately on the local device. The sync queue records what needs to be propagated — either over BLE to peers or over the internet to the backend.

### 3. Conflict Resolution Strategy
Because multiple devices can independently create or update the same incident, SYNC uses a **last-write-wins (LWW) CRDT** strategy based on timestamps in Phase 1. Each `IncidentEvent` is timestamped by the originating device. When merging events from peers, events are applied in chronological order. The most recent event per field wins.

> **Assumption**: Device clocks are approximately synchronized (within a few minutes). Clock drift is a known limitation documented in the BLE protocol spec. Future phases may implement vector clocks for more robust conflict resolution.

---

## Future Backend Integration

The backend (Phase 4) is intentionally decoupled. It will:
1. Accept uploads of locally queued entities from devices that come online.
2. Provide a consolidated view of incidents across all devices.
3. Push verified incident data back to devices during sync.

The `sync_queue` table in SQLite is the bridge between offline operation and backend sync. When connectivity is detected, the sync service processes entries in this queue in FIFO order, uploading to the backend REST API.

---

## Data Flow

### Creating an Incident (Offline)
```
User input → Validate (Zod) → Write to SQLite incidents table
                           → Write entry to sync_queue
                           → Update local UI
```

### Receiving a Message via BLE (Phase 2)
```
BLE GATT write → Parse payload → Validate (Zod) → Deduplicate check
              → Write to SQLite messages table  → Increment hop count
              → Write to message_receipts       → Queue for forwarding
```

### Backend Sync (Phase 4 — when online)
```
Network available → Read sync_queue (status = 'pending')
                 → POST to backend API
                 → On success: update sync_queue status = 'synced'
                 → On failure: increment attempt_count, exponential backoff
```
