import { describe, it, expect } from '@jest/globals';
import {
  createFrames,
  isValidChunkFrame,
  MessageReassembler,
  BleChunkFrame,
} from '../utils/bleFramer';
import { Message, MessageSchema } from '../index';

describe('bleFramer – createFrames', () => {
  it('throws when given an empty message', () => {
    expect(() => createFrames('', 'mid-1')).toThrow('Cannot frame empty message');
  });

  it('creates a single frame for small payload', () => {
    const payload = JSON.stringify({ type: 'SOS', text: 'Help' });
    const frames = createFrames(payload, 'msg-101', 380);

    expect(frames.length).toBe(1);
    expect(frames[0].idx).toBe(0);
    expect(frames[0].total).toBe(1);
    expect(frames[0].mid).toBe('msg-101');
    expect(frames[0].data).toBe(payload);
    expect(frames[0].v).toBe(1);
  });

  it('splits large message into multiple frames', () => {
    const largePayload = 'A'.repeat(1000);
    const frames = createFrames(largePayload, 'msg-large', 300);

    expect(frames.length).toBe(4); // 300 + 300 + 300 + 100 = 1000
    expect(frames[0].idx).toBe(0);
    expect(frames[1].idx).toBe(1);
    expect(frames[2].idx).toBe(2);
    expect(frames[3].idx).toBe(3);
    for (const f of frames) {
      expect(f.total).toBe(4);
      expect(f.mid).toBe('msg-large');
      expect(f.tid).toBe(frames[0].tid);
    }
    expect(frames.map((f) => f.data).join('')).toBe(largePayload);
  });
});

describe('bleFramer – isValidChunkFrame', () => {
  it('validates a correct frame', () => {
    const frame: BleChunkFrame = {
      v: 1,
      tid: 'transfer-1',
      mid: 'message-1',
      idx: 0,
      total: 2,
      data: 'abc',
    };
    expect(isValidChunkFrame(frame)).toBe(true);
  });

  it('rejects frame with negative index', () => {
    expect(
      isValidChunkFrame({
        v: 1,
        tid: 't1',
        mid: 'm1',
        idx: -1,
        total: 2,
        data: 'abc',
      })
    ).toBe(false);
  });

  it('rejects frame with index >= total', () => {
    expect(
      isValidChunkFrame({
        v: 1,
        tid: 't1',
        mid: 'm1',
        idx: 2,
        total: 2,
        data: 'abc',
      })
    ).toBe(false);
  });

  it('rejects frame missing fields or non-object', () => {
    expect(isValidChunkFrame(null)).toBe(false);
    expect(isValidChunkFrame('string')).toBe(false);
    expect(isValidChunkFrame({ v: 1, idx: 0 })).toBe(false);
  });
});

describe('bleFramer – MessageReassembler', () => {
  it('reassembles single chunk frame immediately', () => {
    const reassembler = new MessageReassembler();
    const payload = '{"type":"PING"}';
    const frames = createFrames(payload, 'm-ping', 380);

    const result = reassembler.addChunk(frames[0]);
    expect(result.isComplete).toBe(true);
    expect(result.fullPayload).toBe(payload);
    expect(result.messageId).toBe('m-ping');
  });

  it('reassembles multi-chunk payload in order', () => {
    const reassembler = new MessageReassembler();
    const fullText = 'The quick brown fox jumps over the lazy dog. '.repeat(10);
    const frames = createFrames(fullText, 'm-fox', 50);

    let finalResult;
    for (const frame of frames) {
      finalResult = reassembler.addChunk(frame);
    }

    expect(finalResult?.isComplete).toBe(true);
    expect(finalResult?.fullPayload).toBe(fullText);
    expect(finalResult?.messageId).toBe('m-fox');
    expect(reassembler.getActiveTransferCount()).toBe(0);
  });

  it('reassembles multi-chunk payload received out-of-order', () => {
    const reassembler = new MessageReassembler();
    const fullText = 'Disaster response coordination payload test string.';
    const frames = createFrames(fullText, 'm-order', 15);

    expect(frames.length).toBeGreaterThan(2);

    // Shuffle frames: e.g. [2, 0, 3, 1, ...]
    const shuffled = [...frames].reverse();

    let completedResult: any = null;
    for (const frame of shuffled) {
      const res = reassembler.addChunk(frame);
      if (res.isComplete) {
        completedResult = res;
      }
    }

    expect(completedResult).not.toBeNull();
    expect(completedResult.isComplete).toBe(true);
    expect(completedResult.fullPayload).toBe(fullText);
  });

  it('rejects chunk with incompatible protocol version', () => {
    const reassembler = new MessageReassembler();
    const frame: BleChunkFrame = {
      v: 999, // unsupported version
      tid: 't-bad-v',
      mid: 'm-bad-v',
      idx: 0,
      total: 1,
      data: 'data',
    };

    const res = reassembler.addChunk(frame);
    expect(res.isComplete).toBe(false);
    expect(res.error).toMatch(/Incompatible protocol version/);
  });

  it('times out stale transfers', () => {
    const shortTimeoutMs = 50;
    const reassembler = new MessageReassembler(shortTimeoutMs);
    const frames = createFrames('A'.repeat(200), 'm-stale', 50);

    // Add only first chunk
    reassembler.addChunk(frames[0]);
    expect(reassembler.getActiveTransferCount()).toBe(1);

    // Wait past timeout
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        reassembler.cleanupStaleTransfers();
        expect(reassembler.getActiveTransferCount()).toBe(0);
        resolve();
      }, 70);
    });
  });
});

describe('bleFramer – End-to-End Structured Message Transfer Pipeline', () => {
  it('frames, reassembles, and validates a full shared Message object without data loss', () => {
    const originalMessage: Message = {
      messageId: '550e8400-e29b-41d4-a716-446655440099',
      incidentId: null,
      senderId: '550e8400-e29b-41d4-a716-446655440001',
      recipientId: null,
      payload: JSON.stringify({
        type: 'SOS_MEDICAL',
        description: 'Triage team required at northern sector. 5 patients awaiting evacuation.',
        suppliesNeeded: ['morphine', 'tourniquets', 'sterile bandages'],
      }),
      priority: 'critical',
      createdAt: '2026-11-15T18:00:00.000Z',
      expiresAt: '2026-11-17T18:00:00.000Z',
      hopCount: 0,
      maxHops: 5,
      messageStatus: 'pending',
    };

    const serialized = JSON.stringify(originalMessage);
    const frames = createFrames(serialized, originalMessage.messageId, 80);

    expect(frames.length).toBeGreaterThan(1);

    // Simulate BLE transmission and receiver reassembly
    const receiver = new MessageReassembler();
    let reassemblyResult: any = null;

    for (const frame of frames) {
      const res = receiver.addChunk(frame);
      if (res.isComplete) {
        reassemblyResult = res;
      }
    }

    expect(reassemblyResult).not.toBeNull();
    expect(reassemblyResult.isComplete).toBe(true);

    // Validate reassembled message against Zod schema
    const parsed = JSON.parse(reassemblyResult.fullPayload);
    const validation = MessageSchema.safeParse(parsed);

    expect(validation.success).toBe(true);
    if (validation.success) {
      expect(validation.data.messageId).toBe(originalMessage.messageId);
      expect(validation.data.priority).toBe('critical');
      expect(validation.data.senderId).toBe(originalMessage.senderId);
      expect(JSON.parse(validation.data.payload)).toEqual(JSON.parse(originalMessage.payload));
    }
  });
});
