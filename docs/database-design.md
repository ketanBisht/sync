# SYNC – Database Design

## Overview

SYNC uses **SQLite via `expo-sqlite`** for all local data persistence on the Android device. SQLite was chosen because:

- It is embedded — no server process, no network dependency.
- `expo-sqlite` provides a stable, SDK-compatible async API.
- It supports WAL (Write-Ahead Logging) mode for concurrent read performance.
- The entire database is a single file, making backup and migration straightforward.

The database is initialized at application startup. If the database file does not exist, it is created and all tables are provisioned.

---

## Schema

### `devices`

Tracks all SYNC devices encountered via BLE.

```sql
CREATE TABLE IF NOT EXISTS devices (
  device_id         TEXT PRIMARY KEY,            -- UUID
  public_key        TEXT,                        -- Reserved: future identity verification
  device_name       TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,               -- ISO 8601
  battery_level     INTEGER,                     -- 0–100, nullable
  connection_status TEXT NOT NULL DEFAULT 'unknown',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_connection_status ON devices (connection_status);
```

---

### `incidents`

Stores emergency incident reports created locally or received from peers.

```sql
CREATE TABLE IF NOT EXISTS incidents (
  incident_id  TEXT PRIMARY KEY,                 -- UUID
  category     TEXT NOT NULL,
  severity     TEXT NOT NULL,
  description  TEXT NOT NULL,
  latitude     REAL,                             -- WGS-84 decimal degrees, nullable
  longitude    REAL,
  created_at   TEXT NOT NULL,                    -- ISO 8601, set by originator
  updated_at   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  reporter_id  TEXT NOT NULL,                    -- References devices.device_id
  FOREIGN KEY (reporter_id) REFERENCES devices (device_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_incidents_status    ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity  ON incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created   ON incidents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter  ON incidents (reporter_id);
```

---

### `messages`

Stores all messages — locally created and received from peers — along with routing metadata.

```sql
CREATE TABLE IF NOT EXISTS messages (
  message_id     TEXT PRIMARY KEY,               -- UUID
  incident_id    TEXT,                           -- Nullable FK to incidents
  sender_id      TEXT NOT NULL,                  -- References devices.device_id
  recipient_id   TEXT,                           -- Nullable: broadcast if NULL
  payload        TEXT NOT NULL,                  -- JSON string
  priority       TEXT NOT NULL DEFAULT 'normal',
  created_at     TEXT NOT NULL,                  -- Set by originator
  expires_at     TEXT NOT NULL,                  -- Wall-clock TTL
  hop_count      INTEGER NOT NULL DEFAULT 0,
  max_hops       INTEGER NOT NULL DEFAULT 10,
  message_status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (incident_id) REFERENCES incidents (incident_id) ON DELETE SET NULL,
  FOREIGN KEY (sender_id)   REFERENCES devices   (device_id)   ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_messages_incident   ON messages (incident_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender     ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_status     ON messages (message_status);
CREATE INDEX IF NOT EXISTS idx_messages_expires    ON messages (expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_priority   ON messages (priority, created_at DESC);
```

---

### `incident_events`

Append-only audit log of all changes applied to incidents. Supports last-write-wins conflict resolution across devices.

```sql
CREATE TABLE IF NOT EXISTS incident_events (
  event_id    TEXT PRIMARY KEY,                  -- UUID
  incident_id TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  actor_id    TEXT NOT NULL,                     -- Device UUID that generated the event
  timestamp   TEXT NOT NULL,                     -- ISO 8601
  payload     TEXT NOT NULL,                     -- JSON string
  FOREIGN KEY (incident_id) REFERENCES incidents (incident_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id)    REFERENCES devices   (device_id)   ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_events_incident  ON incident_events (incident_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_events_actor     ON incident_events (actor_id);
CREATE INDEX IF NOT EXISTS idx_events_type      ON incident_events (event_type);
```

---

### `message_receipts`

Tracks which devices have received, forwarded, or delivered each message. Used for deduplication and delivery confirmation.

```sql
CREATE TABLE IF NOT EXISTS message_receipts (
  receipt_id   TEXT PRIMARY KEY,                 -- UUID
  message_id   TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  receipt_type TEXT NOT NULL,                    -- 'received' | 'forwarded' | 'delivered'
  timestamp    TEXT NOT NULL,                    -- ISO 8601
  FOREIGN KEY (message_id) REFERENCES messages (message_id) ON DELETE CASCADE,
  FOREIGN KEY (device_id)  REFERENCES devices  (device_id)  ON DELETE RESTRICT,
  UNIQUE (message_id, device_id, receipt_type)  -- Prevent duplicate receipt records
);

CREATE INDEX IF NOT EXISTS idx_receipts_message ON message_receipts (message_id);
CREATE INDEX IF NOT EXISTS idx_receipts_device  ON message_receipts (device_id);
```

---

### `sync_queue`

Holds locally created or modified records waiting to be uploaded to the backend when internet connectivity becomes available.

```sql
CREATE TABLE IF NOT EXISTS sync_queue (
  queue_id        TEXT PRIMARY KEY,              -- UUID
  entity_type     TEXT NOT NULL,                 -- 'incident' | 'message' | 'incident_event' | 'message_receipt'
  entity_id       TEXT NOT NULL,
  payload         TEXT NOT NULL,                 -- JSON snapshot at time of queuing
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_attempt_at TEXT,
  attempt_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sync_status   ON sync_queue (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_sync_entity   ON sync_queue (entity_type, entity_id);
```

---

## Relationships

```
devices ──< incidents (reporter_id)
devices ──< messages  (sender_id)
devices ──< incident_events (actor_id)
devices ──< message_receipts (device_id)
incidents ──< messages (incident_id, nullable)
incidents ──< incident_events (incident_id)
messages  ──< message_receipts (message_id)
```

---

## Indexing Decisions

| Index | Rationale |
|-------|-----------|
| `devices.last_seen_at` | Most-recently-seen devices are shown first in peer lists |
| `incidents.status` | Most queries filter by active/resolved status |
| `incidents.created_at` | Incident feed is sorted by creation time |
| `messages.expires_at` | A periodic cleanup job queries for expired messages |
| `messages.priority, created_at` | High-priority messages are forwarded first |
| `message_receipts (message_id, device_id, receipt_type)` UNIQUE | Prevents double-counting receipts |
| `sync_queue.status, created_at` | Sync service processes oldest pending entries first |

---

## Offline Persistence Strategy

1. **Write-Ahead Logging (WAL)**: SQLite WAL mode is enabled at database initialization to allow concurrent reads during writes.
2. **Atomic transactions**: Multi-table writes (e.g., creating an incident AND queueing it for sync) are wrapped in a transaction to prevent partial writes on crash.
3. **TTL cleanup**: A background job runs at application startup and periodically to delete messages where `expires_at < now()` and their associated receipts.
4. **No lazy loading**: All reads return complete records. The data model is small enough in Phase 1 that this is not a concern.
5. **Future sync**: When internet connectivity is detected, the sync service reads `sync_queue WHERE status = 'pending' ORDER BY created_at ASC` and POSTs each record to the backend in order. Successful uploads update `status = 'synced'`.
