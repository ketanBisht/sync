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

## Current Project Status: Phase 2 Complete

- ✅ **Phase 1**: Monorepo foundation, data models, Zod validation schemas, SQLite persistence schema, 5 technical documents, and 42 unit tests.
- ✅ **Phase 2**: Native Kotlin Android BLE Communication Engine (`modules/sync-ble`), GATT server/client managers, MTU negotiation, sequential chunk framing/reassembly (`bleFramer`), transactional persistence with deduplication, ACK handshakes, 3 testing screens (Discovery, Messaging, Diagnostics), and 55 unit tests.

---

## Testing on Two Physical Android Devices (Phase 2 Prototype)

To test offline BLE communication between two physical Android devices:

### 1. Build and Install Development Build
Ensure Android Studio / Android SDK is configured with ADB connected:
```bash
# In apps/mobile, generate native project and install on connected device:
cd apps/mobile
npx expo run:android
```
Install the resulting build onto **both Device A and Device B**.

### 2. Configure Pure Offline Environment
- Put **both Device A and Device B into Flight Mode** (Airplane Mode).
- Re-enable **Bluetooth** only on both devices.
- Verify Wi-Fi and Mobile Data are **completely disabled**.

### 3. Step-by-Step Test Procedure
1. **Device A (Peripheral)**:
   - Open SYNC app -> Navigate to **Discovery** tab.
   - Tap **"Start Advertising"**.
   - Note the Node UUID displayed on screen.
2. **Device B (Central)**:
   - Open SYNC app -> Navigate to **Discovery** tab.
   - Tap **"Start Scanning"**.
   - Within 2–5 seconds, Device A will appear in the **Discovered SYNC Peers** list with RSSI and Node UUID.
   - Tap **"Connect"** next to Device A.
   - Both devices will transition to **CONNECTED** status, negotiate MTU (up to 512 bytes), and discover characteristics.
3. **Message Dispatch & Persistence (B → A)**:
   - On Device B, switch to the **Messaging** tab.
   - Device A is auto-selected as target peer.
   - Select preset **"SOS Medical"** or type a message, then tap **"Dispatch Emergency Message via BLE"**.
   - Device B chunks payload, writes sequentially to Device A, and awaits ACK.
   - Device A reassembles chunks, verifies against Zod schema, checks for duplicates, and commits to SQLite.
   - Device A sends back an ACK receipt. Device B displays **"Message transferred and acknowledged by peer!"**.
4. **Reverse Transfer (A → B)**:
   - Repeat the messaging flow from Device A to Device B.
5. **Duplicate Rejection Verification**:
   - Resend the exact same message.
   - Receiving device detects existing `message_id`, increments **"Duplicates Rejected"** counter on Diagnostics tab, and does not insert duplicate.
6. **Persistence Across Restart**:
   - Force-close the app on Device A and reopen it.
   - All received emergency messages remain intact in SQLite.

---

## License

MIT
