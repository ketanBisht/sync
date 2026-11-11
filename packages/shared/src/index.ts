/**
 * SYNC – Shared Package: Public API
 *
 * Everything exported from this file is part of the public contract of
 * @sync/shared. Add new exports here when adding new types, schemas, or
 * constants. Keep this file as a re-export barrel only.
 */

// --- Types ---
export type { Device, ConnectionStatus } from './types/device';
export type { Incident, IncidentCategory, IncidentSeverity, IncidentStatus } from './types/incident';
export type { Message, MessagePriority, MessageStatus } from './types/message';
export type {
  IncidentEvent,
  IncidentEventType,
  MessageReceipt,
  ReceiptType,
} from './types/event-receipt';
export type { SyncQueueEntry, SyncEntityType, SyncStatus } from './types/sync-queue';

// --- Zod Schemas ---
export {
  DeviceSchema,
  ConnectionStatusSchema,
  type DeviceInput,
} from './schemas/device.schema';

export {
  IncidentSchema,
  IncidentCategorySchema,
  IncidentSeveritySchema,
  IncidentStatusSchema,
  type IncidentInput,
} from './schemas/incident.schema';

export {
  MessageSchema,
  MessagePrioritySchema,
  MessageStatusSchema,
  type MessageInput,
} from './schemas/message.schema';

export {
  IncidentEventSchema,
  IncidentEventTypeSchema,
  MessageReceiptSchema,
  ReceiptTypeSchema,
  type IncidentEventInput,
  type MessageReceiptInput,
} from './schemas/event-receipt.schema';

// --- Constants ---
export {
  MAX_HOP_COUNT,
  DEFAULT_TTL_SECONDS,
  MAX_BLE_PAYLOAD_BYTES,
  SYNC_BLE_SERVICE_UUID,
  SYNC_CHARACTERISTICS,
  SYNC_MANUFACTURER_ID,
  PROTOCOL_VERSION,
} from './constants/protocol';

