# Safe Route — delivery TODO

## Working Guwahati route-planning experience
- [x] The primary journey is Guwahati Railway Station → Assam Downtown University.
- [x] The app shows origin and destination, route geometry, map controls, and selectable route alternatives.
- [x] The user can compute routes, select an active route, inspect route details, and start a demo navigation mode with turn guidance.

## Transparent deterministic route-risk engine
- [x] Route comparison presents estimated risk, travel details, evidence coverage, and uncertainty for each alternative.
- [x] The assessment explains score inputs, contributions, evidence freshness, verification status, and model limitations.
- [x] The demo distinguishes estimated risk from confidence and uses cautious experimental language.

## Hazard evidence and live reassessment loop
- [x] Hazard detail exposes type, location, severity, source, verification status, freshness, and route impact.
- [x] The user can report a hazard with validation, location, severity, and description.
- [x] A submitted hazard immediately updates the active route score, warnings, evidence coverage, and map marker without a manual refresh.
- [x] Reports and status labels distinguish reported, verified, stale, uncertain, and demo evidence.

## Civic Route Utility interface
- [x] The interface follows the supplied civic utility direction: Inter typography, compact square controls, high contrast, forest green, amber, red, structural borders, and a split map/inspection layout.
- [x] The safety disclaimer remains visible and explicitly avoids guaranteeing safety or complete incident detection.
- [x] The layout remains usable on narrow screens with the inspection panel moving below the map.
