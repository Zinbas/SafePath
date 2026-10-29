// SYNTHETIC TEST DATA ONLY. These are NOT real incidents; coordinates are arbitrary points near Guwahati.
import type { TrustedHazardInput } from '../../frontend/hazards';

export const NOW = new Date('2026-10-29T08:00:00.000Z');

export function synthetic(overrides: Partial<TrustedHazardInput> & { id: string }): TrustedHazardInput {
  return {
    type: 'Road obstruction',
    description: 'SYNTHETIC test hazard',
    severity: 2,
    reportedAt: '2026-10-29T06:00:00Z',
    source: 'demo',
    latitude: 26.1805,
    longitude: 91.7505,
    ...overrides,
  };
}
