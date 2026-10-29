/**
 * Shared hazard data model (Person B).
 *
 * Mapping from the legacy, App.tsx-local demo type (not exported, pixel-based):
 *   severity  'Low' | 'Medium' | 'High'              -> 1 | 2 | 3
 *   verification 'Verified'                          -> 'verified'
 *   verification 'Reported' | 'Needs review'         -> 'unverified'
 *   point {x, y} (screen-space)                      -> latitude / longitude (WGS84 degrees)
 */

export const HAZARD_TYPES = ['Road obstruction', 'Low lighting', 'Flooding', 'Traffic incident'] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

/** `demo` records are simulated and must never be presented as real current incidents. */
export const HAZARD_SOURCES = ['community', 'official', 'news', 'demo'] as const;
export type HazardSource = (typeof HAZARD_SOURCES)[number];

export const VERIFICATION_STATUSES = ['unverified', 'verified'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * Severity scale (integers only):
 *   1 = Low    - minor inconvenience or evidence gap
 *   2 = Medium - noticeable delay or hazard; caution advised
 *   3 = High   - serious hazard or blockage
 */
export const SEVERITY_LEVELS = [1, 2, 3] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];
export const SEVERITY_LABELS: Readonly<Record<Severity, 'Low' | 'Medium' | 'High'>> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

export type LocationConfidence = 'exact' | 'approximate';

interface HazardBase {
  /** Unique, non-empty identifier (max 128 chars). */
  id: string;
  type: HazardType;
  description: string;
  severity: Severity;
  /** ISO 8601, always normalised to UTC with milliseconds, e.g. `2026-10-29T08:00:00.000Z`. */
  reportedAt: string;
  source: HazardSource;
  verificationStatus: VerificationStatus;
  /** Optional short title (preserved from the existing UI model). */
  title?: string;
  /** Optional human-readable place name (preserved from the existing UI model). */
  locationLabel?: string;
  /** Optional http(s) URL of the originating source (e.g. a news article). */
  sourceUrl?: string;
  /** Optional UTC ISO timestamp of when an external record was retrieved. */
  retrievedAt?: string;
  locationConfidence?: LocationConfidence;
}

/** A hazard with reliable WGS84 coordinates (decimal degrees). */
export interface Hazard extends HazardBase {
  latitude: number;
  longitude: number;
}

/**
 * A hazard whose location is genuinely unknown. Coordinates are explicitly `null`;
 * they are never invented. Unlocated hazards are excluded from distance queries and grid summaries.
 */
export interface UnlocatedHazard extends HazardBase {
  latitude: null;
  longitude: null;
}

export type StoredHazard = Hazard | UnlocatedHazard;

export function isLocatedHazard(hazard: StoredHazard): hazard is Hazard {
  return hazard.latitude !== null && hazard.longitude !== null;
}

/**
 * Untrusted community submission. Only these fields are read. `id`, `source`, `verificationStatus`
 * and `reportedAt` are always assigned by the service; any client-supplied values are ignored.
 */
export interface CommunityHazardInput {
  type: HazardType;
  description: string;
  latitude: number;
  longitude: number;
  severity: Severity;
  title?: string;
  locationLabel?: string;
}

/**
 * Normalised record from a trusted, server-side/application-side producer (e.g. Person A's ingestion).
 * `id` and `reportedAt` are required. `latitude`/`longitude` may both be omitted/null for an unknown location.
 * `verificationStatus` defaults to `unverified`; records with `source: 'community'` are always `unverified`.
 */
export interface TrustedHazardInput {
  id: string;
  type: HazardType;
  description: string;
  severity: Severity;
  reportedAt: string;
  source: HazardSource;
  latitude?: number | null;
  longitude?: number | null;
  verificationStatus?: VerificationStatus;
  title?: string;
  locationLabel?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  locationConfidence?: LocationConfidence;
}
