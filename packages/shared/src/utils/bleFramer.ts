import { PROTOCOL_VERSION } from '../constants/protocol';

export interface BleChunkFrame {
  /** Protocol version */
  v: number;
  /** Transfer identifier */
  tid: string;
  /** Target message ID */
  mid: string;
  /** 0-based chunk index */
  idx: number;
  /** Total number of chunks in this transfer */
  total: number;
  /** Chunk payload string */
  data: string;
}

/**
 * Splits a serialized JSON string into structured BLE chunk frames.
 *
 * @param messageJson The full serialized JSON message string
 * @param messageId The UUID of the message being transferred
 * @param maxChunkSize Maximum character size per chunk
 */
export function createFrames(
  messageJson: string,
  messageId: string,
  maxChunkSize: number = 380
): BleChunkFrame[] {
  if (!messageJson || messageJson.length === 0) {
    throw new Error('Cannot frame empty message');
  }

  const transferId = Math.random().toString(36).substring(2, 10);
  const totalChunks = Math.ceil(messageJson.length / maxChunkSize);
  const frames: BleChunkFrame[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * maxChunkSize;
    const end = Math.min(start + maxChunkSize, messageJson.length);
    const chunkData = messageJson.slice(start, end);

    frames.push({
      v: PROTOCOL_VERSION,
      tid: transferId,
      mid: messageId,
      idx: i,
      total: totalChunks,
      data: chunkData,
    });
  }

  return frames;
}

/**
 * Validates whether a raw object adheres to the BleChunkFrame schema.
 */
export function isValidChunkFrame(obj: unknown): obj is BleChunkFrame {
  if (typeof obj !== 'object' || obj === null) return false;
  const frame = obj as Partial<BleChunkFrame>;
  return (
    typeof frame.v === 'number' &&
    typeof frame.tid === 'string' &&
    typeof frame.mid === 'string' &&
    typeof frame.idx === 'number' &&
    typeof frame.total === 'number' &&
    typeof frame.data === 'string' &&
    frame.idx >= 0 &&
    frame.idx < frame.total &&
    frame.total > 0
  );
}

interface InProgressTransfer {
  tid: string;
  mid: string;
  total: number;
  chunks: Map<number, string>;
  createdAt: number;
  lastActiveAt: number;
}

/**
 * Reassembles chunk frames into full JSON messages.
 * Handles out-of-order chunks, deduplicates chunk arrival, and times out stalled transfers.
 */
export class MessageReassembler {
  private transfers = new Map<string, InProgressTransfer>();
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = 30000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Adds an incoming chunk frame to the reassembler.
   *
   * @returns An object indicating completion status and the assembled payload if complete.
   */
  public addChunk(frame: BleChunkFrame): {
    isComplete: boolean;
    fullPayload?: string;
    messageId?: string;
    error?: string;
  } {
    this.cleanupStaleTransfers();

    if (!isValidChunkFrame(frame)) {
      return { isComplete: false, error: 'Malformed chunk frame' };
    }

    if (frame.v !== PROTOCOL_VERSION) {
      return {
        isComplete: false,
        error: `Incompatible protocol version: expected ${PROTOCOL_VERSION}, got ${frame.v}`,
      };
    }

    let transfer = this.transfers.get(frame.tid);
    const now = Date.now();

    if (!transfer) {
      transfer = {
        tid: frame.tid,
        mid: frame.mid,
        total: frame.total,
        chunks: new Map<number, string>(),
        createdAt: now,
        lastActiveAt: now,
      };
      this.transfers.set(frame.tid, transfer);
    } else {
      transfer.lastActiveAt = now;
      if (transfer.total !== frame.total || transfer.mid !== frame.mid) {
        this.transfers.delete(frame.tid);
        return { isComplete: false, error: 'Inconsistent frame header for active transfer' };
      }
    }

    // Store chunk
    transfer.chunks.set(frame.idx, frame.data);

    // Check if all chunks have arrived
    if (transfer.chunks.size === transfer.total) {
      const parts: string[] = [];
      for (let i = 0; i < transfer.total; i++) {
        const part = transfer.chunks.get(i);
        if (part === undefined) {
          return { isComplete: false, error: `Missing chunk index ${i}` };
        }
        parts.push(part);
      }

      const fullPayload = parts.join('');
      const messageId = transfer.mid;

      // Transfer complete, free memory
      this.transfers.delete(frame.tid);

      return {
        isComplete: true,
        fullPayload,
        messageId,
      };
    }

    return { isComplete: false };
  }

  /**
   * Removes transfers that have exceeded the timeout window without completing.
   */
  public cleanupStaleTransfers(): void {
    const now = Date.now();
    for (const [tid, transfer] of this.transfers.entries()) {
      if (now - transfer.lastActiveAt > this.timeoutMs) {
        this.transfers.delete(tid);
      }
    }
  }

  /**
   * Returns current active transfer count (for diagnostics).
   */
  public getActiveTransferCount(): number {
    return this.transfers.size;
  }
}
