import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Hazard } from '../../frontend/hazards';
import { adaptHazardServiceRecords } from '../../frontend/services/riskAssessment';

const hazard = (overrides: Partial<Hazard> & Pick<Hazard, 'id'>): Hazard => ({
  id: overrides.id,
  type: 'Road obstruction',
  description: 'SYNTHETIC integration test hazard',
  severity: 2,
  reportedAt: '2026-10-29T06:00:00.000Z',
  source: 'community',
  verificationStatus: 'unverified',
  latitude: 26.18,
  longitude: 91.75,
  ...overrides,
});

describe('hazard service to route-risk adapter', () => {
  it('preserves closure, severity, provenance, verification, and timestamp', () => {
    const [mapped] = adaptHazardServiceRecords([
      hazard({
        id: 'closure',
        type: 'Road closure',
        severity: 4,
        source: 'official',
        verificationStatus: 'verified',
      }),
    ], true);

    assert.equal(mapped?.type, 'road_closure');
    assert.equal(mapped?.severity, 5);
    assert.equal(mapped?.source, 'official');
    assert.equal(mapped?.verification, 'verified');
    assert.equal(mapped?.timestamp, '2026-10-29T06:00:00.000Z');
    assert.equal(mapped?.lat, 26.18);
    assert.equal(mapped?.lng, 91.75);
  });

  it('maps news provenance conservatively and excludes records outside the Guwahati pilot area', () => {
    const mapped = adaptHazardServiceRecords([
      hazard({ id: 'news', source: 'news' }),
      hazard({ id: 'outside', latitude: 40, longitude: -73 }),
    ], true);

    assert.equal(mapped.length, 1);
    assert.equal(mapped[0]?.id, 'news');
    assert.equal(mapped[0]?.source, 'unknown');
  });

  it('returns no route inputs when the route is outside the supported pilot area', () => {
    assert.deepEqual(adaptHazardServiceRecords([hazard({ id: 'local' })], false), []);
  });
});
