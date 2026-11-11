# SYNC – System Overview

## Problem Statement

Natural disasters, mass-casualty events, and civil emergencies routinely overload or destroy centralized communication infrastructure. When cell towers fail, internet connectivity drops, or power grids go down, first responders and affected communities lose the ability to coordinate effectively. Existing emergency communication solutions — radio networks, satellite phones, mobile apps — either require dedicated hardware, centralized infrastructure, or trained operators.

SYNC addresses this gap by turning ordinary Android smartphones into self-organizing emergency coordination nodes that communicate directly with each other over Bluetooth Low Energy (BLE), without requiring any internet connection or central server.

---

## Project Objectives

1. **Offline-first emergency reporting**: Allow any device to create and share structured emergency reports independently of internet connectivity.
2. **Device-to-device communication**: Exchange incident data between nearby Android devices over BLE without infrastructure.
3. **Store-carry-forward mesh**: Enable messages to reach distant devices through intermediate relay devices, even when no direct connection exists.
4. **Incident tracking**: Maintain a local timeline of emergency events and status updates.
5. **Resource coordination**: Facilitate volunteer and resource assignment in a disconnected environment.
6. **Opportunistic backend sync**: Upload locally stored data to a central server automatically when connectivity is restored.

---

## Main Features

### Phase 1 (This Phase — Foundation)
- Monorepo project structure
- Shared TypeScript data models and Zod validation schemas
- Local SQLite database for offline persistence
- Expo Router mobile application shell

### Phase 2 (Planned — BLE Communication Engine)
- BLE device discovery and advertising
- GATT-based message exchange
- Store-carry-forward relay
- Message deduplication and TTL enforcement

### Phase 3 (Planned — Incident Management UI)
- Incident creation and viewing screens
- Real-time local incident feed
- Status update workflow

### Phase 4 (Planned — Backend Integration)
- NestJS REST API
- PostgreSQL with Prisma ORM
- Conflict-resolution sync protocol
- Incident verification and duplicate detection

### Phase 5 (Planned — Advanced Features)
- Volunteer dashboard
- Map-based incident visualization
- AI-assisted incident classification
- LoRa or Wi-Fi Direct as alternative transports

---

## Scope

### In Scope
- Android-first mobile application (React Native / Expo)
- BLE-based device-to-device communication
- Local SQLite persistence
- Offline-first architecture
- Structured incident and message data models
- Store-carry-forward message routing

### Out of Scope
- iOS support (not targeted in Phase 1–2)
- Web application
- Real-time server-side processing
- Authentication and user accounts (Phase 1)
- End-to-end encryption (reserved — key infrastructure defined but not implemented)

---

## Functional Requirements

| ID   | Requirement |
|------|-------------|
| FR-1 | A device SHALL be able to create an incident report without internet connectivity |
| FR-2 | A device SHALL discover nearby SYNC devices via BLE advertising |
| FR-3 | Two devices in BLE range SHALL be able to exchange message inventories |
| FR-4 | A device SHALL store received messages locally and forward them to subsequent peers |
| FR-5 | Messages SHALL expire after a configurable wall-clock TTL |
| FR-6 | Messages SHALL not be forwarded beyond their configured maximum hop count |
| FR-7 | A device SHALL detect and deduplicate messages it has already received |
| FR-8 | The application SHALL initialize and maintain a local SQLite database |
| FR-9 | Locally created data SHALL be queued for eventual backend synchronization |
| FR-10 | The application SHALL operate fully without network connectivity |

---

## Non-Functional Requirements

| ID    | Requirement |
|-------|-------------|
| NFR-1 | The application SHOULD function on Android 10 (API 29) and above |
| NFR-2 | BLE scanning SHOULD NOT drain battery faster than 15% per hour under typical use |
| NFR-3 | Message exchange between two devices SHOULD complete within 5 seconds |
| NFR-4 | The local database SHOULD handle at least 10,000 incident records without performance degradation |
| NFR-5 | The application SHOULD degrade gracefully when BLE hardware is unavailable |
| NFR-6 | All data persisted locally SHOULD survive application restarts |
| NFR-7 | The codebase SHALL pass TypeScript strict-mode type checking |
| NFR-8 | Critical data paths SHALL have unit test coverage |
