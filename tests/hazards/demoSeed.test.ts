import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DuplicateHazardIdError,
  createHazardService,
} from '../../frontend/hazards';
import { DEMO_HAZARDS } from '../../frontend/hazards/demoSeed';

describe('demo seed validation', () => {
  it('has unique IDs across all demo hazards', () => {
    const ids = DEMO_HAZARDS.map((h) => h.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size, 'All demo hazard IDs must be unique');
    assert.equal(ids.length, 3, 'Must contain 3 demo hazards');
    assert.deepEqual(ids.sort(), ['h-culvert', 'h-lights', 'h-market'].sort());
  });

  it('all demo hazards have source === "demo"', () => {
    for (const hazard of DEMO_HAZARDS) {
      assert.equal(hazard.source, 'demo', `Hazard ${hazard.id} must have source === 'demo'`);
    }
  });

  it('all demo hazards have coordinates inside the Guwahati area (lat 25.9-26.4, lon 91.5-92.1)', () => {
    for (const hazard of DEMO_HAZARDS) {
      assert.ok(typeof hazard.latitude === 'number', `Hazard ${hazard.id} must have numeric latitude`);
      assert.ok(typeof hazard.longitude === 'number', `Hazard ${hazard.id} must have numeric longitude`);
      assert.ok(
        hazard.latitude >= 25.9 && hazard.latitude <= 26.4,
        `Hazard ${hazard.id} latitude ${hazard.latitude} must be within [25.9, 26.4]`,
      );
      assert.ok(
        hazard.longitude >= 91.5 && hazard.longitude <= 92.1,
        `Hazard ${hazard.id} longitude ${hazard.longitude} must be within [91.5, 92.1]`,
      );
    }
  });

  it('all demo hazards pass validation through ingestHazard', async () => {
    const service = createHazardService();
    for (const item of DEMO_HAZARDS) {
      const ingested = await service.ingestHazard(item);
      assert.equal(ingested.id, item.id);
      assert.equal(ingested.type, item.type);
      assert.equal(ingested.severity, item.severity);
      assert.equal(ingested.verificationStatus, item.verificationStatus);
      assert.equal(ingested.latitude, item.latitude);
      assert.equal(ingested.longitude, item.longitude);
    }
    const all = await service.getAllHazards();
    assert.equal(all.length, 3);
  });

  it('seeding twice is handled safely (duplicate ID throws DuplicateHazardIdError and original is preserved)', async () => {
    const service = createHazardService();
    // First seed
    for (const item of DEMO_HAZARDS) {
      await service.ingestHazard(item);
    }
    assert.equal((await service.getAllHazards()).length, 3);

    // Second seed: attempting to ingest again triggers DuplicateHazardIdError
    let caughtCount = 0;
    for (const item of DEMO_HAZARDS) {
      try {
        await service.ingestHazard(item);
      } catch (error) {
        if (error instanceof DuplicateHazardIdError) {
          caughtCount++;
          assert.equal(error.hazardId, item.id);
        } else {
          throw error;
        }
      }
    }
    assert.equal(caughtCount, 3, 'All 3 duplicate ingests should throw DuplicateHazardIdError');
    assert.equal((await service.getAllHazards()).length, 3, 'Store must still have exactly 3 hazards');
  });
});
