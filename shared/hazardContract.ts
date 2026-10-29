/**
 * Unified hazard contract shared between ingestion, storage, and frontend.
 * This is the canonical shape for any hazard record that crosses a service boundary.
 */

export type LocationConfidence =
  | 'exact_verified'
  | 'exact_unverified'
  | 'geocoded_named'
  | 'area'
  | 'unknown';

export type HazardOrigin = 'official' | 'news' | 'community' | 'demo';

export type HazardVerificationStatus =
  | 'verified'
  | 'unverified'
  | 'disputed'
  | 'resolved';

export interface UnifiedHazard {
  id: string;
  category: string;
  summary: string;
  placeText: string | null;
  lat: number | null;
  lng: number | null;
  locationConfidence: LocationConfidence;
  severity: number | null;
  verificationStatus: HazardVerificationStatus;
  origin: HazardOrigin;
  sourceUrl: string | null;
  publisher: string | null;
  eventTime: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
  lastRetrievedAt: string;
  expiresAt: string | null;
}

/**
 * Bridge ingestion location confidence to the unified taxonomy.
 *
 * Ingestion uses: none | ambiguous | region_level | area_text | source_coordinates
 * Unified uses:   exact_verified | exact_unverified | geocoded_named | area | unknown
 */
export function bridgeLocationConfidence(
  ingestionConfidence: string,
): LocationConfidence {
  switch (ingestionConfidence) {
    case 'source_coordinates':
      return 'exact_unverified';
    case 'area_text':
    case 'region_level':
      return 'area';
    case 'none':
    case 'ambiguous':
    default:
      return 'unknown';
  }
}

/**
 * Whether a hazard's location confidence is precise enough to affect route scoring.
 * Area-level and unknown records are display-only.
 */
export function isScoreable(confidence: LocationConfidence): boolean {
  return confidence === 'exact_verified' || confidence === 'exact_unverified' || confidence === 'geocoded_named';
}

