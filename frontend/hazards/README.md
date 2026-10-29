# Hazard data & spatial grid engine (Person B)

Self-contained TypeScript module. No new dependencies, no network calls, no secrets.
It does **not** touch routing, geocoding, or map rendering, and contains **no** risk scoring.
It is integrated into `frontend/App.tsx` as the single source of truth for hazard evidence.

```ts
import {
  getAllHazards, getHazardsNearPoint, getGridSummary, getGridCellForCoordinate,
  submitCommunityHazard, ingestHazard, createHazardService, DEMO_HAZARDS,
} from './hazards';          // from frontend/App.tsx; use '../hazards' from frontend/services/*
```

## Storage — read this first

The default service uses `InMemoryHazardStore`: **temporary, per-tab, lost on reload, not shared between users, not synchronised.**
The underlying store is empty by default; `App.tsx` initializes its instance and seeds it with `DEMO_HAZARDS` from `demoSeed.ts`
(guarded against React StrictMode double-seeding via `DuplicateHazardIdError` handling). The project has no database, backend, or
Supabase configured, so nothing here is persistent. To get shared persistence, implement the `HazardStore` interface (`insert`, `listLocated`, `listUnlocated`,
`getById`) against a real backend and pass it to `createHazardService({ store })`. That needs a hosted database, a server-side
write path and access policies (not part of this task). Because this is a browser-only app, **client code can call
`ingestHazard` directly, so the "community cannot self-verify" rule is only enforced for the community path; real enforcement of
the trusted path needs a backend.**

## Data model (`types.ts`)

| Field | Type | Notes |
|---|---|---|
| `id` | string | non-empty, ≤128 chars, unique across located *and* unlocated records |
| `type` | `'Road obstruction' \| 'Road closure' \| 'Low lighting' \| 'Flooding' \| 'Traffic incident'` | preserves the existing report-form choices |
| `description` | string | trimmed, non-empty, ≤2000 chars |
| `latitude`, `longitude` | number (WGS84 degrees) | finite; lat −90..90, lon −180..180. `null` for `UnlocatedHazard` |
| `severity` | `1 \| 2 \| 3 \| 4` | integers only: 1 Low, 2 Medium, 3 High, 4 Severe (`SEVERITY_LABELS`) |
| `reportedAt` | string | ISO 8601 **with timezone**, normalised to UTC (`2026-10-29T04:30:00.000Z`); future > 5 min rejected |
| `source` | `'community' \| 'official' \| 'news' \| 'demo'` | `demo` = simulated; never present as a real current incident |
| `verificationStatus` | `'unverified' \| 'verified'` | |
| optional | `title`, `locationLabel`, `sourceUrl` (http/https), `retrievedAt` (UTC ISO), `locationConfidence` (`'exact' \| 'approximate'`) | |

Legacy mapping (App.tsx-local type): `Low/Medium/High → 1/2/3`; `Verified → verified`; `Reported`/`Needs review → unverified`.

## Verification rules

* `submitCommunityHazard` (UI path): `source` is always `community`, `verificationStatus` always `unverified`, `id` is generated and
  `reportedAt` is the service clock. **Any client-supplied `id`, `source`, `verificationStatus`, `reportedAt` is ignored.**
* `ingestHazard` (Person A path): `id`, `reportedAt`, `source` required. `verificationStatus` defaults to `unverified`; `verified` is honoured
  only for non-`community` sources (a `community` source is forced to `unverified`).
* A record with unknown location: pass `latitude`/`longitude` both omitted or `null`. It is stored as `UnlocatedHazard`, returned only by
  `getUnlocatedHazards()`, and is excluded from distance queries and the grid. Coordinates are never invented. Exactly one coordinate is an error.

## Public API (`hazardService.ts`, re-exported from `index.ts`)

```ts
getAllHazards(): Promise<Hazard[]>                                   // located hazards only (copies)
getUnlocatedHazards(): Promise<UnlocatedHazard[]>
getHazardsNearPoint(lat, lon, radiusMeters): Promise<Hazard[]>      // Haversine, inclusive radius, nearest first
getHazardsNearPointWithDistance(lat, lon, radiusMeters): Promise<{ hazard: Hazard; distanceMeters: number }[]>
getGridSummary(config?: GridConfig): Promise<GridCellSummary[]>     // sorted by (row, col)
getGridCellForCoordinate(lat, lon, config?: GridConfig): GridCell   // SYNCHRONOUS (pure)
submitCommunityHazard(input: CommunityHazardInput): Promise<Hazard>
ingestHazard(input: TrustedHazardInput): Promise<Hazard | UnlocatedHazard>
createHazardService({ store?, gridConfig?, now?, generateId? }): HazardService   // isolated instance (tests / real DB)
```

