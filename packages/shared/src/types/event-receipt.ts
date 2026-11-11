/**
 * SYNC – Shared Types: IncidentEvent and MessageReceipt
 *
 * IncidentEvent: An append-only audit log of changes to an incident.
 * This event-sourcing approach allows multiple devices to converge on
 * incident state without a central authority. Events are timestamped
 * and sorted; the latest event per field wins (last-write-wins CRDT).
 *
 * MessageReceipt: Acknowledgement records for mesh routing.
 * Tracks which devices have seen / relayed / delivered each message,
 * enabling deduplication and delivery confirmation.
 */

export type IncidentEventType =
  | 'created'
  | 'status_changed'
  | 'severity_updated'
  | 'description_updated'
  | 'location_added'
  | 'resource_assigned'
  | 'comment_added';

export interface IncidentEvent {
  /** UUID — unique per event */
  eventId: string;

  /** References Incident.incidentId */
  incidentId: string;

  eventType: IncidentEventType;

  /** Device UUID of the device that generated this event */
  actorId: string;

  /** ISO 8601 — when the event occurred on the originating device */
  timestamp: string;

  /**
   * JSON-encoded string containing event-specific data.
   * e.g., for `status_changed`: `{ "from": "active", "to": "resolved" }`
   * Kept as a string for the same reasons as Message.payload.
   */
  payload: string;
}

// ---------------------------------------------------------------------------

export type ReceiptType =
  | 'received'    // device has stored the message locally
  | 'forwarded'   // device has relayed the message to another peer
  | 'delivered';  // message reached its intended recipient

export interface MessageReceipt {
  /** UUID */
  receiptId: string;

  /** References Message.messageId */
  messageId: string;

  /** Device UUID that generated this receipt */
  deviceId: string;

  receiptType: ReceiptType;

  /** ISO 8601 */
  timestamp: string;
}

