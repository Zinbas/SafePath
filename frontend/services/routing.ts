export type LocationCandidate = {
  id: string;
  displayName: string;
  longitude: number;
  latitude: number;
};

export type RoadRoute = {
  id: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
};

export type RouteSearchResult = {
  routes: RoadRoute[];
  waypoints: [number, number][];
};

type JsonRecord = Record<string, unknown>;

const locationCache = new Map<string, LocationCandidate[]>();
let lastLocationRequestAt = 0;
let locationRequestQueue: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === 'number'
    && Number.isFinite(value[0])
    && typeof value[1] === 'number'
    && Number.isFinite(value[1]);
}

function abortError() {
  return new DOMException('The request was cancelled.', 'AbortError');
}

function waitForNominatimSlot(signal: AbortSignal) {
  const delay = Math.max(0, lastLocationRequestAt + 1000 - Date.now());
  if (signal.aborted) return Promise.reject(abortError());
  if (delay === 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function geocodeAddress(query: string, signal: AbortSignal): Promise<LocationCandidate[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('Enter a location before searching.');

  const cacheKey = normalizedQuery.toLocaleLowerCase();
  const cachedResults = locationCache.get(cacheKey);
  if (cachedResults) return cachedResults;

  const request = locationRequestQueue.then(async () => {
    await waitForNominatimSlot(signal);
    lastLocationRequestAt = Date.now();

    const parameters = new URLSearchParams({
      q: normalizedQuery,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
    });
    let response: Response;
    try {
      response = await fetch(`https://nominatim.openstreetmap.org/search?${parameters}`, {
        headers: { Accept: 'application/json' },
        referrerPolicy: 'strict-origin-when-cross-origin',
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new Error('Unable to reach Nominatim. Check your connection and try the location search again.');
    }

    if (!response.ok) {
      throw new Error(`Location search failed (HTTP ${response.status}). Please try again later.`);
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error('Location search returned an invalid response.');

    return data.flatMap((item, index): LocationCandidate[] => {
      if (!isRecord(item)) return [];
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || typeof item.display_name !== 'string') return [];

      return [{
        id: String(item.place_id ?? item.osm_id ?? `${index}:${latitude}:${longitude}`),
        displayName: item.display_name,
        longitude,
        latitude,
      }];
    });
  });

  locationRequestQueue = request.then(() => undefined, () => undefined);
  const results = await request;
  locationCache.set(cacheKey, results);
  return results;
}

export async function fetchRoadRoutes(
  origin: LocationCandidate,
  destination: LocationCandidate,
  signal: AbortSignal,
): Promise<RouteSearchResult> {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const parameters = new URLSearchParams({
    alternatives: 'true',
    steps: 'false',
    geometries: 'geojson',
    overview: 'full',
  });
  let response: Response;
  try {
    response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?${parameters}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Unable to reach OSRM. Check your connection and try again.');
  }

  const data: unknown = await response.json().catch(() => null);
  if (!isRecord(data)) {
    throw new Error(`Road routing failed (HTTP ${response.status}). Please try again.`);
  }
  if (data.code === 'NoRoute') throw new Error('No drivable route was found between these locations.');
  if (data.code === 'NoSegment') throw new Error('One of these locations is too far from a drivable road. Choose another result.');
  if (!response.ok) {
    throw new Error(`Road routing failed (HTTP ${response.status}). Please try again.`);
  }
  if (data.code !== 'Ok') {
    const detail = typeof data.message === 'string' ? ` ${data.message}` : '';
    throw new Error(`Road routing could not process these locations (${String(data.code)}).${detail}`);
  }
  if (!Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error('No drivable route was found between these locations.');
  }
  if (!Array.isArray(data.waypoints) || data.waypoints.length < 2) {
    throw new Error('Road routing returned incomplete location data. Please try again.');
  }

  const waypoints = data.waypoints.map((waypoint) => {
    if (!isRecord(waypoint) || !isCoordinate(waypoint.location)) {
      throw new Error('Road routing returned invalid endpoint coordinates.');
    }
    return [waypoint.location[0], waypoint.location[1]] as [number, number];
  });

  const routes = data.routes.map((route, index): RoadRoute => {
    if (!isRecord(route) || !isRecord(route.geometry) || !Array.isArray(route.geometry.coordinates)) {
      throw new Error('Road routing returned invalid route geometry.');
    }
    const distanceMeters = route.distance;
    const durationSeconds = route.duration;
    const routeCoordinates = route.geometry.coordinates.filter(isCoordinate);
    if (
      typeof distanceMeters !== 'number'
      || !Number.isFinite(distanceMeters)
      || typeof durationSeconds !== 'number'
      || !Number.isFinite(durationSeconds)
      || routeCoordinates.length < 2
    ) {
      throw new Error('Road routing returned an incomplete route. Please try again.');
    }

    return {
      id: `osrm-${index}`,
      distanceMeters,
      durationSeconds,
      coordinates: routeCoordinates,
    };
  });

  return { routes, waypoints };
}