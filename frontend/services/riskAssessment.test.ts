import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { incidentToHazardInput, adaptExternalIncidents } from './riskAssessment';
import type { ExternalIncident } from './incidents';

function makeIncident(overrides: Partial<ExternalIncident> = {}): ExternalIncident {
  return {
    id: 'inc-123',
    description: 'Road blocked due to fallen tree on highway',
    category: 'Road obstruction',
    publishedAt: '2026-10-29T10:00:00.000Z',
    sourceUrl: 'https://example.com/news/1',
    sourceName: 'Assam Tribune',
    locationText: 'GS Road',
    locationConfidence: 'source_coordinates',
    latitude: 26.182,
    longitude: 91.751,
    isStale: false,
    qualityFlags: [],
    ...overrides,
  };
}

describe('incidentToHazardInput adapter & scoring rules', () => {
  it('maps valid source_coordinates incident into HazardInput', () => {
    const inc = makeIncident();
    const result = incidentToHazardInput(inc);
    assert.ok(result !== null);
    assert.equal(result.id, 'inc-123');
    assert.equal(result.lat, 26.182);
    assert.equal(result.lng, 91.751);
    assert.equal(result.verification, 'unverified');
    assert.equal(result.type, 'road_obstruction');
    assert.equal(result.confidence, 0.6);
    assert.equal(result.description, 'Road blocked due to fallen tree on highway');
  });

  it('rejects incidents with null coordinates (cannot affect scores)', () => {
    const inc = makeIncident({ latitude: null, longitude: null });
    const result = incidentToHazardInput(inc);
    assert.equal(result, null, 'must reject null coordinates');
  });

  it('rejects incidents with undefined or NaN coordinates', () => {
    const inc1 = makeIncident({ latitude: undefined });
    assert.equal(incidentToHazardInput(inc1), null);

    const inc2 = makeIncident({ latitude: Number.NaN });
    assert.equal(incidentToHazardInput(inc2), null);
  });

  it('treats area_text confidence as display-only (returns null for scoring)', () => {
    const inc = makeIncident({ locationConfidence: 'area_text' });
    assert.equal(incidentToHazardInput(inc), null, 'area_text must not enter scoring');
  });

  it('treats region_level confidence as display-only (returns null for scoring)', () => {
    const inc = makeIncident({ locationConfidence: 'region_level' });
    assert.equal(incidentToHazardInput(inc), null, 'region_level must not enter scoring');
  });

  it('treats ambiguous confidence as display-only (returns null for scoring)', () => {
    const inc = makeIncident({ locationConfidence: 'ambiguous' });
    assert.equal(incidentToHazardInput(inc), null, 'ambiguous must not enter scoring');
  });

  it('treats none confidence as display-only (returns null for scoring)', () => {
    const inc = makeIncident({ locationConfidence: 'none' });
    assert.equal(incidentToHazardInput(inc), null, 'none must not enter scoring');
  });

  it('preserves publishedAt as timestamp for recency decay calculation', () => {
    const publishedAt = '2026-10-27T08:00:00.000Z';
    const inc = makeIncident({ publishedAt });
    const result = incidentToHazardInput(inc);
    assert.ok(result !== null);
    assert.equal(result.timestamp, new Date(publishedAt).getTime());
  });

  it('adaptExternalIncidents filters out non-scoreable items', () => {
    const items: ExternalIncident[] = [
      makeIncident({ id: 'valid', locationConfidence: 'source_coordinates' }),
      makeIncident({ id: 'area', locationConfidence: 'area_text' }),
      makeIncident({ id: 'no-coords', locationConfidence: 'source_coordinates', latitude: null }),
      makeIncident({ id: 'region', locationConfidence: 'region_level' }),
    ];

    const adapted = adaptExternalIncidents(items);
    assert.equal(adapted.length, 1);
    assert.equal(adapted[0].id, 'valid');
  });
});
