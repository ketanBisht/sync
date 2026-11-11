/**
 * SYNC – Shared Types: Device
 *
 * Represents a physical device participating in the SYNC mesh network.
 * Devices are discovered via BLE advertising and tracked locally.
 *
 * Design note: `publicKey` is reserved for a future challenge-response
 * identity verification layer. It is stored but not yet validated.
 */

export type ConnectionStatus = 'connected' | 'disconnected' | 'nearby' | 'unknown';

export interface Device {
  /** Unique identifier — will be a UUID generated on first launch */
  deviceId: string;

  /**
   * Reserved for future asymmetric cryptographic identity verification.
   * Not currently used in the BLE handshake but captured for future use.
   */
  publicKey: string | null;

  /** Human-readable device name sourced from the OS or user setting */
  deviceName: string;

  /** ISO 8601 timestamp of the most recent BLE contact */
  lastSeenAt: string;

  /** Battery percentage 0–100. Optional — not all BLE advertisements include it */
  batteryLevel?: number;

  connectionStatus: ConnectionStatus;
}

