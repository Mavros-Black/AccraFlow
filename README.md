# AccraFlow AI

A desktop-first drainage operations workspace for Accra, Ghana. The Phase 1 interface follows `AccraFlow AI Flood Management Dashboard.png`: dark navy navigation, cyan/blue controls, six KPI cards, an interactive map, incident details, a scenario panel, and operational summaries.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. No credentials or environment variables are required for Phase 1. Internet access is needed for the attributed OpenStreetMap basemap. The predev and prebuild scripts copy the installed MapLibre worker and its license into `public/vendor/maplibre`; these generated assets are ignored by Git.

```sh
npm run lint
npm run typecheck
npm run build
npm start
npm run test:e2e
```

`build` uses the supported Webpack bundler because the current Mac execution environment blocks the local worker port used by Turbopack's production CSS processing. Development uses Turbopack. Tailwind uses its standard PostCSS integration for Webpack and the installed Turbopack loader for development.

Browser tests currently use Microsoft Edge installed at `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`. To use another machine, adjust `executablePath` in `playwright.config.ts`, or remove it and install Playwright Chromium with `npx playwright install chromium`. Start the dev server before running the tests. Screenshots and test failure artifacts are written under `test-results/`.

## Implemented

- Responsive dashboard with six cards; counts are computed from in-memory demo records. The 76% demo coverage compares 19 synthetic map segments with 25 imaginary planned segments; it is not real drainage coverage. The change badges compare the demo counts with the previous synthetic snapshot (21 total and 10 resolved). Flood risk remains unavailable until a validated model exists.
- Real MapLibre raster basemap centered on Accra, zoom and compass controls, map scale, named neighbourhood lookup, selectable synthetic incident pins, and an incident layer toggle. Synthetic markers, drainage-like lines and colored zones are visible by default and can be hidden together using the demo layer toggle. They are invented illustrations, not surveyed infrastructure or modeled flood risk.
- Incident list with text/status filters; selection updates the detail panel. New reports use coordinate bounds and Zod validation and enter the Submitted state.
- Sequential demo review/status workflow with append-only session history. Verified demo incidents can create work orders, with duplicate prevention.
- Demo maintenance queue with completion controls, links to related reports, and a three-item dashboard preview.
- Rainfall depth, duration, catchment scenario and intervention configuration. Saved configurations explicitly await a validated model. No simulation is executed.
- Status distribution chart computed from current demo reports and linked work orders, with an accessible data table. Rainfall/water-level view displays explicitly fictional sample values with an arbitrary gauge reference, not observed data or flood depths. The forecast card shows open demo report counts by area as a snapshot while actual forecast results remain unavailable. CSV export and printable report view are available.
- Infrastructure and administration integration states explain the missing surveyed inventory, database and authentication.
- Keyboard-accessible native report dialog, Escape dismissal, focus containment, map failure messaging, and empty report states.

## Data boundaries

All incident records, marker positions, maintenance tasks and operator identity are **DEMO**. The 24 incident fixtures reproduce the reference card counts; the map initially shows four featured examples and will also show a selected report. They do not describe observed flooding or surveyed drains. Data and scenario edits live only in React memory and reset on reload. Map geography is real; the provider's attribution is retained. The map contains clearly labeled synthetic drainage-like lines and colored illustrative zones; these are not surveyed drainage paths or flood predictions. The coverage percentage is a labeled synthetic fixture calculation, not a measurement of Accra. No actual weather observations, hydraulic outputs, coverage measurements or prediction metrics are shown.

Status history is append-only within the UI, but is **not** a persistent or tamper-proof audit trail. Status and completion controls are demonstration controls, without authentication or authorization. Do not use this workspace for operational decisions.

The incident image and skyline artwork are AI-generated illustrations, not real incident photographs. Satellite imagery requires a separately configured provider key; live weather, genuine risk overlays and predicted improvement percentages are not implemented as live features. A sourced asset inventory and validated engineering model are prerequisites for genuine engineering results. Construction recommendations require qualified professional review.

## Installed versions

- Next.js 16.4.6, React / React DOM 19.3.0
- Tailwind CSS 4.3.3
- MapLibre GL JS 6.18.0
- Lucide React 1.73.0
- Recharts 3.10.1
- Zod 4.6.7
- Playwright 1.65.1

`package-lock.json` records exact installed dependency versions.

## Remaining phases

Phase 2: PostgreSQL/PostGIS migrations, Supabase Auth and organization roles, server-enforced moderation, incident CRUD, photo storage, immutable audit history and persistent work orders. Configure secrets only through environment variables; never commit them. There are no backend environment variables in use yet.

Phase 3: provenance-backed GeoJSON ingestion and validation, surveyed drainage assets and catchments, typed FastAPI asynchronous job contracts, and EPA SWMM only with sufficient survey, rainfall, hydraulic and calibration data.

Phase 4: backend security testing, accessibility hardening and deployment documentation. External deployment and paid services require explicit approval per the master prompt.

The next coding step is to separate the demo workflow from persistent data access and add the PostGIS schema with organization-scoped authorization.

## Verification and provider notes

The browser suite checks a single initial live basemap viewport. Pan/zoom and workflow tests use fixture tiles to avoid automated movement against community infrastructure. The application retains visible attribution and normal browser caching; see the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Choose an appropriate provider before production rollout. Basemap imagery dates are not supplied by the tile endpoint; no survey date is implied.

Dependency audit currently reports seven moderate advisories in the development-only TypeScript ESLint/minimatch dependency chain. `npm audit fix` did not resolve them with the current compatible dependency tree. No forced or breaking dependency update was applied.


To enable the satellite appearance, set `NEXT_PUBLIC_ARCGIS_API_KEY` in `.env.local` to an ArcGIS API key scoped to the imagery basemap, then restart the development server. The browser receives this public key, so restrict it to the intended origins and privileges. OpenStreetMap is used when the key is absent. See the [Esri MapLibre imagery guide](https://developers.arcgis.com/maplibre-gl-js/maps/raster-tile-basemaps/display-multiple-basemap-layers/) for authentication and attribution. Esri may apply account, usage, and billing terms; creating an account or subscribing requires the project owner's approval.
