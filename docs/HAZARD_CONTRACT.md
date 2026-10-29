# Hazard Contract

## Overview

All hazard records that cross a service boundary (ingestion → storage → frontend)
use the `UnifiedHazard` interface defined in [`shared/hazardContract.ts`](../shared/hazardContract.ts).

## Location Confidence Taxonomy

| Level | Meaning | Scoreable? |
|---|---|---|
| `exact_verified` | Coordinates confirmed by official source or field check | Yes |
| `exact_unverified` | Source-provided coordinates, not independently verified | Yes |
| `geocoded_named` | Coordinates derived from a named place via geocoding | Yes |
| `area` | General area or region-level text, no precise point | **No** (display only) |
| `unknown` | No usable location information | **No** (display only) |

### Bridge from Ingestion Confidence

The ingestion service uses a different taxonomy. The bridge mapping is:

| Ingestion Value | → Unified Value |
|---|---|
| `source_coordinates` | `exact_unverified` |
| `area_text` | `area` |
| `region_level` | `area` |
| `ambiguous` | `unknown` |
| `none` | `unknown` |

## Verification Status

| Status | Meaning |
|---|---|
| `verified` | Confirmed by an authoritative source or multiple independent reports |
| `unverified` | Single unconfirmed report |
| `disputed` | Conflicting reports about this hazard |
| `resolved` | Hazard was reported but has since been cleared |

## Origin

| Value | Meaning |
|---|---|
| `official` | Government agency or authoritative body |
| `news` | News media or press report |
| `community` | User-submitted report |
| `demo` | Synthetic demo data (always labelled `[SIMULATED]`) |

## Grid System

The spatial grid uses 0.01° cells (~1.1 km at equator). See [`shared/grid.ts`](../shared/grid.ts).

- `cellKey(lat, lng)` → canonical cell identifier
- `cellsForBBox(box)` → all cell keys overlapping a bounding box

## Store Interface

`HazardStore` (in [`shared/hazardStore.ts`](../shared/hazardStore.ts)) provides:

- `put(hazard)` — upsert a record
- `get(id)` — retrieve by ID
- `list()` — all records
- `queryBBox(box)` — spatial query
- `health()` — store health check

The demo uses `InMemoryHazardStore`. A file-backed JSON store can be added
for durable persistence without requiring a database.

