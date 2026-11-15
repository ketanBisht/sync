import { Device } from '@sync/shared';
import { getDatabase } from '../database';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback RFC 4122 v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const LOCAL_DEVICE_MARKER = '__local_device__';

export class DeviceRepository {
  /**
   * Retrieves or initializes the local device identity record.
   * Ensures the device has a stable UUID across restarts.
   */
  async getOrCreateLocalDevice(defaultName: string = 'SYNC Mobile Unit'): Promise<Device> {
    const db = await getDatabase();

    // Check for an existing local device entry marked in public_key
    const existing = await db.getFirstAsync<any>(
      'SELECT device_id, public_key, device_name, last_seen_at, battery_level, connection_status FROM devices WHERE public_key = ? LIMIT 1',
      [LOCAL_DEVICE_MARKER]
    );

    if (existing) {
      return {
        deviceId: existing.device_id,
        publicKey: null,
        deviceName: existing.device_name,
        lastSeenAt: existing.last_seen_at,
        batteryLevel: existing.battery_level ?? undefined,
        connectionStatus: existing.connection_status,
      };
    }

    const newId = generateUuid();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO devices (device_id, public_key, device_name, last_seen_at, battery_level, connection_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId, LOCAL_DEVICE_MARKER, defaultName, now, 100, 'connected']
    );

    return {
      deviceId: newId,
      publicKey: null,
      deviceName: defaultName,
      lastSeenAt: now,
      batteryLevel: 100,
      connectionStatus: 'connected',
    };
  }

  /**
   * Records or updates a peer device discovered over BLE.
   */
  async upsertPeerDevice(
    deviceId: string,
    deviceName: string,
    status: 'connected' | 'disconnected' | 'nearby' = 'nearby'
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO devices (device_id, public_key, device_name, last_seen_at, connection_status)
       VALUES (?, NULL, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         device_name = excluded.device_name,
         last_seen_at = excluded.last_seen_at,
         connection_status = excluded.connection_status,
         updated_at = excluded.last_seen_at`,
      [deviceId, deviceName, now, status]
    );
  }

  /**
   * Returns list of all known peer devices (excluding local marker).
   */
  async getKnownPeers(): Promise<Device[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      `SELECT device_id, public_key, device_name, last_seen_at, battery_level, connection_status
       FROM devices
       WHERE public_key IS NULL OR public_key != ?
       ORDER BY last_seen_at DESC`,
      [LOCAL_DEVICE_MARKER]
    );

    return rows.map((r) => ({
      deviceId: r.device_id,
      publicKey: r.public_key,
      deviceName: r.device_name,
      lastSeenAt: r.last_seen_at,
      batteryLevel: r.battery_level ?? undefined,
      connectionStatus: r.connection_status,
    }));
  }
}

export const deviceRepository = new DeviceRepository();
