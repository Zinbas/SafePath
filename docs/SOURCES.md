# SafePath Data Sources & Geocoding Evaluation

## 1. Active Ingestion Sources

### Google News RSS
- **Type**: RSS Feed / News Aggregator
- **Adapter**: `services/hazard-ingestion/adapters/googleNewsAdapter.ts`
- **Cadence**: Queried on demand with 2-minute server-side cache.
- **Coverage**: Local keywords ("Guwahati", "Assam", "road", "flood", "traffic", "landslide").
- **Classification**: News reporting. All items are categorized as `evidenceType: 'news_report'` and `verificationStatus: 'unverified'`.
- **Location Extraction**: Text-matching against known Guwahati localities (`knownAreas`). Does NOT infer exact coordinates from text mentions.

### GDELT Project (Global Database of Events, Language, and Tone)
- **Type**: Global News Index / Event Database
- **Adapter**: `services/hazard-ingestion/adapters/gdeltAdapter.ts`
- **Cadence**: 24-hour timespan query with strict 5-second timeout and 1-minute adapter throttle.
- **Reliability Note**: GDELT ArtList API experiences frequent rate limiting and transient timeouts. The adapter isolates failures gracefully without degrading other feeds.
- **Verification**: Strictly `unverified`.

### Open-Meteo Weather API
- **Type**: Meteorological Model Data (WMO Codes)
- **Endpoint**: Proxied via `/api/weather` to prevent client-side CORS issues.
- **Cache**: In-memory cache bounded to 100 entries with a 10-minute TTL.

### OpenStreetMap & Nominatim
- **Type**: Basemaps & Geocoding
- **Policy**: Respects Nominatim's 1-request-per-second usage policy with an internal FIFO request queue and local LRU cache. Keystroke debouncing has been replaced with explicit triggers (Enter, button, presets).

### OSRM (Open Source Routing Machine)
- **Type**: Road Network Routing
- **Parameters**: `alternatives=true`, `steps=true`, `overview=full`, `geometries=geojson`.
- **Real Steps**: Turn maneuvers parsed from `legs[0].steps`.

---

## 2. Geocoding of Unlocated News Mentions — NO-GO Decision

### Evaluation Context
During Phase 8, we evaluated whether unlocated news mentions (e.g. "traffic halted across GS Road after morning storm") should be automatically geocoded to point coordinates using Nominatim or fuzzy string matching.

### Decision: REJECTED (NO-GO)

### Technical & Civic Justification
1. **False Precision**: Arterial roads in Guwahati like GS Road or AT Road span 8 to 15 kilometers. Pinning a news article describing a corridor-wide slowdown to an arbitrary midpoint creates a dangerously misleading false precision on the user's route map.
2. **Deterministic Risk Integrity**: SafePath's risk engine evaluates hazards within a precise 50-meter corridor. An artificially placed pin would distort risk scores for drivers who happen to pass that arbitrary coordinate while missing drivers genuinely affected elsewhere along the corridor.
3. **Civic Transparency**: If an article does not contain source-verified coordinates, SafePath honestly assigns it a `locationConfidence` of `area_text` or `region_level`. These records are displayed in the evidence drawer for human review, but they are excluded from numerical route scoring.

---

## 3. Official Guwahati Sources Assessment

| Agency | Status | Real-Time Feed Feasibility | Notes |
|---|---|---|---|
| **Guwahati Municipal Corporation (GMC)** | Evaluated | Infeasible | No public REST/JSON API for road works or culvert closures. Announcements are posted as social media images or PDF notices. |
| **Assam State Disaster Management Authority (ASDMA)** | Evaluated | Infeasible for real-time | Publishes daily flood bulletins as downloadable PDFs during monsoon season, but no machine-readable incident API exists. |
| **Guwahati Traffic Police** | Evaluated | Infeasible | Advisory updates are broadcast via social media (X/Twitter) without structured location coordinates. |

### Architectural Implication
Because no official machine-readable feed exists for real-time urban hazards in Guwahati, SafePath explicitly classifies all municipal-style records in demo mode as `[SIMULATED]`. It never fabricates "GMC Verified" status for synthetic records.
