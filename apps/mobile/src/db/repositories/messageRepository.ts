import {
  Message,
  MessageReceipt,
  MessageSchema,
  MessageStatus,
} from '@sync/shared';
import { getDatabase } from '../database';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface SaveIncomingResult {
  success: boolean;
  isDuplicate: boolean;
  receipt?: MessageReceipt;
  error?: string;
}

export class MessageRepository {
  /**
   * Checks whether a message has already been received or stored locally.
   */
  async hasMessage(messageId: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ exists_flag: number }>(
      'SELECT 1 AS exists_flag FROM messages WHERE message_id = ? LIMIT 1',
      [messageId]
    );
    return row !== null && row !== undefined;
  }

  /**
   * Validates and persists an incoming message from a peer.
   * Enforces deduplication: if already stored, rejects duplicate insertion and returns isDuplicate: true.
   * If new, saves to SQLite messages table, creates a 'received' receipt, and optionally 'delivered' receipt.
   */
  async saveIncomingMessage(
    rawMessage: unknown,
    localDeviceId: string,
    senderPeerName: string = 'Nearby SYNC Node'
  ): Promise<SaveIncomingResult> {
    // 1. Runtime validation with Zod
    const validation = MessageSchema.safeParse(rawMessage);
    if (!validation.success) {
      const errorMsg = validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return {
        success: false,
        isDuplicate: false,
        error: `Message validation failed: ${errorMsg}`,
      };
    }

    const message: Message = validation.data;
    const db = await getDatabase();

    // 2. Check for duplicate
    const isDuplicate = await this.hasMessage(message.messageId);
    if (isDuplicate) {
      return {
        success: true,
        isDuplicate: true,
      };
    }

    // 3. Atomically persist message, sender device placeholder, and receipt
    const now = new Date().toISOString();
    const receiptId = generateUuid();
    const isTargetRecipient = message.recipientId === localDeviceId;

    const receipt: MessageReceipt = {
      receiptId,
      messageId: message.messageId,
      deviceId: localDeviceId,
      receiptType: isTargetRecipient ? 'delivered' : 'received',
      timestamp: now,
    };

    try {
      await db.withTransactionAsync(async () => {
        // Ensure sender exists in devices table to satisfy foreign key constraint
        await db.runAsync(
          `INSERT INTO devices (device_id, public_key, device_name, last_seen_at, connection_status)
           VALUES (?, NULL, ?, ?, 'nearby')
           ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
          [message.senderId, senderPeerName, now]
        );

        // Insert message
        await db.runAsync(
          `INSERT INTO messages (
             message_id, incident_id, sender_id, recipient_id,
             payload, priority, created_at, expires_at,
             hop_count, max_hops, message_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            message.messageId,
            message.incidentId,
            message.senderId,
            message.recipientId,
            message.payload,
            message.priority,
            message.createdAt,
            message.expiresAt,
            message.hopCount,
            message.maxHops,
            isTargetRecipient ? 'delivered' : 'sent',
          ]
        );

        // Record receipt
        await db.runAsync(
          `INSERT INTO message_receipts (receipt_id, message_id, device_id, receipt_type, timestamp)
           VALUES (?, ?, ?, ?, ?)`,
          [receipt.receiptId, receipt.messageId, receipt.deviceId, receipt.receiptType, receipt.timestamp]
        );
      });

      return {
        success: true,
        isDuplicate: false,
        receipt,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        isDuplicate: false,
        error: `Database persistence failed: ${msg}`,
      };
    }
  }

  /**
   * Persists a locally authored message before transmission.
   */
  async saveOutgoingMessage(message: Message): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO messages (
         message_id, incident_id, sender_id, recipient_id,
         payload, priority, created_at, expires_at,
         hop_count, max_hops, message_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.messageId,
        message.incidentId,
        message.senderId,
        message.recipientId,
        message.payload,
        message.priority,
        message.createdAt,
        message.expiresAt,
        message.hopCount,
        message.maxHops,
        message.messageStatus,
      ]
    );
  }

  /**
   * Updates the status of an existing message (e.g. pending -> sent -> delivered).
   */
  async updateMessageStatus(messageId: string, status: MessageStatus): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE messages SET message_status = ? WHERE message_id = ?', [status, messageId]);
  }

  /**
   * Records an acknowledgement receipt received from a peer.
   */
  async recordReceipt(receipt: MessageReceipt): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      // Ensure peer device exists in devices table
      await db.runAsync(
        `INSERT INTO devices (device_id, public_key, device_name, last_seen_at, connection_status)
         VALUES (?, NULL, 'Remote Peer', ?, 'nearby')
         ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
        [receipt.deviceId, receipt.timestamp]
      );

      // Insert receipt (ignore duplicates if already recorded)
      await db.runAsync(
        `INSERT OR IGNORE INTO message_receipts (receipt_id, message_id, device_id, receipt_type, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
        [receipt.receiptId, receipt.messageId, receipt.deviceId, receipt.receiptType, receipt.timestamp]
      );

      // Update message status if it matches our sent message
      const statusToSet = receipt.receiptType === 'delivered' ? 'delivered' : 'sent';
      await db.runAsync(
        'UPDATE messages SET message_status = ? WHERE message_id = ?',
        [statusToSet, receipt.messageId]
      );
    });
  }

  /**
   * Fetches the latest messages sorted by creation time.
   */
  async getAllMessages(limit: number = 50): Promise<Message[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      `SELECT message_id, incident_id, sender_id, recipient_id, payload,
              priority, created_at, expires_at, hop_count, max_hops, message_status
       FROM messages
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map((r) => ({
      messageId: r.message_id,
      incidentId: r.incident_id,
      senderId: r.sender_id,
      recipientId: r.recipient_id,
      payload: r.payload,
      priority: r.priority,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      hopCount: r.hop_count,
      maxHops: r.max_hops,
      messageStatus: r.message_status,
    }));
  }

  /**
   * Retrieves all receipts for a given message.
   */
  async getReceiptsForMessage(messageId: string): Promise<MessageReceipt[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      `SELECT receipt_id, message_id, device_id, receipt_type, timestamp
       FROM message_receipts
       WHERE message_id = ?
       ORDER BY timestamp ASC`,
      [messageId]
    );

    return rows.map((r) => ({
      receiptId: r.receipt_id,
      messageId: r.message_id,
      deviceId: r.device_id,
      receiptType: r.receipt_type,
      timestamp: r.timestamp,
    }));
  }

  /**
   * Wipes messages and receipts (used for testing persistence & duplicate detection).
   */
  async clearAllMessages(): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM message_receipts');
      await db.runAsync('DELETE FROM messages');
    });
  }
}

export const messageRepository = new MessageRepository();
