import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DuplicateHazardIdError,
  HazardValidationError,
  InMemoryHazardStore,
  UNKNOWN_COVERAGE,
  createHazardService,
  getGridCell,
  haversineDistanceMeters,
  isLocatedHazard,
  normalizeTimestamp,
  summarizeHazardsByCell,
} from '../../frontend/hazards';
import type { CommunityHazardInput, Hazard } from '../../frontend/hazards';
import { NOW, synthetic } from './fixtures';

function makeService() {
  let counter = 0;
  return createHazardService({ now: () => NOW, generateId: () => `gen-${++counter}` });
}

const communityInput = (overrides: Record<string, unknown> = {}): CommunityHazardInput =>
  ({ type: 'Flooding', description: 'SYNTHETIC standing water', latitude: 26.18, longitude: 91.75, severity: 2, ...overrides }) as CommunityHazardInput;

async function assertRejects(promise: Promise<unknown>, field?: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof HazardValidationError, `expected HazardValidationError, got ${String(error)}`);
    if (field) assert.ok(error.issues.some((issue) => issue.field === field), `no issue for ${field}: ${error.message}`);
    return true;
  });
}

describe('1. valid hazard creation', () => {
  it('creates a community hazard with service-assigned fields', async () => {
    const hazard = await makeService().submitCommunityHazard(communityInput({ title: ' Water ', locationLabel: 'SYNTHETIC place' }));
    assert.deepEqual(hazard, {
      id: 'gen-1', type: 'Flooding', description: 'SYNTHETIC standing water', latitude: 26.18, longitude: 91.75,
      severity: 2, reportedAt: NOW.toISOString(), source: 'community', verificationStatus: 'unverified',
      title: 'Water', locationLabel: 'SYNTHETIC place',
    });
  });
  it('ingests a trusted record and normalises its timestamp to UTC', async () => {
    const service = makeService();
    const stored = await service.ingestHazard(synthetic({ id: 'a', reportedAt: '2026-10-29T10:00:00+05:30' }));
    assert.equal(stored.reportedAt, '2026-10-29T04:30:00.000Z');
    assert.equal((await service.getAllHazards()).length, 1);
  });
  it('preserves optional fields and validates sourceUrl', async () => {
    const service = makeService();
    const stored = await service.ingestHazard(synthetic({
      id: 'n1', source: 'news', sourceUrl: 'https://example.org/a', retrievedAt: '2026-10-29T07:00:00Z', locationConfidence: 'approximate',
    }));
    assert.equal(stored.sourceUrl, 'https://example.org/a');
    assert.equal(stored.locationConfidence, 'approximate');
    await assertRejects(service.ingestHazard(synthetic({ id: 'n2', sourceUrl: 'javascript:alert(1)' })), 'sourceUrl');
  });
  it('preserves road-closure and severe values in the shared model', async () => {
    const stored = await makeService().ingestHazard(synthetic({ id: 'closure', type: 'Road closure', severity: 4 }));
    assert.equal(stored.type, 'Road closure');
    assert.equal(stored.severity, 4);
  });
});

describe('2-3. coordinate validation', () => {
  const cases: [string, unknown, unknown][] = [
    ['latitude 90.0001', 90.0001, 0], ['latitude -90.0001', -90.0001, 0],
    ['longitude 180.0001', 0, 180.0001], ['longitude -180.0001', 0, -180.0001],
    ['NaN latitude', NaN, 0], ['NaN longitude', 0, NaN],
    ['Infinity latitude', Infinity, 0], ['-Infinity longitude', 0, -Infinity],
    ['string latitude', '26.1', 0], ['null longitude', 0, null],
  ];
  for (const [name, lat, lon] of cases) {
    it(`rejects community report: ${name}`, async () => {
      await assertRejects(makeService().submitCommunityHazard(communityInput({ latitude: lat, longitude: lon })));
    });
  }
  it('accepts exact boundary values', async () => {
    const service = makeService();
    await service.submitCommunityHazard(communityInput({ latitude: 90, longitude: 180 }));
    await service.submitCommunityHazard(communityInput({ latitude: -90, longitude: -180 }));
    assert.equal((await service.getAllHazards()).length, 2);
  });
  it('rejects a trusted record with only one coordinate', async () => {
    await assertRejects(makeService().ingestHazard(synthetic({ id: 'x', longitude: undefined })), 'longitude');
  });
});

