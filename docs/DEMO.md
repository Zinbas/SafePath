# SafePath Live Demonstration Guide

## Quick Start (Under 60 Seconds)

### 1. Start Backend Hazard Service
```bash
npm run dev:api
```
Server starts on `http://127.0.0.1:3100`. Verify with `curl http://127.0.0.1:3100/api/health`.

### 2. Start Frontend Application
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Guided Demonstration Walkthrough

### Step 1: Default Corridor & Honest Scoring
1. Observe the preloaded route from **Guwahati Railway Station** to **Assam Down Town University (ADTU)**.
2. Note the route score and category. Notice that even with low hazard density, the system never claims the road is "safe" — it states: *"Adequate coverage — low observed hazard density, not a guarantee of safety."*
3. Notice the route tag: `[Cached Route]` or `[Live OSRM]`.

### Step 2: Route Alternatives & Comparison
1. Notice the two routes rendered on the interactive map:
   - **Direct road corridor** (via Panikhaiti road)
   - **Alternative via Zoo Road** (via Zoo Road / GS corridor)
2. Select the **Route Comparison** tab to observe the deterministic trade-offs between distance, duration, and hazard exposure under different user preferences (`Safest`, `Fastest`, `Balanced`).

### Step 3: Turn-by-Turn Navigation & Real OSRM Maneuvers
1. Click **Turn-by-turn guidance**.
2. Observe real turn maneuvers parsed directly from OSRM (`Depart`, `Turn right onto GS Road`, `Arrive at destination`) rather than fabricated instructions.
3. If using an offline cached route without turn steps, notice the honest warning: *"Turn-by-turn guidance unavailable for cached route. View geometry on map."*

### Step 4: Community Hazard Submission (Interactive Map Pinning)
1. Click anywhere on the map (e.g. near Chandmari or Bhangagarh).
2. The popup displays the reverse-geocoded place name and coordinates, with options:
   - `Set as Start`
   - `Set as End`
   - `Report Hazard`
3. Click `Report Hazard`. The modal opens with the coordinates pre-filled.
4. Select `Waterlogging`, set severity to `High`, add a description, and submit.
5. Notice:
   - The report is posted to `/api/reports` and saved to `data/community_reports.json`.
   - The hazard immediately displays on the map with an unverified badge.
   - The route risk score recalculates in real time if the hazard falls within the 50m road corridor.

### Step 5: External Evidence & Live News
1. Navigate to the **Evidence & Reports** tab.
2. Observe news articles indexed by the Google News adapter.
3. Note that articles with `area` or `region` confidence are clearly marked as display-only and do not artificially alter the numerical score.

### Step 6: Graceful Offline Fallback
1. Stop the backend server (`Ctrl+C` on port 3100).
2. Refresh the page or click a location.
3. The application displays an informative banner: *"Live data service is not reachable. Operating in local demo mode."*
4. All map viewing, OSRM routing, risk assessment, and local community reporting continue to work without a fatal crash.
