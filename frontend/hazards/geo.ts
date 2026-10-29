import { HazardValidationError } from './errors';
import type { ValidationIssue } from './errors';

/** Mean Earth radius in metres (IUGG). Haversine assumes a sphere: error is up to ~0.5% vs. the WGS84 ellipsoid. */
export const EARTH_RADIUS_METERS = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Returns an error message, or `null` when `value` is a finite latitude in [-90, 90]. */
export function latitudeProblem(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a finite number';
  if (value < -90 || value > 90) return 'must be between -90 and 90';
  return null;
}

/** Returns an error message, or `null` when `value` is a finite longitude in [-180, 180]. */
export function longitudeProblem(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a finite number';
  if (value < -180 || value > 180) return 'must be between -180 and 180';
  return null;
}

export function coordinateIssues(latitude: unknown, longitude: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const latitudeMessage = latitudeProblem(latitude);
  const longitudeMessage = longitudeProblem(longitude);
  if (latitudeMessage) issues.push({ field: 'latitude', message: latitudeMessage });
  if (longitudeMessage) issues.push({ field: 'longitude', message: longitudeMessage });
  return issues;
}

/** Throws `HazardValidationError` unless both coordinates are valid. */
export function assertValidCoordinate(latitude: unknown, longitude: unknown): void {
  const issues = coordinateIssues(latitude, longitude);
  if (issues.length > 0) throw new HazardValidationError(issues);
}

/** Throws `HazardValidationError` unless `radiusMeters` is a finite, non-negative number. */
export function assertValidRadius(radiusMeters: unknown): void {
  if (typeof radiusMeters !== 'number' || !Number.isFinite(radiusMeters) || radiusMeters < 0) {
    throw new HazardValidationError([{ field: 'radiusMeters', message: 'must be a finite, non-negative number of metres' }]);
  }
}

/** Great-circle (Haversine) distance in metres between two WGS84 points. Inputs must already be valid. */
export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);
  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}