describe('4-5. required fields, timestamps, severity', () => {
  it('rejects missing/empty required fields and reports all issues', async () => {
    const service = makeService();
    await assert.rejects(service.submitCommunityHazard({} as CommunityHazardInput), (error: unknown) => {
      assert.ok(error instanceof HazardValidationError);
      const fields = error.issues.map((issue) => issue.field);
      for (const field of ['type', 'description', 'severity', 'latitude', 'longitude']) assert.ok(fields.includes(field), field);
      return true;
    });
    await assertRejects(service.submitCommunityHazard(communityInput({ description: '   ' })), 'description');
    await assertRejects(service.submitCommunityHazard(null as unknown as CommunityHazardInput), 'input');
    await assertRejects(service.ingestHazard(synthetic({ id: '  ' })), 'id');
    await assertRejects(service.ingestHazard({ ...synthetic({ id: 'm' }), source: undefined } as never), 'source');
  });
  it('rejects invalid types, sources, verification values', async () => {
    const service = makeService();
    await assertRejects(service.submitCommunityHazard(communityInput({ type: 'Alien invasion' })), 'type');
    await assertRejects(service.ingestHazard({ ...synthetic({ id: 's' }), source: 'rumour' } as never), 'source');
    await assertRejects(service.ingestHazard({ ...synthetic({ id: 'v' }), verificationStatus: 'maybe' } as never), 'verificationStatus');
  });
  for (const severity of [0, 5, 1.5, -1, NaN, '2', null, undefined]) {
    it(`rejects severity ${String(severity)}`, async () => {
      await assertRejects(makeService().submitCommunityHazard(communityInput({ severity })), 'severity');
    });
  }
  for (const reportedAt of ['not a date', '2026-10-29', '2026-10-29T08:00:00', '2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-10-29T24:00:00Z', 1761724800000, '']) {
    it(`rejects reportedAt ${JSON.stringify(reportedAt)}`, async () => {
      await assertRejects(makeService().ingestHazard(synthetic({ id: 't', reportedAt: reportedAt as string })), 'reportedAt');
    });
  }
  it('rejects timestamps beyond the allowed future skew but accepts small skew', async () => {
    const service = makeService();
    await assertRejects(service.ingestHazard(synthetic({ id: 'f1', reportedAt: '2026-10-29T08:06:00Z' })), 'reportedAt');
    await service.ingestHazard(synthetic({ id: 'f2', reportedAt: '2026-10-29T08:04:00Z' }));
  });
  it('normalizeTimestamp accepts leap day and rejects invalid leap day', () => {
    assert.equal(normalizeTimestamp('2028-02-29T00:00:00Z'), '2028-02-29T00:00:00.000Z');
    assert.equal(normalizeTimestamp('2026-02-29T00:00:00Z'), null);
  });
  it('accepts the ISO timezone offset boundary and rejects offsets beyond ±14:00', () => {
    assert.equal(normalizeTimestamp('2026-10-29T08:00:00+14:00'), '2026-10-28T18:00:00.000Z');
    for (const offset of ['+14:01', '-14:01', '+15:00', '+23:59', '+00:60']) {
      assert.equal(normalizeTimestamp(`2026-10-29T08:00:00${offset}`), null, `offset ${offset} must be rejected`);
    }
  });
});

describe('6. community reports are unverified and cannot self-verify', () => {
  it('ignores client-supplied verificationStatus, source, id and reportedAt', async () => {
    const hazard = await makeService().submitCommunityHazard(communityInput({
      verificationStatus: 'verified', source: 'official', id: 'attacker-id', reportedAt: '2020-01-01T00:00:00Z',
    }));
    assert.equal(hazard.verificationStatus, 'unverified');
    assert.equal(hazard.source, 'community');
    assert.equal(hazard.id, 'gen-1');
    assert.equal(hazard.reportedAt, NOW.toISOString());
  });
  it('forces unverified for ingested records whose source is community', async () => {
    const stored = await makeService().ingestHazard(synthetic({ id: 'c', source: 'community', verificationStatus: 'verified' }));
    assert.equal(stored.verificationStatus, 'unverified');
  });
  it('defaults non-community ingested records to unverified and honours explicit verified', async () => {
    const service = makeService();
    assert.equal((await service.ingestHazard(synthetic({ id: 'd1', source: 'official' }))).verificationStatus, 'unverified');
    assert.equal((await service.ingestHazard(synthetic({ id: 'd2', source: 'official', verificationStatus: 'verified' }))).verificationStatus, 'verified');
  });
});

