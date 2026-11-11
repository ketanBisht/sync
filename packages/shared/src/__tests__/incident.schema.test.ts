import { describe, it, expect } from '@jest/globals';
import { IncidentSchema } from '../schemas/incident.schema';

const validIncident = {
  incidentId: '550e8400-e29b-41d4-a716-446655440001',
  category: 'medical' as const,
  severity: 'high' as const,
  description: 'Multiple casualties reported at the intersection.',
  latitude: 51.5074,
  longitude: -0.1278,
  createdAt: '2024-01-15T10:30:00.000Z',
  updatedAt: '2024-01-15T10:30:00.000Z',
  status: 'active' as const,
  reporterId: '550e8400-e29b-41d4-a716-446655440000',
};

describe('IncidentSchema', () => {
  it('validates a correct incident object', () => {
    const result = IncidentSchema.safeParse(validIncident);
    expect(result.success).toBe(true);
  });

  it('accepts an incident without location (offline / privacy)', () => {
    const { latitude: _lat, longitude: _lon, ...withoutLocation } = validIncident;
    const result = IncidentSchema.safeParse(withoutLocation);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid incidentId', () => {
    const result = IncidentSchema.safeParse({ ...validIncident, incidentId: 'bad-id' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid category', () => {
    const result = IncidentSchema.safeParse({ ...validIncident, category: 'earthquake' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid severity', () => {
    const result = IncidentSchema.safeParse({ ...validIncident, severity: 'catastrophic' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty description', () => {
    const result = IncidentSchema.safeParse({ ...validIncident, description: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a description over 2000 characters', () => {
    const result = IncidentSchema.safeParse({ ...validIncident, description: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range latitude', () => {
    const result = IncidentSchema.safeParse({ ...validIncident, latitude: 91 });
    expect(result.success).toBe(false);
  });

  it('rejects an out-of-range longitude', () => {
    const result = IncidentSchema.safeParse({ ...validIncident, longitude: 181 });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid status', () => {
    const result = IncidentSchema.safeParse({ ...validIncident, status: 'pending' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid categories', () => {
    const categories = [
      'medical', 'fire', 'flood', 'structural_collapse',
      'missing_person', 'resource_request', 'security', 'other',
    ] as const;
    for (const category of categories) {
      const result = IncidentSchema.safeParse({ ...validIncident, category });
      expect(result.success).toBe(true);
    }
  });
});

