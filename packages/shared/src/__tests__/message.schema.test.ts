import { describe, it, expect } from '@jest/globals';
import { MessageSchema } from '../schemas/message.schema';

const validMessage = {
  messageId: '550e8400-e29b-41d4-a716-446655440002',
  incidentId: '550e8400-e29b-41d4-a716-446655440001',
  senderId: '550e8400-e29b-41d4-a716-446655440000',
  recipientId: null,
  payload: JSON.stringify({ type: 'incident_broadcast', data: 'test' }),
  priority: 'high' as const,
  createdAt: '2024-01-15T10:30:00.000Z',
  expiresAt: '2024-01-16T10:30:00.000Z',
  hopCount: 0,
  maxHops: 10,
  messageStatus: 'pending' as const,
};

describe('MessageSchema', () => {
  it('validates a correct message object', () => {
    const result = MessageSchema.safeParse(validMessage);
    expect(result.success).toBe(true);
  });

  it('accepts a broadcast message (recipientId = null)', () => {
    const result = MessageSchema.safeParse({ ...validMessage, recipientId: null });
    expect(result.success).toBe(true);
  });

  it('accepts a unicast message with recipientId', () => {
    const result = MessageSchema.safeParse({
      ...validMessage,
      recipientId: '550e8400-e29b-41d4-a716-446655440099',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a message without incidentId (standalone message)', () => {
    const result = MessageSchema.safeParse({ ...validMessage, incidentId: null });
    expect(result.success).toBe(true);
  });

  it('rejects a payload that is not valid JSON', () => {
    const result = MessageSchema.safeParse({ ...validMessage, payload: 'not json {' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/valid JSON/i);
    }
  });

  it('rejects a negative hopCount', () => {
    const result = MessageSchema.safeParse({ ...validMessage, hopCount: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects maxHops exceeding the protocol maximum', () => {
    // MAX_HOP_COUNT is 10
    const result = MessageSchema.safeParse({ ...validMessage, maxHops: 11 });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid priority', () => {
    const result = MessageSchema.safeParse({ ...validMessage, priority: 'urgent' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid messageStatus', () => {
    const result = MessageSchema.safeParse({ ...validMessage, messageStatus: 'queued' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid senderId', () => {
    const result = MessageSchema.safeParse({ ...validMessage, senderId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid message statuses', () => {
    const statuses = ['pending', 'sent', 'delivered', 'failed', 'expired'] as const;
    for (const messageStatus of statuses) {
      const result = MessageSchema.safeParse({ ...validMessage, messageStatus });
      expect(result.success).toBe(true);
    }
  });
});