describe('7-11. grid assignment and aggregation', () => {
  it('assigns cells deterministically with a stable id', () => {
    const a = getGridCell(26.158, 91.805);
    const b = getGridCell(26.158, 91.805);
    assert.deepEqual(a, b);
    assert.equal(a.id, 'g0.01:r11615:c27180');
    assert.deepEqual(a.bounds, { south: 26.15, west: 91.8, north: 26.16, east: 91.81 });
  });
  it('is half-open and tolerant of float noise on boundaries', () => {
    assert.equal(getGridCell(0.03, 0).row, 9003);
    assert.equal(getGridCell(0.0299999, 0).row, 9002);
    assert.equal(getGridCell(26.15, 91.8).id, getGridCell(26.150001, 91.800001).id);
    assert.notEqual(getGridCell(26.1499, 91.75).id, getGridCell(26.1501, 91.75).id);
  });
  it('places the poles and antimeridian in the last row/column', () => {
    const corner = getGridCell(90, 180);
    assert.equal(corner.bounds.north, 90);
    assert.equal(corner.bounds.east, 180);
    assert.equal(corner.row, 17999);
    assert.equal(corner.col, 35999);
    assert.equal(getGridCell(-90, -180).id, 'g0.01:r0:c0');
  });
  it('supports configurable resolution (and includes it in the id)', () => {
    const fine = getGridCell(26.1805, 91.7505, { cellSizeDegrees: 0.001 });
    const coarse = getGridCell(26.1805, 91.7505, { cellSizeDegrees: 0.5 });
    assert.notEqual(fine.id, coarse.id);
    assert.ok(fine.id.startsWith('g0.001:'));
    assert.ok(coarse.bounds.north - coarse.bounds.south > 0.49);
    assert.throws(() => getGridCell(0, 0, { cellSizeDegrees: 0 }), HazardValidationError);
    assert.throws(() => getGridCell(0, 0, { cellSizeDegrees: NaN }), HazardValidationError);
    assert.throws(() => getGridCell(0, 0, { cellSizeDegrees: -1 }), HazardValidationError);
  });
  it('reports approximate physical size that shrinks east-west with latitude', () => {
    const equator = getGridCell(0.005, 10.005).approxSizeMeters;
    const north = getGridCell(60.005, 10.005).approxSizeMeters;
    assert.ok(Math.abs(equator.northSouth - 1112) < 5);
    assert.ok(north.eastWest < equator.eastWest * 0.55);
  });
  it('aggregates counts, severity, latest timestamp, verification and sources', async () => {
    const service = makeService();
    await service.ingestHazard(synthetic({ id: 'h1', severity: 1, reportedAt: '2026-10-29T01:00:00Z', source: 'official', verificationStatus: 'verified', latitude: 26.1801, longitude: 91.7501 }));
    await service.ingestHazard(synthetic({ id: 'h2', severity: 3, reportedAt: '2026-10-29T05:00:00Z', source: 'news', latitude: 26.1802, longitude: 91.7502 }));
    await service.ingestHazard(synthetic({ id: 'h3', severity: 2, reportedAt: '2026-10-29T03:00:00Z', source: 'demo', latitude: 26.1803, longitude: 91.7503 }));
    await service.submitCommunityHazard(communityInput({ latitude: 26.1804, longitude: 91.7504, severity: 2 }));
    await service.ingestHazard(synthetic({ id: 'far', severity: 3, latitude: 26.3, longitude: 91.9 }));

    const summary = await service.getGridSummary();
    assert.equal(summary.length, 2);
    const cell = summary.find((entry) => entry.hazardCount === 4);
    assert.ok(cell);
    assert.equal(cell.maxSeverity, 3);
    assert.equal(cell.averageSeverity, (1 + 3 + 2 + 2) / 4);
    assert.equal(cell.latestReportedAt, '2026-10-29T08:00:00.000Z');
    assert.equal(cell.verifiedCount, 1);
    assert.equal(cell.unverifiedCount, 3);
    assert.deepEqual(cell.sourceCounts, { community: 1, official: 1, news: 1, demo: 1 });
    assert.deepEqual(cell.hazardIds, ['gen-1', 'h1', 'h2', 'h3']);
    assert.equal(cell.coverage, UNKNOWN_COVERAGE);
  });
  it('latestReportedAt uses time order, not input order or offsets', () => {
    const base = { type: 'Flooding', description: 'SYNTHETIC', severity: 1, source: 'demo', verificationStatus: 'unverified', latitude: 26.18, longitude: 91.75 } as const;
    const hazards: Hazard[] = [
      { ...base, id: 'a', reportedAt: '2026-10-29T05:00:00.000Z' },
      { ...base, id: 'b', reportedAt: '2026-10-29T07:00:00.000Z' },
      { ...base, id: 'c', reportedAt: '2026-10-29T06:00:00.000Z' },
    ];
    assert.equal(summarizeHazardsByCell(hazards)[0].latestReportedAt, '2026-10-29T07:00:00.000Z');
  });
  it('is reproducible regardless of input order, and resolution changes grouping', async () => {
    const mk = (id: string, lat: number, lon: number): Hazard => ({
      id, type: 'Flooding', description: 'SYNTHETIC', severity: 2, reportedAt: '2026-10-29T01:00:00.000Z',
      source: 'demo', verificationStatus: 'unverified', latitude: lat, longitude: lon,
    });
    const hazards = [mk('p', 26.1801, 91.7501), mk('q', 26.1951, 91.7701), mk('r', 26.1802, 91.7502)];
    const forward = summarizeHazardsByCell(hazards);
    const reversed = summarizeHazardsByCell([...hazards].reverse());
    assert.deepEqual(forward, reversed);
    assert.equal(forward.length, 2);
    assert.equal(summarizeHazardsByCell(hazards, { cellSizeDegrees: 1 }).length, 1);
  });
});

