import { HazardValidationError } from './errors';
import { haversineDistanceMeters, assertValidCoordinate } from './geo';
import { HAZARD_SOURCES } from './types';
import type { Hazard, HazardSource } from './types';

/**
 * Geographic grid scheme: an equirectangular latitude/longitude grid ("degree grid").
 *
 *  - row = floor((latitude  + 90)  / cellSizeDegrees)   (row 0 starts at the south pole)
 *  - col = floor((longitude + 180) / cellSizeDegrees)   (col 0 starts at the antimeridian, -180)
 *  - Cells are half-open: [south, north) x [west, east). Latitude 90 and longitude 180 belong to the
 *    last row/column. Longitude +180 is NOT wrapped to -180.
 *  - If cellSizeDegrees does not divide 180/360 evenly, the last row/column is narrower.
 *  - A tiny tolerance (1e-9 cell widths) absorbs floating-point noise so values on a boundary such as
 *    0.03 deg with 0.01 deg cells land in the expected cell. Assignment is fully deterministic.
 *
 * LIMITATIONS: cells are uniform in DEGREES, not metres. North-south size is ~111 km per degree everywhere,
 * but east-west size shrinks with cos(latitude) (~100 km/degree at Guwahati, 0 at the poles). Each cell
 * reports its approximate real size in `approxSizeMeters`. The grid is for aggregation/display only;
 * nearby-hazard queries use Haversine distance, never cell ids.
 */

export const DEFAULT_CELL_SIZE_DEGREES = 0.01;
export const MIN_CELL_SIZE_DEGREES = 1e-6;
export const MAX_CELL_SIZE_DEGREES = 90;

export interface GridConfig {
  /** Cell edge length in degrees of latitude and longitude. Default 0.01 (~1.1 km N-S). */
  cellSizeDegrees: number;
}

export const DEFAULT_GRID_CONFIG: Readonly<GridConfig> = { cellSizeDegrees: DEFAULT_CELL_SIZE_DEGREES };

export interface GridBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface GridCell {
  /** Stable id: `g{cellSizeDegrees}:r{row}:c{col}`, e.g. `g0.01:r11615:c27180`. Includes the resolution. */
  id: string;
  row: number;
  col: number;
  cellSizeDegrees: number;
  bounds: GridBounds;
  center: { latitude: number; longitude: number };
  /** Approximate physical size at the cell centre (spherical Earth). Varies by latitude. */
  approxSizeMeters: { northSouth: number; eastWest: number };
}

/**
 * Coverage is NOT tracked by this application. Every summary carries `'unknown'`.
 * A cell with no summary has no reports, which does NOT mean it is safe or has been surveyed.
 */
export type DataCoverage = 'unknown';
export const UNKNOWN_COVERAGE: DataCoverage = 'unknown';

export interface GridCellSummary {
  cell: GridCell;
  hazardCount: number;
  /** Highest severity (1-3) among hazards in the cell. */
  maxSeverity: number;
  /** Arithmetic mean severity, unrounded (sum / count). */
  averageSeverity: number;
  /** Latest `reportedAt` (UTC ISO) among hazards in the cell. */
  latestReportedAt: string;
  verifiedCount: number;
  unverifiedCount: number;
  sourceCounts: Record<HazardSource, number>;
  /** Ids of hazards in the cell, sorted lexicographically. */
  hazardIds: string[];
  coverage: DataCoverage;
}

const BOUNDARY_TOLERANCE = 1e-9;
const roundDegrees = (value: number) => Math.round(value * 1e9) / 1e9;

export function assertValidGridConfig(config: GridConfig): void {
  const size = config?.cellSizeDegrees;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < MIN_CELL_SIZE_DEGREES || size > MAX_CELL_SIZE_DEGREES) {
    throw new HazardValidationError([
      { field: 'cellSizeDegrees', message: `must be a finite number between ${MIN_CELL_SIZE_DEGREES} and ${MAX_CELL_SIZE_DEGREES}` },
    ]);
  }
}

