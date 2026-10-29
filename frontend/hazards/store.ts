import { DuplicateHazardIdError } from './errors';
import { isLocatedHazard } from './types';
import type { Hazard, StoredHazard, UnlocatedHazard } from './types';

/**
 * Storage abstraction. Implement this interface to back the service with a real database later.
 * All methods are async so a network/database adapter can be dropped in without changing callers.
 */
export interface HazardStore {
  /** Inserts a hazard. MUST reject with `DuplicateHazardIdError` if `id` already exists (located or not). */
  insert(hazard: StoredHazard): Promise<void>;
  /** All hazards that have coordinates. */
  listLocated(): Promise<Hazard[]>;
  /** All hazards whose location is unknown. */
  listUnlocated(): Promise<UnlocatedHazard[]>;
  getById(id: string): Promise<StoredHazard | null>;
}

/**
 * TEMPORARY, in-memory adapter for local development and tests.
 *  - NOT persistent: data is lost on page reload or process restart.
 *  - NOT shared: each browser tab / user has its own private copy; nothing is synchronised.
 *  - Returns copies, so callers cannot mutate stored records.
 */
export class InMemoryHazardStore implements HazardStore {
  private readonly records = new Map<string, StoredHazard>();

  async insert(hazard: StoredHazard): Promise<void> {
    if (this.records.has(hazard.id)) throw new DuplicateHazardIdError(hazard.id);
    this.records.set(hazard.id, { ...hazard });
  }

  async listLocated(): Promise<Hazard[]> {
    return [...this.records.values()].filter(isLocatedHazard).map((hazard) => ({ ...hazard }));
  }

  async listUnlocated(): Promise<UnlocatedHazard[]> {
    return [...this.records.values()]
      .filter((hazard): hazard is UnlocatedHazard => !isLocatedHazard(hazard))
      .map((hazard) => ({ ...hazard }));
  }

  async getById(id: string): Promise<StoredHazard | null> {
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }
}
