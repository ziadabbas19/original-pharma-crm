# Original Pharma CRM

CRM for a pharmaceutical field force. Medical reps visit doctors and pharmacies;
supervisors and managers follow their activity from a web dashboard.

| Part | Path | Stack |
| --- | --- | --- |
| API | `BACKEND/` | ASP.NET Core (.NET 10 LTS), EF Core + PostgreSQL/PostGIS, Redis, SignalR, Hangfire |
| Dashboard + rep app | `FRONTEND/` | React + Vite + TypeScript, TanStack Router/Query/Table/Form, Redux Toolkit, Tailwind + shadcn/ui |
| Android app | `FRONTEND/android/` | Capacitor wrapper around the rep app (`/rep`) |
| Local services | `docker-compose.yml` | PostgreSQL 18 + PostGIS 3.7, Redis 8 |

The same frontend build serves two clients: the admin dashboard (`/admin`) and the
mobile-first rep app (`/rep`), which runs in the Android app (Capacitor) and as an
installable PWA for iPhone reps (foreground tracking only).

See [docs/architecture.md](docs/architecture.md) for the design (permissions,
tracking pipeline, battery strategy, anti-fraud layers), [docs/location-trust.md](docs/location-trust.md) for
fake GPS detection (checks, review page, settings, limits, what to tell reps) and
[docs/deployment.md](docs/deployment.md) for production: every environment variable, Railway,
web hosting, Android release builds, backups.

## Prerequisites (Fedora)

- **.NET 10 SDK**. Installed per-user in `~/.dotnet` on this machine. Add to `~/.bashrc`:
  ```bash
  export DOTNET_ROOT="$HOME/.dotnet"
  export PATH="$HOME/.dotnet:$HOME/.dotnet/tools:$PATH"
  export DOTNET_CLI_TELEMETRY_OPTOUT=1
  ```
- **Node.js 22+** and npm.
- **Podman** with a compose provider: `sudo dnf install podman-compose` (or Docker with `docker compose`).
- For Android builds only: **JDK 21** (`sudo dnf install java-21-openjdk-devel`) and the
  **Android SDK** (Android Studio or command-line tools).

Package caches stay in their default places (`~/.nuget/packages`, `~/.npm`, `~/.gradle`).

## First-time setup

```bash
./scripts/dev-setup.sh
```

This creates `.env` (random PostgreSQL password, git-ignored) and stores the API's
development secrets with `dotnet user-secrets` (outside the repo):
`ConnectionStrings:Postgres`, `Jwt:SigningKey`, `Seed:AdminPassword`. It prints the admin
login once; show it again with:

```bash
dotnet user-secrets list --project BACKEND/src/OriginalPharma.Api
```

## Run

### 1. Local services (PostgreSQL + PostGIS, Redis)

```bash
podman compose up -d          # or: docker compose up -d
podman compose ps
```

PostgreSQL is published on **127.0.0.1:5433** (not 5432, so it never clashes with a
PostgreSQL installed on the host) and Redis on 127.0.0.1:6379. Data lives in named
volumes (`op-postgres-data`, `op-redis-data`); never bind-mount them into this folder
(NTFS cannot hold PostgreSQL file permissions).

Stop with `podman compose down` (add `-v` to also delete the data volumes).

### 2. API

```bash
cd BACKEND
dotnet watch run --project src/OriginalPharma.Api
```

- API: http://localhost:5080
- Swagger UI: http://localhost:5080/swagger (OpenAPI JSON at `/openapi/v1.json`)
- Health: http://localhost:5080/health
- Hangfire dashboard: http://localhost:5080/hangfire (local requests only)

In Development the API applies migrations and seeds on startup: permission catalog,
default roles (Admin, SalesManager, AreaManager, Supervisor, Rep), the admin user and
demo data: regions, areas and towns, specialties, collection methods, three product lines
with products and drawn placeholder pictures, doctors on the demo reps' lists and a couple of
orders. Each demo step runs once per database (`seed_history`), so deleting or renaming demo
rows sticks.

| Login | Role |
| --- | --- |
| `admin@originalpharma.local` | Admin |
| `sales.manager@demo.local` | SalesManager |
| `area.manager@demo.local` | AreaManager |
| `supervisor@demo.local` | Supervisor |
| `rep@demo.local` | Rep (cardio and pediatric lines) |
| `rep.east@demo.local` | Rep (pediatric and derma lines) |

