import type { UnifiedHazard } from './hazardContract.ts';

/**
 * Abstract hazard store interface.
 * Implementations may be in-memory (demo) or file-backed (persistent).
 */
export interface HazardStore {
  put(hazard: UnifiedHazard): void;
  get(id: string): UnifiedHazard | undefined;
  list(): UnifiedHazard[];
  queryBBox(box: { minLat: number; maxLat: number; minLng: number; maxLng: number }): UnifiedHazard[];
  health(): { ok: boolean; count: number; backend: string };
}

/**
 * In-memory hazard store for the demo. Data is lost on restart.
 */
export class InMemoryHazardStore implements HazardStore {
  private readonly records = new Map<string, UnifiedHazard>();

  put(hazard: UnifiedHazard): void {
    this.records.set(hazard.id, hazard);
  }

  get(id: string): UnifiedHazard | undefined {
    return this.records.get(id);
  }

  list(): UnifiedHazard[] {
    return Array.from(this.records.values());
  }

  queryBBox(box: { minLat: number; maxLat: number; minLng: number; maxLng: number }): UnifiedHazard[] {
    return this.list().filter((h) => {
      if (h.lat === null || h.lng === null) return false;
      return h.lat >= box.minLat && h.lat <= box.maxLat && h.lng >= box.minLng && h.lng <= box.maxLng;
    });
  }

  health(): { ok: boolean; count: number; backend: string } {
    return { ok: true, count: this.records.size, backend: 'in-memory' };
  }
}

