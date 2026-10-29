# Safe Route

A hackathon prototype for hazard-aware route recommendations. The frontend uses React, TypeScript, Leaflet, and React-Leaflet.

## Routing flow

- Search an origin and destination with user-triggered OpenStreetMap Nominatim geocoding.
- Select a matching place for each input; the app does not route unconfirmed or failed searches.
- Request driving routes from the public OSRM Route API with alternatives and full GeoJSON geometry.
- Compare the returned distances and estimated durations, select a route, and view it on the map.
- Curated hazard reports remain local demo evidence and are not matched to returned routes or used in route ranking.

The public Nominatim service is queried only after the user initiates a search. Requests are cached and serialized to at most one per second. It is a shared service with usage limits and is not intended for high-volume or autocomplete use. Route duration comes from OSRM and is not guaranteed to reflect live traffic.

The map uses Esri street tiles; review the tile provider's terms and quotas before production use. This prototype is not for emergency navigation.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

To verify a production build:

```bash
npm run build
npm run preview
```

## GitHub Pages

The repository includes a GitHub Actions workflow that builds and publishes the Vite output to GitHub Pages whenever `main` is updated. In the repository settings, set **Pages → Source** to **GitHub Actions**.

## Providers

- Geocoding: [Nominatim](https://nominatim.openstreetmap.org/) and [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- Driving routes: [OSRM Route API](https://project-osrm.org/docs/v26.5.0/http#route-service)
