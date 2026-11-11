# SYNC – Data Models

## Overview

SYNC defines its data models in the `@sync/shared` package as:
1. **TypeScript interfaces** — the source of truth for type safety across the codebase.
2. **Zod schemas** — runtime validation derived from the TypeScript interfaces, used at data boundaries (BLE receive, database read, user input).

The `satisfies z.ZodType<Interface>` pattern is used to enforce that each Zod schema matches its corresponding TypeScript interface at compile time.

---

## Entity: Device

Represents a physical device participating in the SYNC mesh.

```typescript
interface Device {
  deviceId: string;          // UUID v4
  publicKey: string | null;  // Reserved: future Ed25519 identity verification
  deviceName: string;        // 1–64 characters
  lastSeenAt: string;        // ISO 8601
  batteryLevel?: number;     // 0–100, integer, optional
  connectionStatus: 'connected' | 'disconnected' | 'nearby' | 'unknown';
}
```

**Design assumptions:**
- `deviceId` is generated once at first app launch and persisted. It is the device's stable identity within the mesh.
- `publicKey` is included now to avoid a schema migration later. No cryptographic operations use it in Phase 1.
- `deviceName` comes from the Android device name or a user-set nickname.

---

## Entity: Incident

The primary reporting unit. Captures an emergency event.

```typescript
interface Incident {
  incidentId: string;       // UUID v4
  category: IncidentCategory;
  severity: IncidentSeverity;
  description: string;      // 1–2000 characters
  latitude?: number;        // WGS-84, -90 to 90
  longitude?: number;       // WGS-84, -180 to 180
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
  status: IncidentStatus;
  reporterId: string;       // Device UUID of first reporter
}

type IncidentCategory = 'medical' | 'fire' | 'flood' | 'structural_collapse'
                      | 'missing_person' | 'resource_request' | 'security' | 'other';
type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
type IncidentStatus   = 'active' | 'resolved' | 'cancelled' | 'stale';
```

**Design assumptions:**
- Location is optional. Privacy-conscious users or those without GPS access can still file reports.
- `reporterId` is a device UUID, not a user account. SYNC is pseudonymous by design in Phase 1.
- `stale` status is applied automatically when a report has not been updated within a configurable window (future implementation).

---

## Entity: Message

The network transport unit for the store-carry-forward mesh.

```typescript
interface Message {
  messageId: string;        // UUID v4
  incidentId: string | null;// Optional link to an incident
  senderId: string;         // Device UUID of originator
  recipientId: string | null;// UUID for unicast, null for broadcast
  payload: string;          // JSON-encoded string
  priority: MessagePriority;
  createdAt: string;        // ISO 8601 — set by originator
  expiresAt: string;        // ISO 8601 — wall-clock TTL
  hopCount: number;         // Current relay count (0 at origin)
  maxHops: number;          // Maximum permitted relays (default: 10)
  messageStatus: MessageStatus;
}

type MessagePriority = 'low' | 'normal' | 'high' | 'critical';
type MessageStatus   = 'pending' | 'sent' | 'delivered' | 'failed' | 'expired';
```

**Design decisions:**
- `payload` is an opaque JSON string. Intermediate relay devices do not need to understand the payload to forward it. This keeps the routing layer generic and allows multiple payload schemas to coexist.
- `hopCount` / `maxHops` provide a network-layer TTL independent of the wall-clock `expiresAt`. Both must pass for a message to be forwarded.
- Broadcast messages (`recipientId = null`) are forwarded by every relay device that hasn't seen them yet.

---

## Entity: IncidentEvent

Append-only audit log entry for an incident. Supports event-sourcing and LWW conflict resolution.

```typescript
interface IncidentEvent {
  eventId: string;          // UUID v4
  incidentId: string;       // References Incident
  eventType: IncidentEventType;
  actorId: string;          // Device UUID
  timestamp: string;        // ISO 8601 — when the event occurred
  payload: string;          // JSON string with event-specific data
}

type IncidentEventType = 'created' | 'status_changed' | 'severity_updated'
                       | 'description_updated' | 'location_added'
                       | 'resource_assigned' | 'comment_added';
```

**Design assumptions:**
- Events are never deleted or modified. This ensures a complete audit trail.
- Conflict resolution: when two devices have conflicting updates to the same incident field, the event with the later `timestamp` wins. Clock drift is a known limitation.

---

## Entity: MessageReceipt

Records which devices have interacted with a message, enabling deduplication.

```typescript
interface MessageReceipt {
  receiptId: string;        // UUID v4
  messageId: string;        // References Message
  deviceId: string;         // Device UUID that generated this receipt
  receiptType: 'received' | 'forwarded' | 'delivered';
  timestamp: string;        // ISO 8601
}
```

**Design assumption:**
- A device checks `message_receipts WHERE message_id = ? AND device_id = localDeviceId` before forwarding. If a receipt exists, the message is a duplicate and is not forwarded again.

---

## Entity: SyncQueueEntry

Queues locally created/modified records for eventual backend upload.

```typescript
interface SyncQueueEntry {
  queueId: string;          // UUID v4
  entityType: SyncEntityType;
  entityId: string;         // UUID of the entity
  payload: string;          // JSON snapshot at time of queuing
  status: SyncStatus;
  createdAt: string;        // ISO 8601
  lastAttemptAt: string | null;
  attemptCount: number;
}

type SyncEntityType = 'incident' | 'message' | 'incident_event' | 'message_receipt';
type SyncStatus     = 'pending' | 'syncing' | 'synced' | 'failed';
```

---

## Entity Relationships

```
Device ──< Incident         (Device reports many Incidents)
Device ──< Message          (Device sends many Messages)
Device ──< IncidentEvent    (Device generates many Events)
Device ──< MessageReceipt   (Device generates many Receipts)
Incident ──< Message        (optional: Message may reference an Incident)
Incident ──< IncidentEvent  (Incident has an ordered event log)
Message  ──< MessageReceipt (Message has routing receipt records)
```