All demo users use the admin password from user secrets (Development only).

To try the visit flow in a browser, sign in as `rep@demo.local` (the demo day is already running), open
**Doctors** and press **Start visit**. Chrome DevTools > Sensors can set the location: Dr. Ahmed Fathy is
at `30.0511, 31.3656`, and Dr. Karim Adel has no saved location on purpose: the first visit with a good fix
saves it (see [docs/location-trust.md](docs/location-trust.md#clinic-locations-and-visit-history)).

Uploaded pictures (products, profile pictures, visit photos) are stored outside the
repository, in `~/.local/share/original-pharma/uploads` by default (`FileStorage:RootPath`).
`podman compose --profile api up -d --build` runs the production image (`BACKEND/Dockerfile`) with the
`op-api-data` named volume. It reads `.env.production.local`; see [docs/deployment.md](docs/deployment.md).

### 3. Frontend

```bash
cd FRONTEND
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` and `/hubs` to the API, so
the refresh cookie works same-origin. Admin-capable users land on `/admin`, reps on `/rep`.

The rep app's Home screen shows the blocks an admin picks in **Administration > Settings > Rep home** (today's
progress, next visits, start next visit, weekly summary, targets and sales, manager messages), in the saved order.
The app reads it on open (`GET /api/settings/rep-home`) and falls back to the last copy on the device, or to the
defaults, when offline.

Light / dark / system theme: switch in the dashboard top bar or the rep account screen; the
choice is kept on the device and applied before the first paint. Numbers, prices and dates use
Latin digits in both languages; money is always formatted as EGP by `formatMoney`.

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, `npm run format`, `npm run typecheck`.

### Weekly plans

A rep plans each week in **Account > My weekly plan** (also from the Home card): for every working day a
city, a target number of visits, an optional note and optionally the doctors and pharmacies to visit (their
own doctor list and the pharmacies of their area, in that city). Days left out are days off. Plans are
written for the current week and later weeks only; every change is saved on the server at once, and the
last copy stays readable offline.

**Send to manager** submits the plan to the nearest manager in the rep's reporting line who holds
`plans:review` with a scope that covers the rep (team, territory or all, as for `expenses:read`); without one
the plan cannot be sent. The manager approves it (optional note) or returns it with a note from
**Field work > Weekly plans** (pending list, all plans, a dashboard card with the count). Approved plans are
locked for the rep until a reviewer reopens them. Each status change is kept in the plan's history, written to
the activity log and announced in-app (rep and reviewer). Both sides see planned against done per day and for
the week: completed visits that Egypt day in the planned city or to a planned customer count for the plan;
the others are shown as visits outside the plan.

Permissions: `plans:read-own` and `plans:write-own` (Rep), `plans:read` and `plans:review` (Supervisor: team,
Area manager: territory, Sales manager and Admin: all). Weeks are Egypt days and start on Saturday unless
`Plans__WeekStartsOn` says otherwise (`Sunday`, `Monday`, ...).

### Doctor hours, today's area, AM places and brochures

- **Doctors** have an optional detailed address, landmark and visiting hours (weekday, from, to, optional
  place; slots on the same day may not overlap). **Search by day and time** on the doctor lists (rep app and
  dashboard) filters by weekday, time range, area and town on the server, page by page: doctors with a slot
  overlapping the range come first, then, when an area or town is chosen, the doctors with no hours set.
  Every role that holds `customers:create` adds doctors (Supervisor, Area manager and Sales manager now have
  it in their scope); a manager with `customers:assign` picks the rep. The doctor shows who added it.
- **Start my day** asks for today's town (prefilled from today's weekly plan entry). Home lists the doctors of
  that town in the rep's own order (drag the handle; saved per rep and Egypt day in `rep_visit_order`).