/** Returns the grid cell containing a coordinate. Throws `HazardValidationError` for invalid input. */
export function getGridCell(latitude: number, longitude: number, config: GridConfig = DEFAULT_GRID_CONFIG): GridCell {
  assertValidCoordinate(latitude, longitude);
  assertValidGridConfig(config);
  const size = config.cellSizeDegrees;

  const rowCount = Math.ceil(180 / size - BOUNDARY_TOLERANCE);
  const colCount = Math.ceil(360 / size - BOUNDARY_TOLERANCE);
  const row = Math.min(rowCount - 1, Math.floor((latitude + 90) / size + BOUNDARY_TOLERANCE));
  const col = Math.min(colCount - 1, Math.floor((longitude + 180) / size + BOUNDARY_TOLERANCE));

  const south = roundDegrees(-90 + row * size);
  const west = roundDegrees(-180 + col * size);
  const north = roundDegrees(Math.min(90, south + size));
  const east = roundDegrees(Math.min(180, west + size));
  const centerLatitude = roundDegrees((south + north) / 2);
  const centerLongitude = roundDegrees((west + east) / 2);

  return {
    id: `g${size}:r${row}:c${col}`,
    row,
    col,
    cellSizeDegrees: size,
    bounds: { south, west, north, east },
    center: { latitude: centerLatitude, longitude: centerLongitude },
    approxSizeMeters: {
      northSouth: haversineDistanceMeters(south, centerLongitude, north, centerLongitude),
      eastWest: haversineDistanceMeters(centerLatitude, west, centerLatitude, east),
    },
  };
}

/**
 * Aggregates located hazards by grid cell. Pure and deterministic: the output is sorted by (row, col)
 * and does not depend on input order. Cells with no hazards are omitted (absence != safe).
 */
export function summarizeHazardsByCell(hazards: readonly Hazard[], config: GridConfig = DEFAULT_GRID_CONFIG): GridCellSummary[] {
  assertValidGridConfig(config);
  interface Accumulator {
    cell: GridCell;
    count: number;
    severitySum: number;
    maxSeverity: number;
    latestMs: number;
    latest: string;
    verified: number;
    unverified: number;
    sources: Record<HazardSource, number>;
    ids: string[];
  }
  const cells = new Map<string, Accumulator>();

  for (const hazard of hazards) {
    const cell = getGridCell(hazard.latitude, hazard.longitude, config);
    let acc = cells.get(cell.id);
    if (!acc) {
      const sources = Object.fromEntries(HAZARD_SOURCES.map((source) => [source, 0])) as Record<HazardSource, number>;
      acc = { cell, count: 0, severitySum: 0, maxSeverity: 0, latestMs: -Infinity, latest: hazard.reportedAt, verified: 0, unverified: 0, sources, ids: [] };
      cells.set(cell.id, acc);
    }
    acc.count += 1;
    acc.severitySum += hazard.severity;
    acc.maxSeverity = Math.max(acc.maxSeverity, hazard.severity);
    const reportedMs = Date.parse(hazard.reportedAt);
    if (reportedMs > acc.latestMs) {
      acc.latestMs = reportedMs;
      acc.latest = hazard.reportedAt;
    }
    if (hazard.verificationStatus === 'verified') acc.verified += 1;
    else acc.unverified += 1;
    acc.sources[hazard.source] += 1;
    acc.ids.push(hazard.id);
  }

  return [...cells.values()]
    .sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col)
    .map((acc): GridCellSummary => ({
      cell: acc.cell,
      hazardCount: acc.count,
      maxSeverity: acc.maxSeverity,
      averageSeverity: acc.severitySum / acc.count,
      latestReportedAt: acc.latest,
      verifiedCount: acc.verified,
      unverifiedCount: acc.unverified,
      sourceCounts: acc.sources,
      hazardIds: acc.ids.sort(),
      coverage: UNKNOWN_COVERAGE,
    }));
}
