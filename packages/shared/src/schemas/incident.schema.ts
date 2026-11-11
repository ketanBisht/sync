import { z } from 'zod';
import type { Incident } from '../types/incident';

export const IncidentCategorySchema = z.enum([
  'medical',
  'fire',
  'flood',
  'structural_collapse',
  'missing_person',
  'resource_request',
  'security',
  'other',
]);

export const IncidentSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const IncidentStatusSchema = z.enum(['active', 'resolved', 'cancelled', 'stale']);

export const IncidentSchema = z.object({
  incidentId: z.string().uuid({ message: 'incidentId must be a valid UUID' }),

  category: IncidentCategorySchema,
  severity: IncidentSeveritySchema,

  description: z
    .string()
    .min(1, 'description must not be empty')
    .max(2000, 'description must be at most 2000 characters'),

  latitude: z
    .number()
    .min(-90, 'latitude must be between -90 and 90')
    .max(90)
    .optional(),

  longitude: z
    .number()
    .min(-180, 'longitude must be between -180 and 180')
    .max(180)
    .optional(),

  createdAt: z.string().datetime({ message: 'createdAt must be a valid ISO 8601 datetime' }),
  updatedAt: z.string().datetime({ message: 'updatedAt must be a valid ISO 8601 datetime' }),

  status: IncidentStatusSchema,

  reporterId: z.string().uuid({ message: 'reporterId must be a valid UUID' }),
}) satisfies z.ZodType<Incident>;

export type IncidentInput = z.infer<typeof IncidentSchema>;

