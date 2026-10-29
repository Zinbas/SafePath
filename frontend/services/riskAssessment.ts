import { scoreRouteRisk } from '../riskEngine';
import type { HazardInput } from '../riskEngine';
import type { Hazard as ServiceHazard } from '../hazards';
import type { Hazard } from '../types/hazard';
import type { Route } from '../types/route';
import { demoPointToLatLng } from '../utils/coordinates';

/** Map local demo-only display records to the risk engine's provider-neutral input. */
export function adaptDemoHazards(hazards: Hazard[], includeGuwahatiData: boolean): HazardInput[] {
  if (!includeGuwahatiData) return [];

  return hazards.map((hazard) => {
    const [lat, lng] = demoPointToLatLng(hazard.point);
    const type = hazard.type === 'Road closure'
      ? 'road_closure'
      : hazard.type === 'Road obstruction'
        ? 'road_obstruction'
        : hazard.type === 'Low lighting'
          ? 'low_lighting'
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
      source: 'demo',
      verification: hazard.verification === 'Verified' ? 'verified' : 'unverified',
    };
  });
}

/** Map canonical hazard-service records to the route engine without fabricating locations or provenance. */
export function adaptHazardServiceRecords(hazards: ServiceHazard[], includeGuwahatiData: boolean): HazardInput[] {
  if (!includeGuwahatiData) return [];

  return hazards
    .filter((hazard) => hazard.latitude >= 25.9 && hazard.latitude <= 26.4 && hazard.longitude >= 91.5 && hazard.longitude <= 92.1)
    .map((hazard) => ({
      id: hazard.id,
      type: hazard.type === 'Road closure'
        ? 'road_closure'
        : hazard.type === 'Road obstruction'
          ? 'road_obstruction'
          : hazard.type === 'Low lighting'
            ? 'low_lighting'
            : hazard.type === 'Flooding'
              ? 'flooding'
              : 'traffic_incident',
      lat: hazard.latitude,
      lng: hazard.longitude,
      severity: hazard.severity + 1,
      description: hazard.description,
      timestamp: hazard.reportedAt,
      source: hazard.source === 'news' ? 'unknown' : hazard.source,
      verification: hazard.verificationStatus,
    }));
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