- **AM places** (customer type `hospital`) are morning visits to a place such as a hospital, added with the
  pharmacy rules (`customers:create-pharmacy` in the rep's area, or `customers:manage` in a manager's scope,
  optionally on a rep's list). Today's AM list sits above the doctor visits on Home, is never filtered by
  today's town, can be prefilled from the weekly plan, uses the normal visit flow and is counted apart from
  the doctor target ("AM: x of y done"). Managers find them under **Field work > AM places**.
- **Products** have optional indications, ingredients and up to five brochure pictures (shrunk on the device
  before upload, stored in `product_images`, read through `GET /api/products/{id}/images/{imageId}` with
  `products:read`; the rep app keeps opened pictures in the browser cache for offline use).

### Deleting, archiving and restoring

Every list can select rows (all rows matching the filters) and every delete goes through one
confirmation dialog that says what will happen. Records other data depends on are archived instead
of removed and come back from the **Archived** view of their list. Details are in
[docs/architecture.md](docs/architecture.md#deleting-archiving-and-restoring).

### Tests

```bash
cd BACKEND && dotnet test        # xUnit v3 on Microsoft.Testing.Platform
cd FRONTEND && npm run lint && npm run format:check && npm run test:unit && npm run build
```

`npm run lint` also runs `npm run check:emoji`, which fails on any emoji or pictographic character
anywhere in the repository (code, comments, tests, translations, docs, configuration and the Android
project). The project does not use emoji: status, warnings and success are shown with lucide-react
icons, and text stays plain.

The error states (list error, server field errors, toasts, not-found screen) have a browser check
that fakes the API, so only a dev server is needed:

```bash
cd FRONTEND && UI_TEST_URL=http://localhost:5173 npm run test:ui:errors
```

The delete confirmation has a browser check. It drives a headless Chromium (`CHROME_PATH`, or a
Playwright browser in `~/.cache/ms-playwright`) against a running API and dev server with the demo data:

```bash
cd FRONTEND && UI_TEST_PASSWORD=<demo password> UI_TEST_URL=http://localhost:5173 npm run test:ui
```

The visit flow has a browser check at phone size, with the location mocked. It creates visits, so run it
against a throwaway database:

```bash
cd FRONTEND && UI_TEST_PASSWORD=<demo password> UI_TEST_URL=http://localhost:5173 npm run test:ui:visits
```

Every management screen has a browser check at phone size (no sideways scrolling, main action on
screen, a create and an edit flow, the More menu per role). It changes data, so use a throwaway
database; `UI_SCREENSHOTS=<folder>` also saves screenshots in Arabic and English, light and dark:

```bash
cd FRONTEND && UI_TEST_PASSWORD=<demo password> UI_TEST_URL=http://localhost:5174 npm run test:ui:phone
```

The rep's day and month expenses (a visit adds the city's line, the rep changes it and writes a
note, the month total follows) have a browser check at phone size, for a throwaway database:

```bash
cd FRONTEND && UI_TEST_PASSWORD=<demo password> UI_TEST_URL=http://localhost:5174 npm run test:ui:expenses
```

The suspicious activity review (a rep's mock location reported through the API, reviewed and acknowledged by the
supervisor, settings saved by the admin) has one too, also for a throwaway database. `UI_TEST_API` is the API
origin the check calls directly:

```bash
cd FRONTEND && UI_TEST_PASSWORD=<demo password> UI_TEST_URL=http://localhost:5174 \
  UI_TEST_API=http://localhost:5081 npm run test:ui:suspicious
```

The integration tests (`tests/OriginalPharma.Tests/Integration`) run against the local
PostgreSQL from `podman compose`: they migrate and seed a template database once, give each
test its own copy and drop them all afterwards. They use the API's user secret
`ConnectionStrings:Postgres` (or `ORIGINALPHARMA_TEST_POSTGRES`) and are skipped when the
server is not reachable.

## API client

The frontend's typed client and TanStack Query hooks (`FRONTEND/src/api/generated`) come
from the backend's OpenAPI document, which every backend build writes to
`BACKEND/openapi/openapi.json`:

```bash
cd BACKEND && dotnet build
cd ../FRONTEND && npm run api:generate
```

Keep both the JSON document and the client in the repository so the frontend builds without the backend.

## Database migrations

`dotnet-ef` is a repo-local tool (`BACKEND/dotnet-tools.json`):

```bash
cd BACKEND
dotnet tool restore
dotnet dotnet-ef migrations add <Name> \
  -p src/OriginalPharma.Infrastructure -s src/OriginalPharma.Api -o Persistence/Migrations
dotnet dotnet-ef database update -p src/OriginalPharma.Infrastructure -s src/OriginalPharma.Api
```

## Android (Capacitor)

```bash
cd FRONTEND
npm run build
npx cap sync android        # copy the web build + update native plugins
npx cap open android        # open in Android Studio
npx cap run android         # or build and run on a device/emulator
```

Debug build against the local API from the Android emulator (host = `10.0.2.2`):

```bash
cd FRONTEND
VITE_API_BASE_URL=http://10.0.2.2:5080 npm run build
CAP_DEV_HTTP=1 npx cap sync android
npx cap run android
```

Debug builds allow cleartext HTTP; release builds do not, and stop with an error if the last sync used
`CAP_DEV_HTTP`. Signed release builds and debug builds against the live API are described in
[docs/deployment.md](docs/deployment.md#android).

Before a release build:

- **Background geolocation license**: the Transistorsoft SDK is free in debug builds but
  needs a v9 license key for release. Add it as described in
  `FRONTEND/android/app/src/main/AndroidManifest.xml` (keep the key out of the repo).
- **Firebase**: put `google-services.json` in `FRONTEND/android/app/` (git-ignored) and set
  `VITE_FCM_ENABLED=true`. Without it the app does not register for push.
- **Play Console**: declare background location and the battery-optimization exemption
  for the field-force tracking use case.

## Configuration

| Setting | Where |
| --- | --- |
| Secrets (DB connection, JWT key, admin password) | `dotnet user-secrets` (dev), environment variables (prod, see [docs/deployment.md](docs/deployment.md)) |
| Tracking profiles, tracking-lost window, consent version, anomaly thresholds | `BACKEND/src/OriginalPharma.Api/appsettings.json` → `Tracking` |
| Visit geofence / accuracy rules | `appsettings.json` → `Visits` |
| Location trust thresholds, mock location policy, device signals retention | Dashboard → Settings (stored in `app_settings`); defaults in `appsettings.json` → `Tracking:Anomalies`, `Tracking:Trust`, `Visits` |
| Known fake GPS and root apps checked on the phone | `FRONTEND/android/app/known-location-spoofing-apps.xml` (new APK after a change) |
| Upload size and pixel limits | `appsettings.json` → `Images` |
| Statistics time zone, low stock threshold, cache time | `appsettings.json` → `Stats` |
| Hours after check-out a rep may still edit visit feedback and products | `appsettings.json` → `Visits:ContentEditHours` |
| Upload folder | `FileStorage:RootPath` (empty = per-user data folder) |
| Data Protection keys folder (live deployments) | `DataProtection__KeysPath` (empty = `keys` next to the upload folder) |
| CORS origins | `appsettings.Development.json` (dev), `Cors__AllowedOrigins` (prod) |
| SignalR Redis backplane (multi-instance) | `SignalR:UseRedisBackplane` |
| Frontend API origin, map tiles, FCM switch | `FRONTEND/.env.local` (see `FRONTEND/.env.example`) |

## Not built yet (stubs and TODOs)

- Play Integrity: server verifier and device token are stubs (interfaces in place).
- FCM sending: the server logs push messages instead of sending them.
- IP geolocation for the GPS-vs-IP check (needs a GeoIP database).
- Doctor classification and QR printing.
- Orders do not deduct stock yet (quantities above stock are only a warning).
- An account-history screen (`GET /api/users/{id}/audit` exists, no UI yet).
- Image URLs are capability URLs (random keys, cached publicly), not signed per user.
- The Android status bar follows the theme through `@capacitor/status-bar`; on Android 15
  edge-to-edge the colour may be ignored by the system (icons still switch).
- Server-side paging: dashboard lists load at most 1000 rows (customers, visits) or the newest
  200 (flags) and page in the browser.
- Visit check-in and check-out screens in the rep app (visits, their feedback and products are
  there; `visit-checkin.ts` holds the calls), reports.
- Push notifications to phones stay off (`VITE_FCM_ENABLED`, and the FCM sender above); notifications
  are in-app, and live while the app is open.
- Production file storage for uploads (local disk or a mounted volume today).
