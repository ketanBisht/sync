import { describe, it, expect } from '@jest/globals';
import { DeviceSchema } from '../schemas/device.schema';

const validDevice = {
  deviceId: '550e8400-e29b-41d4-a716-446655440000',
  publicKey: null,
  deviceName: 'Field Unit Alpha',
  lastSeenAt: '2024-01-15T10:30:00.000Z',
  batteryLevel: 85,
  connectionStatus: 'connected' as const,
};

describe('DeviceSchema', () => {
  it('validates a correct device object', () => {
    const result = DeviceSchema.safeParse(validDevice);
    expect(result.success).toBe(true);
  });

  it('accepts a device without batteryLevel', () => {
    const { batteryLevel: _, ...withoutBattery } = validDevice;
    const result = DeviceSchema.safeParse(withoutBattery);
    expect(result.success).toBe(true);
  });

  it('accepts null publicKey', () => {
    const result = DeviceSchema.safeParse({ ...validDevice, publicKey: null });
    expect(result.success).toBe(true);
  });

  it('accepts a string publicKey', () => {
    const result = DeviceSchema.safeParse({ ...validDevice, publicKey: 'abc123publickey' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid deviceId (not UUID)', () => {
    const result = DeviceSchema.safeParse({ ...validDevice, deviceId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('deviceId');
    }
  });

  it('rejects an empty deviceName', () => {
    const result = DeviceSchema.safeParse({ ...validDevice, deviceName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a deviceName longer than 64 characters', () => {
    const result = DeviceSchema.safeParse({ ...validDevice, deviceName: 'a'.repeat(65) });
    expect(result.success).toBe(false);
  });

  it('rejects a batteryLevel above 100', () => {
    const result = DeviceSchema.safeParse({ ...validDevice, batteryLevel: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects a batteryLevel below 0', () => {
    const result = DeviceSchema.safeParse({ ...validDevice, batteryLevel: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid connectionStatus', () => {
    const result = DeviceSchema.safeParse({ ...validDevice, connectionStatus: 'invisible' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid lastSeenAt (not ISO 8601)', () => {
    const result = DeviceSchema.safeParse({ ...validDevice, lastSeenAt: '15 Jan 2024' });
    expect(result.success).toBe(false);
  });
});

