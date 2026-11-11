import { z } from 'zod';
import type { Message } from '../types/message';
import { MAX_HOP_COUNT } from '../constants/protocol';

export const MessagePrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

export const MessageStatusSchema = z.enum([
  'pending',
  'sent',
  'delivered',
  'failed',
  'expired',
]);

export const MessageSchema = z.object({
  messageId: z.string().uuid({ message: 'messageId must be a valid UUID' }),

  incidentId: z.string().uuid().nullable(),

  senderId: z.string().uuid({ message: 'senderId must be a valid UUID' }),

  recipientId: z.string().uuid().nullable(),

  /**
   * Payload must be a non-empty JSON string.
   * We validate it is parseable JSON rather than enforcing a schema here,
   * because the payload schema varies by message context.
   */
  payload: z
    .string()
    .min(1)
    .refine(
      (val) => {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'payload must be a valid JSON string' }
    ),

  priority: MessagePrioritySchema,

  createdAt: z.string().datetime({ message: 'createdAt must be a valid ISO 8601 datetime' }),
  expiresAt: z.string().datetime({ message: 'expiresAt must be a valid ISO 8601 datetime' }),

  hopCount: z
    .number()
    .int()
    .min(0, 'hopCount must be non-negative'),

  maxHops: z
    .number()
    .int()
    .min(1)
    .max(MAX_HOP_COUNT, `maxHops must not exceed the protocol maximum of ${MAX_HOP_COUNT}`),

  messageStatus: MessageStatusSchema,
}) satisfies z.ZodType<Message>;

export type MessageInput = z.infer<typeof MessageSchema>;

