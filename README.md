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

## Persistent organization workspace

The dashboard map has an opt-in **Show organization reports** control for signed-in accounts. It displays reports available to the selected organization, with status labels and a separate list and details panel. Rejected and withdrawn reports remain in the list but have no map markers. Activating this layer hides the synthetic map layers by default; dashboard KPI cards and other demo sections continue to show only fictional data. The layer is limited to the API’s 500 most recent accessible reports and can be refreshed manually.

The separate **Organization workspace** (`/workspace`) provides authenticated incident submission, correction and withdrawal before review, moderation and status history, private photo attachments, work orders, assignments and due dates, and administrator-managed memberships and audit records. It does not replace or import the fictional dashboard data. Without Supabase configuration its API returns a configuration error and the demo remains available.

To connect a new Supabase project:

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the project's URL and public/publishable key. Never put a service-role or secret key in a `NEXT_PUBLIC_` variable. Restart the development server after changes.
2. Review and apply all files in `supabase/migrations/` in filename order, committing each migration separately to the intended project, using the Supabase migration tooling or SQL editor with sufficient privileges. These migrations assume a fresh AccraFlow schema and Supabase Auth and Storage; review existing database and Storage policies before applying them. Back up any existing project first.
3. Create a **private** Storage bucket named `accraflow-incident-photos` through the Supabase dashboard or Storage API. Set its file size limit to 5 MiB and allowed MIME type to `image/jpeg`. The server accepts JPEG, PNG, and WebP uploads and re-encodes them to JPEG, stripping embedded metadata. Images are limited to 20 megapixels and 5 MiB before and after conversion. Do not enable public access.
4. Create the first Auth account in Supabase. New Auth accounts receive a profile automatically. For an existing account created before the migration, insert its profile as part of the bootstrap below. In a privileged SQL session, substitute the actual Auth user UUID and an organization name:

   ```sql
   begin;
   insert into public.profiles (id, display_name)
   values ('AUTH_USER_UUID', 'Administrator') on conflict (id) do nothing;
   with new_org as (
     insert into public.organizations (name) values ('Organization name')
     returning id
   )
   insert into public.memberships (organization_id, user_id, role)
   select id, 'AUTH_USER_UUID'::uuid, 'admin' from new_org;
   commit;
   ```

   The administrator can then add existing Auth user UUIDs and manage their roles in the workspace. The final active administrator cannot be removed or demoted. New account creation itself is not provided by the application.

All organization data access uses the signed-in user's Supabase session, row-level security and database functions. A resident sees their own reports; moderators review reports, operators manage work orders, and administrators manage memberships and view the audit log. State changes and their history and audit entries commit together. The audit log is protected from normal application users, but database owners can modify it; it is not a tamper-proof external audit service. Review request origin handling against the actual public URL and proxy configuration before deployment.

Run the local PostgreSQL/PostGIS authorization and image-processing tests with `npm run test:backend`. The tests use an embedded PostgreSQL-compatible instance with stand-ins for Supabase Auth and Storage; they do not establish compatibility with a live Supabase project. Applying the migrations, provisioning the bucket and users, and testing end-to-end with real sessions remain necessary. Storage orphan cleanup and retention policies, rate limiting, permanent incident deletion, and before/after photo classification are not yet implemented. Withdrawn reports and their photos remain available to authorized users. Do not use the application for operational decisions until these integration and production checks are complete.

## GeoJSON preflight

The Infrastructure screen includes a local GeoJSON preflight tool. Select an RFC 7946 FeatureCollection up to 5 MiB, enter its source name, survey or collection date, and license or permission, and run the check. The tool checks geometry structure, coordinate ranges, polygon ring closure, approximate Accra bounds and size limits (2,000 features and 100,000 positions). It can download a JSON report with the entered provenance and findings. The input file stays in the browser; neither the dataset nor report is uploaded or persisted by the app.

A structural pass is not source approval or a survey certification. The tool does not verify topology, coordinate reference history, geometry accuracy, licensing, or ownership. PostGIS validation and qualified review are required before importing or using the data. Import, persistent source approval and real asset layers remain to be built.

## Data boundaries

All incident records, marker positions, maintenance tasks and operator identity are **DEMO**. The 24 incident fixtures reproduce the reference card counts; the map initially shows four featured examples and will also show a selected report. They do not describe observed flooding or surveyed drains. Data and scenario edits live only in React memory and reset on reload. Map geography is real; the provider's attribution is retained. The map contains clearly labeled synthetic drainage-like lines and colored illustrative zones; these are not surveyed drainage paths or flood predictions. The coverage percentage is a labeled synthetic fixture calculation, not a measurement of Accra. No actual weather observations, hydraulic outputs, coverage measurements or prediction metrics are shown.

On the demo dashboard, status history exists only in memory and status and completion controls have no authentication or authorization. Do not use the demo for operational decisions. The separate organization workspace has persistent, server-authorized workflows when Supabase is configured.

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

Phase 2 foundation is implemented locally as described above. A real Supabase integration test, permanent deletion and retention policy, and the other production items noted above remain. Configure secrets only through environment variables; never commit them.

Phase 3: persistent provenance-backed GeoJSON ingestion and validation (local structural preflight is available), surveyed drainage assets and catchments, typed FastAPI asynchronous job contracts, and EPA SWMM only with sufficient survey, rainfall, hydraulic and calibration data.

Phase 4: backend security testing, accessibility hardening and deployment documentation. External deployment and paid services require explicit approval per the master prompt.

The next step is to provision a test Supabase project and verify the persistent workflows end to end.

## Verification and provider notes

The browser suite checks a single initial live basemap viewport. Pan/zoom and workflow tests use fixture tiles to avoid automated movement against community infrastructure. The application retains visible attribution and normal browser caching; see the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Choose an appropriate provider before production rollout. Basemap imagery dates are not supplied by the tile endpoint; no survey date is implied.

Dependency audit currently reports seven moderate advisories in the development-only TypeScript ESLint/minimatch dependency chain. `npm audit fix` did not resolve them with the current compatible dependency tree. No forced or breaking dependency update was applied.


To enable the satellite appearance, set `NEXT_PUBLIC_ARCGIS_API_KEY` in `.env.local` to an ArcGIS API key scoped to the imagery basemap, then restart the development server. The browser receives this public key, so restrict it to the intended origins and privileges. OpenStreetMap is used when the key is absent. See the [Esri MapLibre imagery guide](https://developers.arcgis.com/maplibre-gl-js/maps/raster-tile-basemaps/display-multiple-basemap-layers/) for authentication and attribution. Esri may apply account, usage, and billing terms; creating an account or subscribing requires the project owner's approval.
