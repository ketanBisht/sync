import { z } from 'zod';
import type { Device } from '../types/device';

export const ConnectionStatusSchema = z.enum([
  'connected',
  'disconnected',
  'nearby',
  'unknown',
]);

export const DeviceSchema = z.object({
  deviceId: z.string().uuid({ message: 'deviceId must be a valid UUID' }),

  /**
   * Public key placeholder. No format is enforced in Phase 1.
   * Future: validate as a Base64-encoded Ed25519 public key.
   */
  publicKey: z.string().nullable(),

  deviceName: z
    .string()
    .min(1, 'deviceName must not be empty')
    .max(64, 'deviceName must be at most 64 characters'),

  lastSeenAt: z.string().datetime({ message: 'lastSeenAt must be a valid ISO 8601 datetime' }),

  batteryLevel: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional(),

  connectionStatus: ConnectionStatusSchema,
}) satisfies z.ZodType<Device>;

export type DeviceInput = z.infer<typeof DeviceSchema>;

