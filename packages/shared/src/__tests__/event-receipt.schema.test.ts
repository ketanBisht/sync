import { describe, it, expect } from '@jest/globals';
import { IncidentEventSchema, MessageReceiptSchema } from '../schemas/event-receipt.schema';

const validEvent = {
  eventId: '550e8400-e29b-41d4-a716-446655440010',
  incidentId: '550e8400-e29b-41d4-a716-446655440001',
  eventType: 'status_changed' as const,
  actorId: '550e8400-e29b-41d4-a716-446655440000',
  timestamp: '2024-01-15T11:00:00.000Z',
  payload: JSON.stringify({ from: 'active', to: 'resolved' }),
};

const validReceipt = {
  receiptId: '550e8400-e29b-41d4-a716-446655440020',
  messageId: '550e8400-e29b-41d4-a716-446655440002',
  deviceId: '550e8400-e29b-41d4-a716-446655440000',
  receiptType: 'received' as const,
  timestamp: '2024-01-15T10:35:00.000Z',
};

describe('IncidentEventSchema', () => {
  it('validates a correct incident event', () => {
    const result = IncidentEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('accepts all valid event types', () => {
    const types = [
      'created', 'status_changed', 'severity_updated', 'description_updated',
      'location_added', 'resource_assigned', 'comment_added',
    ] as const;
    for (const eventType of types) {
      const result = IncidentEventSchema.safeParse({ ...validEvent, eventType });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid event type', () => {
    const result = IncidentEventSchema.safeParse({ ...validEvent, eventType: 'deleted' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-JSON payload', () => {
    const result = IncidentEventSchema.safeParse({ ...validEvent, payload: '{broken json' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid actorId', () => {
    const result = IncidentEventSchema.safeParse({ ...validEvent, actorId: 'bad-id' });
    expect(result.success).toBe(false);
  });
});

describe('MessageReceiptSchema', () => {
  it('validates a correct message receipt', () => {
    const result = MessageReceiptSchema.safeParse(validReceipt);
    expect(result.success).toBe(true);
  });

  it('accepts all valid receipt types', () => {
    const types = ['received', 'forwarded', 'delivered'] as const;
    for (const receiptType of types) {
      const result = MessageReceiptSchema.safeParse({ ...validReceipt, receiptType });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an invalid receipt type', () => {
    const result = MessageReceiptSchema.safeParse({ ...validReceipt, receiptType: 'acknowledged' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid messageId', () => {
    const result = MessageReceiptSchema.safeParse({ ...validReceipt, messageId: 'not-uuid' });
    expect(result.success).toBe(false);
  });
});

