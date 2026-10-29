import { assertValidCoordinate, assertValidRadius, haversineDistanceMeters } from './geo';
import { DEFAULT_GRID_CONFIG, getGridCell, summarizeHazardsByCell } from './grid';
import type { GridCell, GridCellSummary, GridConfig } from './grid';
import { InMemoryHazardStore } from './store';
import type { HazardStore } from './store';
import type { CommunityHazardInput, Hazard, StoredHazard, TrustedHazardInput, UnlocatedHazard } from './types';
import { buildCommunityHazard, buildTrustedHazard } from './validation';

export interface HazardWithDistance {
  hazard: Hazard;
  distanceMeters: number;
}

export interface HazardService {
  /** All hazards that have coordinates (copies). Does not include unlocated hazards. */
  getAllHazards(): Promise<Hazard[]>;
  /** Hazards with an unknown location. They never appear in distance queries or grid summaries. */
  getUnlocatedHazards(): Promise<UnlocatedHazard[]>;
  /** Hazards within `radiusMeters` (inclusive) by Haversine distance, nearest first. Throws on invalid input. */
  getHazardsNearPoint(lat: number, lon: number, radiusMeters: number): Promise<Hazard[]>;
  /** Same as `getHazardsNearPoint` but includes the distance in metres. */
  getHazardsNearPointWithDistance(lat: number, lon: number, radiusMeters: number): Promise<HazardWithDistance[]>;
  /** Per-cell aggregates for cells that contain at least one hazard, sorted by (row, col). */
  getGridSummary(config?: GridConfig): Promise<GridCellSummary[]>;
  /** Synchronous, pure cell lookup for a coordinate. */
  getGridCellForCoordinate(lat: number, lon: number, config?: GridConfig): GridCell;
  /** Untrusted path (UI). Always stored as `source: 'community'`, `unverified`, `reportedAt = now`. */
  submitCommunityHazard(input: CommunityHazardInput): Promise<Hazard>;
  /** Trusted path (Person A's normalised external records). Id and reportedAt required. */
  ingestHazard(input: TrustedHazardInput): Promise<StoredHazard>;
}

export interface HazardServiceOptions {
  store?: HazardStore;
  gridConfig?: GridConfig;
  /** Injectable clock (tests). */
  now?: () => Date;
  /** Injectable id generator (tests). Must return unique ids. */
  generateId?: () => string;
}

let fallbackCounter = 0;
export function defaultIdGenerator(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return `hz-${cryptoApi.randomUUID()}`;
  fallbackCounter += 1;
  return `hz-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createHazardService(options: HazardServiceOptions = {}): HazardService {
  const store = options.store ?? new InMemoryHazardStore();
  const defaultGrid = options.gridConfig ?? DEFAULT_GRID_CONFIG;
  const now = options.now ?? (() => new Date());
  const generateId = options.generateId ?? defaultIdGenerator;

  const near = async (lat: number, lon: number, radiusMeters: number): Promise<HazardWithDistance[]> => {
    assertValidCoordinate(lat, lon);
    assertValidRadius(radiusMeters);
    const hazards = await store.listLocated();
    return hazards
      .map((hazard) => ({ hazard, distanceMeters: haversineDistanceMeters(lat, lon, hazard.latitude, hazard.longitude) }))
      .filter((entry) => entry.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters || a.hazard.id.localeCompare(b.hazard.id));
  };

  return {
    getAllHazards: () => store.listLocated(),
    getUnlocatedHazards: () => store.listUnlocated(),
    getHazardsNearPoint: async (lat, lon, radiusMeters) => (await near(lat, lon, radiusMeters)).map((entry) => entry.hazard),
    getHazardsNearPointWithDistance: near,
    getGridSummary: async (config = defaultGrid) => summarizeHazardsByCell(await store.listLocated(), config),
    getGridCellForCoordinate: (lat, lon, config = defaultGrid) => getGridCell(lat, lon, config),
    submitCommunityHazard: async (input) => {
      const hazard = buildCommunityHazard(input, { id: generateId(), now: now() });
      await store.insert(hazard);
      return { ...hazard };
    },
    ingestHazard: async (input) => {
      const hazard = buildTrustedHazard(input, { now: now() });
      await store.insert(hazard);
      return { ...hazard };
    },
  };
}

/**
 * Default app-wide service backed by the TEMPORARY in-memory store (not persistent, not shared).
 * Starts EMPTY: no seed data and no fabricated incidents.
 */
export const defaultHazardService: HazardService = createHazardService();

export const getAllHazards = (): Promise<Hazard[]> => defaultHazardService.getAllHazards();
export const getUnlocatedHazards = (): Promise<UnlocatedHazard[]> => defaultHazardService.getUnlocatedHazards();
export const getHazardsNearPoint = (lat: number, lon: number, radiusMeters: number): Promise<Hazard[]> =>
  defaultHazardService.getHazardsNearPoint(lat, lon, radiusMeters);
export const getHazardsNearPointWithDistance = (lat: number, lon: number, radiusMeters: number): Promise<HazardWithDistance[]> =>
  defaultHazardService.getHazardsNearPointWithDistance(lat, lon, radiusMeters);
export const getGridSummary = (config?: GridConfig): Promise<GridCellSummary[]> => defaultHazardService.getGridSummary(config);
export const getGridCellForCoordinate = (lat: number, lon: number, config?: GridConfig): GridCell =>
  defaultHazardService.getGridCellForCoordinate(lat, lon, config);
export const submitCommunityHazard = (input: CommunityHazardInput): Promise<Hazard> => defaultHazardService.submitCommunityHazard(input);
export const ingestHazard = (input: TrustedHazardInput): Promise<StoredHazard> => defaultHazardService.ingestHazard(input);
