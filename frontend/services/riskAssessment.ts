import { getHazardsNearRoute, scoreRouteRisk } from '../riskEngine';
import type { HazardInput } from '../riskEngine';
import type { Hazard } from '../types/hazard';
import type { Route } from '../types/route';
import { demoPointToLatLng } from '../utils/coordinates';

/** Map local demo-only display records to the risk engine's provider-neutral input. */
export function adaptDemoHazards(hazards: Hazard[], includeGuwahatiData: boolean): HazardInput[] {
  if (!includeGuwahatiData) return [];

  return hazards.map((hazard) => {
    const [lat, lng] = (hazard.lat !== undefined && hazard.lng !== undefined) ? [hazard.lat, hazard.lng] : demoPointToLatLng(hazard.point);
    const type = hazard.type === 'Road closure'
      ? 'road_closure'
      : hazard.type === 'Road obstruction'
        ? 'road_obstruction'
        : hazard.type === 'Low lighting'
          ? 'low_lighting'
          : hazard.type === 'Pothole'
            ? 'pothole'
            : hazard.type === 'Flooding'
              ? 'flooding'
              : 'traffic_incident';

    return {
      id: hazard.id,
      type,
      lat,
      lng,
      severity: hazard.severity === 'Severe'
        ? 5
        : hazard.severity === 'High'
          ? 4
          : hazard.severity === 'Medium'
            ? 3
            : 2,
      description: hazard.summary,
      timestamp: hazard.reportedAtMs,
      source: (hazard.origin ?? 'demo') as 'demo' | 'community' | 'official' | 'unknown',
      verification: hazard.verification === 'Verified' ? 'verified' : 'unverified',
    };
  });
}

/** Return demo records whose approximate positions fall within the active road corridor. */
export function getHazardsAlongRoute(route: Route | null, hazards: Hazard[], includeGuwahatiData: boolean): Hazard[] {
  if (!route || !includeGuwahatiData) return [];

  const nearbyIds = new Set(getHazardsNearRoute({
    id: route.id,
    coordinates: route.coordinates.map(([lng, lat]) => ({ lat, lng })),
    distanceM: route.distanceMeters,
    durationS: route.durationSeconds,
  }, adaptDemoHazards(hazards, true)).map(({ hazard }) => hazard.id));

  return hazards.filter((hazard) => nearbyIds.has(hazard.id));
}

/** Convert OSRM route UI values and score each candidate against supplied hazards. */
export function assessRoutes(routes: Route[], hazards: HazardInput[]) {
  return routes.map((route) => scoreRouteRisk({
    id: route.id,
    coordinates: route.coordinates.map(([lng, lat]) => ({ lat, lng })),
    distanceM: route.distanceMeters,
    durationS: route.durationSeconds,
  }, hazards));
}

import type { ExternalIncident } from './incidents';

/**
 * Adapter converting external ingested incidents to the risk engine's HazardInput.
 * Returns null if the incident lacks usable coordinates or is not scoreable.
 *
 * Rules:
 * 1. Only 'source_coordinates' is scoreable as 'exact_unverified'.
 * 2. 'area_text', 'region_level', 'none', 'ambiguous' are display-only (return null).
 * 3. Incidents with missing or non-finite lat/lng return null.
 * 4. External news incidents are always 'unverified'.
 * 5. Category is mapped to canonical snake_case hazard type.
 */
export function incidentToHazardInput(incident: ExternalIncident): HazardInput | null {
  // Only source_coordinates provides an actionable point
  if (incident.locationConfidence !== 'source_coordinates') {
    return null;
  }

  const lat = incident.latitude;
  const lng = incident.longitude;
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  // Canonical snake_case type mapping
  const cat = incident.category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const type = cat.includes('closure')
    ? 'road_closure'
    : cat.includes('obstruction')
      ? 'road_obstruction'
      : cat.includes('lighting')
        ? 'low_lighting'
        : cat.includes('pothole')
          ? 'pothole'
          : cat.includes('flood') || cat.includes('water')
            ? 'flooding'
            : cat.includes('accident') || cat.includes('collision') || cat.includes('traffic')
              ? 'traffic_incident'
              : cat || 'hazard';

  const ts = incident.publishedAt ? new Date(incident.publishedAt).getTime() : null;

  return {
    id: incident.id,
    type,
    lat,
    lng,
    severity: 3, // Default moderate severity when unrated
    description: incident.description,
    timestamp: Number.isFinite(ts) ? ts : null,
    source: 'unknown',
    verification: 'unverified',
    confidence: 0.6, // Lower confidence for unverified source coordinates
  };
}

/**
 * Adapt a collection of external incidents into HazardInput array,
 * dropping unscoreable records.
 */
export function adaptExternalIncidents(incidents: ExternalIncident[]): HazardInput[] {
  return incidents.flatMap((inc) => {
    const input = incidentToHazardInput(inc);
    return input ? [input] : [];
  });
}