describe('12-13. geographic distance queries', () => {
  it('haversine matches known distances', () => {
    assert.equal(haversineDistanceMeters(26.18, 91.75, 26.18, 91.75), 0);
    assert.ok(Math.abs(haversineDistanceMeters(0, 0, 0, 1) - 111195) < 100);
    assert.ok(Math.abs(haversineDistanceMeters(0, 0, 1, 0) - 111195) < 100);
    assert.ok(Math.abs(haversineDistanceMeters(0, 179.5, 0, -179.5) - 111195) < 100); // across the antimeridian
  });
  it('returns hazards inside the radius and excludes those outside, nearest first', async () => {
    const service = makeService();
    await service.ingestHazard(synthetic({ id: 'near', latitude: 26.1805, longitude: 91.7505 }));        // ~0 m
    await service.ingestHazard(synthetic({ id: 'mid', latitude: 26.1815, longitude: 91.7505 }));         // ~111 m
    await service.ingestHazard(synthetic({ id: 'out', latitude: 26.1905, longitude: 91.7505 }));         // ~1.1 km
    const found = await service.getHazardsNearPoint(26.1805, 91.7505, 500);
    assert.deepEqual(found.map((hazard) => hazard.id), ['near', 'mid']);
    const withDistance = await service.getHazardsNearPointWithDistance(26.1805, 91.7505, 500);
    assert.ok(Math.abs(withDistance[1].distanceMeters - 111.2) < 1);
  });
  it('radius is inclusive and zero radius matches only identical points', async () => {
    const service = makeService();
    await service.ingestHazard(synthetic({ id: 'same', latitude: 26.18, longitude: 91.75 }));
    await service.ingestHazard(synthetic({ id: 'other', latitude: 26.1801, longitude: 91.75 }));
    assert.deepEqual((await service.getHazardsNearPoint(26.18, 91.75, 0)).map((hazard) => hazard.id), ['same']);
    const exact = haversineDistanceMeters(26.18, 91.75, 26.1801, 91.75);
    assert.equal((await service.getHazardsNearPoint(26.18, 91.75, exact)).length, 2);
    assert.equal((await service.getHazardsNearPoint(26.18, 91.75, exact - 0.001)).length, 1);
  });
  it('finds nearby hazards that sit in different grid cells', async () => {
    const service = makeService();
    const a = await service.ingestHazard(synthetic({ id: 'south', latitude: 26.1799, longitude: 91.7505 }));
    const b = await service.ingestHazard(synthetic({ id: 'north', latitude: 26.1801, longitude: 91.7505 }));
    assert.notEqual(service.getGridCellForCoordinate(a.latitude as number, 91.7505).id, service.getGridCellForCoordinate(b.latitude as number, 91.7505).id);
    const found = await service.getHazardsNearPoint(26.18, 91.7505, 100);
    assert.deepEqual(found.map((hazard) => hazard.id).sort(), ['north', 'south']);
  });
  it('excludes hazards that share a cell with the query point but are far away', async () => {
    const service = makeService();
    await service.ingestHazard(synthetic({ id: 'close', latitude: 0.1, longitude: 0.1 }));
    await service.ingestHazard(synthetic({ id: 'distant', latitude: 0.9, longitude: 0.9 }));
    const config = { cellSizeDegrees: 1 };
    assert.equal(service.getGridCellForCoordinate(0.1, 0.1, config).id, service.getGridCellForCoordinate(0.9, 0.9, config).id);
    assert.deepEqual((await service.getHazardsNearPoint(0.1, 0.1, 1000)).map((hazard) => hazard.id), ['close']);
  });
});

