# Safe Route — Guwahati Civic Pilot

A functional demo of an evidence-aware navigation planner for the small route from **Guwahati Railway Station** to **Assam Downtown University**.

## What is included

- Three selectable route alternatives with distance, ETA, lighting, risk estimate, and evidence coverage.
- A deterministic client-side route-risk engine that recalculates when hazard reports are added.
- Interactive map controls, route overlays, evidence markers, spatial grid cells, and hazard detail inspection.
- A report-a-hazard flow that immediately updates the active route assessment.
- Demo navigation guidance, recent reports, and a methodology view explaining the score inputs.

The map geometry and infrastructure signals are curated demo data for this pilot route. Risk values are experimental estimates and are not emergency or guaranteed-safety guidance.

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

## Demo route

**Origin:** Guwahati Railway Station  
**Destination:** Assam Downtown University