Difference from the suggested contract: `getGridCellForCoordinate` is synchronous because it needs no storage; the rest are async to
allow a database-backed store later. `submitCommunityHazard` takes **typed, already-parsed values** (numbers, not form strings).

### Errors
* Invalid input → `HazardValidationError` (`.issues: { field, message }[]`, lists *all* problems). Async functions reject; `getGridCellForCoordinate` and `getGridCell` throw synchronously.
* Duplicate id → `DuplicateHazardIdError` (`.hazardId`); the original record is never overwritten.
* Nothing is silently clamped, coerced (strings are not parsed to numbers) or defaulted, except as listed under verification rules.

## Grid (`grid.ts`)

Equirectangular lat/lon grid: `row = floor((lat+90)/size)`, `col = floor((lon+180)/size)`; default `size = 0.01°` (valid 1e-6..90).
Cells are half-open `[south,north) × [west,east)`; lat 90 / lon 180 fall in the last row/column (180 is **not** wrapped to −180).
A 1e-9-cell tolerance absorbs floating-point noise on boundaries. Cell id: `g{size}:r{row}:c{col}`, e.g. `g0.01:r11615:c27180`
(the resolution is part of the id, so different resolutions never collide).

**Limitations:** cells are uniform in *degrees*, not metres. N–S ≈ 111 km/degree everywhere; E–W shrinks with cos(latitude) (~1.0 km × 1.1 km at
Guwahati for 0.01°). `GridCell.approxSizeMeters` reports the approximate real size. Do not treat cells as equal-area.

`GridCellSummary`: `cell` (id, row, col, bounds, center, approxSizeMeters), `hazardCount`, `maxSeverity`, `averageSeverity` (unrounded mean),
`latestReportedAt`, `verifiedCount`, `unverifiedCount`, `sourceCounts` (per source), `hazardIds` (sorted), `coverage: 'unknown'`.

**Unknown coverage:** this app does not track where data was collected, so every summary says `coverage: 'unknown'`. Cells with no
summary have *no reports*, which does **not** mean safe or surveyed. No coverage score or safety status exists in this module; an absence of
reports must never be shown as evidence that a route is safe.

## Distance queries

`getHazardsNearPoint` ignores cell ids entirely: it validates inputs (finite in-range coordinates, finite non-negative radius) and
filters by Haversine great-circle distance (R = 6 371 008.8 m, spherical; ≤ ~0.5 % error vs WGS84). It scans all located hazards, O(n) — fine for
prototype volumes; add a spatial index/DB query behind `HazardStore` if the dataset grows.

## Examples

**Person A — submit a normalised external incident**
```ts
await ingestHazard({
  id: 'news:example-2026-10-29-001',          // stable id from the producer (re-ingesting the same id throws)
  type: 'Flooding', severity: 2,
  description: 'Waterlogging reported near ...',
  reportedAt: '2026-10-29T06:30:00+05:30',
  source: 'news', sourceUrl: 'https://example.org/article', retrievedAt: new Date().toISOString(),
  latitude: 26.18, longitude: 91.75, locationConfidence: 'approximate',   // omit both if unknown
});
```
**Person C — read hazards (no dependency on risk scoring)**
```ts
const nearby = await getHazardsNearPoint(26.18, 91.75, 250);          // Hazard[]
const cells  = await getGridSummary({ cellSizeDegrees: 0.005 });
const cell   = getGridCellForCoordinate(26.18, 91.75);               // cell.id, cell.bounds
```
**UI report form (integrated in App.tsx)**
```ts
await submitCommunityHazard({ type, severity: 2, description, latitude, longitude });  // always unverified
```

## Tests

Hazard validation, service, seed, and route-adapter tests use Node's built-in `node:test` with synthetic fixtures only.
Run them with `npm run test:hazards`. The `tests/` folder is outside `tsconfig.app.json`'s `include`, so the production build
does not typecheck or execute those tests; the GitHub Actions workflow runs them explicitly.
