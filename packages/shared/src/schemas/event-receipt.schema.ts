import { z } from 'zod';
import type { IncidentEvent, MessageReceipt } from '../types/event-receipt';

export const IncidentEventTypeSchema = z.enum([
  'created',
  'status_changed',
  'severity_updated',
  'description_updated',
  'location_added',
  'resource_assigned',
  'comment_added',
]);

export const IncidentEventSchema = z.object({
  eventId: z.string().uuid(),
  incidentId: z.string().uuid(),
  eventType: IncidentEventTypeSchema,
  actorId: z.string().uuid(),
  timestamp: z.string().datetime(),
  payload: z.string().refine(
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
}) satisfies z.ZodType<IncidentEvent>;

// ---------------------------------------------------------------------------

export const ReceiptTypeSchema = z.enum(['received', 'forwarded', 'delivered']);

export const MessageReceiptSchema = z.object({
  receiptId: z.string().uuid(),
  messageId: z.string().uuid(),
  deviceId: z.string().uuid(),
  receiptType: ReceiptTypeSchema,
  timestamp: z.string().datetime(),
}) satisfies z.ZodType<MessageReceipt>;

export type IncidentEventInput = z.infer<typeof IncidentEventSchema>;
export type MessageReceiptInput = z.infer<typeof MessageReceiptSchema>;

