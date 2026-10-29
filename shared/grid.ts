/**
 * Spatial grid helpers for fast bounding-box queries.
 * Uses ~1.1 km cells (0.01° at equator) — fine enough for urban hazard lookup.
 */

/** Size of each grid cell in degrees. */
export const CELL_SIZE_DEG = 0.01;

/** Return the canonical grid cell key for a coordinate. */
export function cellKey(lat: number, lng: number): string {
  const row = Math.floor(lat / CELL_SIZE_DEG);
  const col = Math.floor(lng / CELL_SIZE_DEG);
  return `${row},${col}`;
}

/** Return all cell keys that overlap a bounding box (inclusive). */
export function cellsForBBox(box: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): string[] {
  const minRow = Math.floor(box.minLat / CELL_SIZE_DEG);
  const maxRow = Math.floor(box.maxLat / CELL_SIZE_DEG);
  const minCol = Math.floor(box.minLng / CELL_SIZE_DEG);
  const maxCol = Math.floor(box.maxLng / CELL_SIZE_DEG);

  const keys: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      keys.push(`${r},${c}`);
    }
  }
  return keys;
}