describe('14. empty datasets and unknown coverage', () => {
  it('returns empty collections and no safe/coverage claims', async () => {
    const service = makeService();
    assert.deepEqual(await service.getAllHazards(), []);
    assert.deepEqual(await service.getHazardsNearPoint(26.18, 91.75, 1000), []);
    assert.deepEqual(await service.getGridSummary(), []);
    assert.deepEqual(await service.getUnlocatedHazards(), []);
    assert.deepEqual(summarizeHazardsByCell([]), []);
  });
  it('cell metadata has no safety or coverage score; summaries are flagged unknown', async () => {
    const service = makeService();
    await service.ingestHazard(synthetic({ id: 'one' }));
    const [summary] = await service.getGridSummary();
    assert.equal(summary.coverage, 'unknown');
    for (const key of ['safe', 'risk', 'coverageScore', 'coveragePercent']) assert.ok(!(key in summary) && !(key in summary.cell), key);
  });
  it('keeps hazards with unknown location out of queries and grids without inventing coordinates', async () => {
    const service = makeService();
    const stored = await service.ingestHazard(synthetic({ id: 'nowhere', source: 'news', latitude: null, longitude: null }));
    assert.equal(isLocatedHazard(stored), false);
    assert.equal(stored.latitude, null);
    assert.deepEqual(await service.getAllHazards(), []);
    assert.deepEqual(await service.getGridSummary(), []);
    assert.deepEqual(await service.getHazardsNearPoint(0, 0, 1e9), []);
    const unlocated = await service.getUnlocatedHazards();
    assert.equal(unlocated.length, 1);
    assert.equal(unlocated[0].longitude, null);
    const omitted = await service.ingestHazard(synthetic({ id: 'omitted', latitude: undefined, longitude: undefined }));
    assert.equal(omitted.latitude, null);
  });
});

describe('15. invalid query coordinates and radius', () => {
  const service = makeService();
  for (const [name, lat, lon] of [['lat 91', 91, 0], ['lon -181', 0, -181], ['NaN lat', NaN, 0], ['Infinity lon', 0, Infinity]] as const) {
    it(`getHazardsNearPoint rejects ${name}`, async () => {
      await assertRejects(service.getHazardsNearPoint(lat, lon, 100));
    });
  }
  for (const radius of [-1, NaN, Infinity, -Infinity, '5' as unknown as number]) {
    it(`getHazardsNearPoint rejects radius ${String(radius)}`, async () => {
      await assertRejects(service.getHazardsNearPoint(26.18, 91.75, radius), 'radiusMeters');
    });
  }
  it('getGridCellForCoordinate throws synchronously on invalid input', () => {
    assert.throws(() => service.getGridCellForCoordinate(NaN, 0), HazardValidationError);
    assert.throws(() => service.getGridCellForCoordinate(0, 200), HazardValidationError);
  });
});

describe('16. duplicate identifiers and store behaviour', () => {
  it('rejects duplicate ingested ids and does not overwrite the original', async () => {
    const service = makeService();
    await service.ingestHazard(synthetic({ id: 'dup', severity: 1 }));
    await assert.rejects(service.ingestHazard(synthetic({ id: 'dup', severity: 3 })), DuplicateHazardIdError);
    assert.equal((await service.getAllHazards())[0].severity, 1);
  });
  it('treats located and unlocated records as one id space', async () => {
    const service = makeService();
    await service.ingestHazard(synthetic({ id: 'shared' }));
    await assert.rejects(service.ingestHazard(synthetic({ id: 'shared', latitude: null, longitude: null })), DuplicateHazardIdError);
  });
  it('rejects a generated id collision', async () => {
    const service = createHazardService({ now: () => NOW, generateId: () => 'always-same' });
    await service.submitCommunityHazard(communityInput());
    await assert.rejects(service.submitCommunityHazard(communityInput()), DuplicateHazardIdError);
  });
  it('store returns copies so callers cannot mutate stored data', async () => {
    const store = new InMemoryHazardStore();
    const service = createHazardService({ store, now: () => NOW, generateId: () => 'id-1' });
    const created = await service.submitCommunityHazard(communityInput());
    created.verificationStatus = 'verified';
    (await service.getAllHazards())[0].severity = 3;
    const fresh = await store.getById('id-1');
    assert.equal(fresh?.verificationStatus, 'unverified');
    assert.equal(fresh?.severity, 2);
    assert.equal(await store.getById('missing'), null);
  });
  it('separate in-memory services do not share data', async () => {
    const one = makeService();
    const two = makeService();
    await one.submitCommunityHazard(communityInput());
    assert.equal((await two.getAllHazards()).length, 0);
  });
});
