/**
 * SYNC – Protocol Constants
 *
 * These values govern the BLE store-carry-forward protocol behaviour.
 * They are defined here (in the shared package) so they can be referenced
 * by both the mobile application and any future backend sync logic.
 *
 * All values are preliminary design choices for Phase 1 and may be tuned
 * based on observed network performance in later phases.
 */

/** Maximum number of hops a message is permitted to travel through relay devices */
export const MAX_HOP_COUNT = 10;

/**
 * Default message TTL for each priority level, expressed in seconds.
 * Devices set `expiresAt = createdAt + DEFAULT_TTL_SECONDS[priority]`.
 */
export const DEFAULT_TTL_SECONDS: Record<string, number> = {
  low: 3 * 60 * 60,       // 3 hours
  normal: 6 * 60 * 60,    // 6 hours
  high: 24 * 60 * 60,     // 24 hours
  critical: 48 * 60 * 60, // 48 hours
} as const;

/**
 * Maximum BLE payload size per GATT write (bytes).
 * Android supports up to 512 bytes in a single write-with-response.
 * We use 500 to leave room for GATT framing overhead.
 * Larger messages must be chunked and reassembled at the application layer.
 */
export const MAX_BLE_PAYLOAD_BYTES = 500;

/**
 * BLE GATT Service and Characteristic UUIDs (Preliminary — Phase 1 Design)
 *
 * These are placeholder UUIDs. A proper UUID should be registered or
 * generated from a stable namespace (e.g., using UUIDv5 from a DNS name)
 * before production use.
 *
 * Format: 128-bit UUID strings as per RFC 4122.
 */
export const SYNC_BLE_SERVICE_UUID = '12345678-0000-1000-8000-00805f9b34fb';

export const SYNC_CHARACTERISTICS = {
  /**
   * Write-without-response. Central writes a JSON inventory of known
   * message IDs to signal which messages it already has.
   */
  MESSAGE_INVENTORY: '12345678-0001-1000-8000-00805f9b34fb',

  /**
   * Write-with-response. Central writes a chunked message payload.
   * Peripheral responds with ACK or NACK.
   */
  MESSAGE_TRANSFER: '12345678-0002-1000-8000-00805f9b34fb',

  /**
   * Notify + Read. Peripheral notifies central when new messages are
   * available. Central reads to get the message count.
   */
  MESSAGE_AVAILABLE: '12345678-0003-1000-8000-00805f9b34fb',

  /**
   * Write-with-response. Used to send message receipt acknowledgements
   * back to the originating sender.
   */
  RECEIPT: '12345678-0004-1000-8000-00805f9b34fb',
} as const;

/** SYNC advertising manufacturer-specific data prefix (2 bytes, big-endian) */
export const SYNC_MANUFACTURER_ID = 0x5359; // ASCII "SY"

/** Protocol version — increment on breaking protocol changes */
export const PROTOCOL_VERSION = 1;

