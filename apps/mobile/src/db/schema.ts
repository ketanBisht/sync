/**
 * SYNC – SQLite Schema Definitions
 *
 * This file contains the SQL DDL statements executed at database initialization.
 * Tables are created with IF NOT EXISTS so this is safe to run on every app startup.
 *
 * All timestamps are stored as ISO 8601 strings (TEXT).
 * SQLite does not have a native datetime type; TEXT is the conventional choice
 * and allows lexicographic sorting of ISO 8601 formatted dates.
 *
 * Foreign key enforcement requires PRAGMA foreign_keys = ON (enabled in database.ts).
 */

export const CREATE_DEVICES_TABLE = `
  CREATE TABLE IF NOT EXISTS devices (
    device_id         TEXT PRIMARY KEY,
    public_key        TEXT,
    device_name       TEXT NOT NULL,
    last_seen_at      TEXT NOT NULL,
    battery_level     INTEGER,
    connection_status TEXT NOT NULL DEFAULT 'unknown',
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
` as const;

export const CREATE_DEVICES_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices (last_seen_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_devices_connection_status ON devices (connection_status);`,
] as const;

// ---------------------------------------------------------------------------

export const CREATE_INCIDENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS incidents (
    incident_id  TEXT PRIMARY KEY,
    category     TEXT NOT NULL,
    severity     TEXT NOT NULL,
    description  TEXT NOT NULL,
    latitude     REAL,
    longitude    REAL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'active',
    reporter_id  TEXT NOT NULL,
    FOREIGN KEY (reporter_id) REFERENCES devices (device_id) ON DELETE RESTRICT
  );
` as const;

export const CREATE_INCIDENTS_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_incidents_status   ON incidents (status);`,
  `CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents (severity);`,
  `CREATE INDEX IF NOT EXISTS idx_incidents_created  ON incidents (created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents (reporter_id);`,
] as const;

// ---------------------------------------------------------------------------

export const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    message_id     TEXT PRIMARY KEY,
    incident_id    TEXT,
    sender_id      TEXT NOT NULL,
    recipient_id   TEXT,
    payload        TEXT NOT NULL,
    priority       TEXT NOT NULL DEFAULT 'normal',
    created_at     TEXT NOT NULL,
    expires_at     TEXT NOT NULL,
    hop_count      INTEGER NOT NULL DEFAULT 0,
    max_hops       INTEGER NOT NULL DEFAULT 10,
    message_status TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (incident_id) REFERENCES incidents (incident_id) ON DELETE SET NULL,
    FOREIGN KEY (sender_id)   REFERENCES devices   (device_id)   ON DELETE RESTRICT
  );
` as const;

export const CREATE_MESSAGES_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_messages_incident ON messages (incident_id);`,
  `CREATE INDEX IF NOT EXISTS idx_messages_sender   ON messages (sender_id);`,
  `CREATE INDEX IF NOT EXISTS idx_messages_status   ON messages (message_status);`,
  `CREATE INDEX IF NOT EXISTS idx_messages_expires  ON messages (expires_at);`,
  `CREATE INDEX IF NOT EXISTS idx_messages_priority ON messages (priority, created_at DESC);`,
] as const;

// ---------------------------------------------------------------------------

export const CREATE_INCIDENT_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS incident_events (
    event_id    TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    actor_id    TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    payload     TEXT NOT NULL,
    FOREIGN KEY (incident_id) REFERENCES incidents (incident_id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id)    REFERENCES devices   (device_id)   ON DELETE RESTRICT
  );
` as const;

export const CREATE_INCIDENT_EVENTS_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_events_incident ON incident_events (incident_id, timestamp ASC);`,
  `CREATE INDEX IF NOT EXISTS idx_events_actor    ON incident_events (actor_id);`,
  `CREATE INDEX IF NOT EXISTS idx_events_type     ON incident_events (event_type);`,
] as const;

// ---------------------------------------------------------------------------

export const CREATE_MESSAGE_RECEIPTS_TABLE = `
  CREATE TABLE IF NOT EXISTS message_receipts (
    receipt_id   TEXT PRIMARY KEY,
    message_id   TEXT NOT NULL,
    device_id    TEXT NOT NULL,
    receipt_type TEXT NOT NULL,
    timestamp    TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages (message_id) ON DELETE CASCADE,
    FOREIGN KEY (device_id)  REFERENCES devices  (device_id)  ON DELETE RESTRICT,
    UNIQUE (message_id, device_id, receipt_type)
  );
` as const;

export const CREATE_MESSAGE_RECEIPTS_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_receipts_message ON message_receipts (message_id);`,
  `CREATE INDEX IF NOT EXISTS idx_receipts_device  ON message_receipts (device_id);`,
] as const;

// ---------------------------------------------------------------------------

export const CREATE_SYNC_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_queue (
    queue_id        TEXT PRIMARY KEY,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    payload         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_attempt_at TEXT,
    attempt_count   INTEGER NOT NULL DEFAULT 0
  );
` as const;

export const CREATE_SYNC_QUEUE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue (status, created_at ASC);`,
  `CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_queue (entity_type, entity_id);`,
] as const;

// ---------------------------------------------------------------------------

/** All DDL statements in initialization order */
export const ALL_SCHEMA_STATEMENTS: readonly string[] = [
  CREATE_DEVICES_TABLE,
  ...CREATE_DEVICES_INDEXES,
  CREATE_INCIDENTS_TABLE,
  ...CREATE_INCIDENTS_INDEXES,
  CREATE_MESSAGES_TABLE,
  ...CREATE_MESSAGES_INDEXES,
  CREATE_INCIDENT_EVENTS_TABLE,
  ...CREATE_INCIDENT_EVENTS_INDEXES,
  CREATE_MESSAGE_RECEIPTS_TABLE,
  ...CREATE_MESSAGE_RECEIPTS_INDEXES,
  CREATE_SYNC_QUEUE_TABLE,
  ...CREATE_SYNC_QUEUE_INDEXES,
];

