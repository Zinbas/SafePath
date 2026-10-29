import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  geocodeAddress,
  fetchRoadRoutes,
  reverseGeocodeLatLng,
  GUWAHATI_PRESETS,
} from './routing';
import type { LocationCandidate } from './routing';

const origin: LocationCandidate = {
  id: 'orig',
  displayName: 'Guwahati Railway Station',
  latitude: 26.1821,
  longitude: 91.7507,
};

const destination: LocationCandidate = {
  id: 'dest',
  displayName: 'Assam Down Town University',
  latitude: 26.2017,
  longitude: 91.8623,
};

describe('Routing service (routing.ts)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('geocodeAddress', () => {
    it('returns preset match without network request', async () => {
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
        throw new Error('Should not call fetch for preset');
      };

      const results = await geocodeAddress('Railway Station', new AbortController().signal);
      assert.equal(fetchCalled, false);
      assert.ok(results.length > 0);
      assert.equal(results[0].id, 'preset-station');
    });

    it('rejects empty query', async () => {
      await assert.rejects(
        () => geocodeAddress('   ', new AbortController().signal),
        /Enter a location before searching/
      );
    });

    it('handles successful Nominatim response', async () => {
      const mockNominatimData = [
        {
          place_id: 12345,
          lat: '26.1850',
          lon: '91.7600',
          display_name: 'Chandmari, Guwahati, Assam',
        },
      ];

      globalThis.fetch = async () => {
        return new Response(JSON.stringify(mockNominatimData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const results = await geocodeAddress('NonPresetPlaceXYZ', new AbortController().signal);
      assert.equal(results.length, 1);
      assert.equal(results[0].latitude, 26.185);
      assert.equal(results[0].longitude, 91.76);
      assert.equal(results[0].displayName, 'Chandmari, Guwahati, Assam');
    });

    it('handles Nominatim HTTP error', async () => {
      globalThis.fetch = async () => {
        return new Response('Rate limited', { status: 429 });
      };

      await assert.rejects(
        () => geocodeAddress('AnotherNonPresetXYZ', new AbortController().signal),
        /Location search failed \(HTTP 429\)/
      );
    });
  });

  describe('fetchRoadRoutes', () => {
    it('parses valid OSRM route response with steps', async () => {
      const mockOsrmData = {
        code: 'Ok',
        routes: [
          {
            distance: 12500,
            duration: 1800,
            geometry: {
              coordinates: [
                [91.7507, 26.1821],
                [91.7800, 26.1900],
                [91.8623, 26.2017],
              ],
            },
            legs: [
              {
                steps: [
                  {
                    name: 'Station Approach Rd',
                    distance: 500,
                    duration: 90,
                    maneuver: { type: 'depart', modifier: '' },
                  },
                  {
                    name: 'GS Road',
                    distance: 10000,
                    duration: 1500,
                    maneuver: { type: 'turn', modifier: 'right' },
                  },
                  {
                    name: 'Campus Avenue',
                    distance: 2000,
                    duration: 210,
                    maneuver: { type: 'arrive', modifier: '' },
                  },
                ],
              },
            ],
          },
        ],
        waypoints: [
          { location: [91.7507, 26.1821] },
          { location: [91.8623, 26.2017] },
        ],
      };

      globalThis.fetch = async () => {
        return new Response(JSON.stringify(mockOsrmData), { status: 200 });
      };

      const result = await fetchRoadRoutes(origin, destination, new AbortController().signal);
      assert.equal(result.routes.length, 1);
      assert.equal(result.routes[0].distanceMeters, 12500);
      assert.equal(result.routes[0].durationSeconds, 1800);
      assert.equal(result.routes[0].coordinates.length, 3);
      assert.ok(result.routes[0].steps);
      assert.equal(result.routes[0].steps?.length, 3);
      assert.equal(result.routes[0].steps?.[0].maneuverType, 'depart');
    });

    it('rejects with helpful error on OSRM NoRoute code', async () => {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ code: 'NoRoute', routes: [] }), { status: 200 });
      };

      await assert.rejects(
        () => fetchRoadRoutes(origin, destination, new AbortController().signal),
        /No drivable route was found/
      );
    });

    it('rejects with helpful error on OSRM NoSegment code', async () => {
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ code: 'NoSegment', routes: [] }), { status: 200 });
      };

      await assert.rejects(
        () => fetchRoadRoutes(origin, destination, new AbortController().signal),
        /too far from a drivable road/
      );
    });

    it('handles malformed route geometry safely', async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            code: 'Ok',
            routes: [
              {
                distance: 1000,
                duration: 100,
                geometry: { coordinates: 'not-an-array' },
              },
            ],
            waypoints: [{ location: [91.7, 26.1] }, { location: [91.8, 26.2] }],
          }),
          { status: 200 }
        );
      };

      await assert.rejects(
        () => fetchRoadRoutes(origin, destination, new AbortController().signal),
        /invalid route geometry/
      );
    });
  });

  describe('reverseGeocodeLatLng', () => {
    it('returns fallback pin name on HTTP error without crashing', async () => {
      globalThis.fetch = async () => {
        return new Response('Not found', { status: 404 });
      };

      const candidate = await reverseGeocodeLatLng(26.1821, 91.7507);
      assert.ok(candidate.displayName.includes('26.1821'));
      assert.equal(candidate.latitude, 26.1821);
      assert.equal(candidate.longitude, 91.7507);
    });
  });
});

