# Architecture

## Overview

```
                        ┌──────────────────────────────────────────────┐
  Android app ────────► │  ASP.NET Core API (modular monolith)          │
  (Capacitor, native    │   Identity · Tracking · Visits · Crm · Reports│
   background uploads)  │                                               │
                        │  REST /api/*   SignalR /hubs/tracking         │
  iPhone PWA ─────────► │  Hangfire jobs (tracking-lost monitor)        │
  (foreground only)     └───────┬───────────────┬───────────────┬───────┘
                                │               │               │
  Dashboard (browser) ◄─────────┘ SignalR       │               │
                                        PostgreSQL + PostGIS   Redis
                                        (history, everything   (latest positions,
                                         durable)               live-view leases,
                                                                permission versions,
                                                                SignalR backplane)
```

## Repository layout

```
BACKEND/
  OriginalPharma.sln
  Directory.Build.props / Directory.Packages.props   shared settings, central package versions
  openapi/openapi.json                               written on every build (frontend client source)
  src/
    OriginalPharma.Domain/          entities only: Identity, Crm, Visits, Tracking, Reports
    OriginalPharma.Application/     use cases, contracts, validators, pure logic (anomaly
                                    detector, permission evaluator, geofence, scope filters)
    OriginalPharma.Infrastructure/  EF Core (Npgsql + NetTopologySuite), Identity, JWT,
                                    permission cache, Redis stores, Hangfire, stubs for
                                    FCM / Play Integrity / GeoIP, file storage, seeding
    OriginalPharma.Api/             controllers per module, SignalR hub, ProblemDetails,
                                    OpenAPI, CORS, rate limiting, Program.cs
  tests/OriginalPharma.Tests/       unit tests for the pure logic and authorization

FRONTEND/
  src/app/          providers, router, query client
  src/routes/       file-based routes: admin/ (dashboard), rep/ (rep app), login, index
  src/features/     auth, dashboard, users, roles, territories, customers, visits, flags,
                    devices, tracking (live map, hub), onboarding
  src/components/   ui/ (shadcn), layout/, data-table/, shared components (Can, states, ...)
  src/lib/          api-client, session, permissions, i18n, platform/ abstraction
  src/store/        Redux Toolkit slices (client state only)
  src/api/generated OpenAPI client + TanStack Query hooks (orval)
  android/          Capacitor Android project
```

Each layer has the same module folders (Identity, Crm, Visits, Tracking, Reports);
Reports is a placeholder; Crm has a read-only customer list so far. Dependencies point inward:
Api → Infrastructure → Application → Domain.

## Authentication

Short-lived JWT access tokens (15 min) plus rotating refresh tokens (30 days, stored hashed).

| | Web dashboard / PWA | Native app |
| --- | --- | --- |
| Access token | memory (Redux) | memory (Redux) |
| Refresh token | httpOnly, Secure, SameSite=Strict cookie, path `/api/auth` | returned in the body, kept in Android Keystore (secure storage) |
| Refresh call | `POST /api/auth/refresh {client:"web"}` (cookie) | `POST /api/auth/refresh {client:"native", refreshToken}` |

- Every login starts a token **family**. Using an already-rotated token revokes the
  whole family (theft detection), except within a 30 s grace window for parallel refreshes.
- The native **background uploader** gets its own family via
  `POST /api/auth/background-session`, so the app and the uploader never rotate each
  other's tokens. The plugin refreshes natively through `POST /api/auth/refresh-native`.
- Login and refresh are rate limited per IP.

## Permissions

- Format `resource:action` (e.g. `visits:create`), catalog in
  `Application/Identity/Permissions.cs` (mirrored in `FRONTEND/src/lib/permissions.ts`).
- Each grant carries a **scope**: `own` < `team` < `territory` < `all`.
- Tables: `roles`, `permissions`, `role_permissions` (role + permission + scope),
  `user_permission_overrides` (grant with scope, or deny; optional expiry).
- Effective permissions: widest scope across the user's roles; grant overrides replace
  the scope; deny overrides win; expired overrides are ignored (`PermissionEvaluator`).
- Roles are data. Each role has a stable **key** (`Admin`, `SalesManager`, … or a slug made
  from the English name, e.g. `QAVisitor`) that code, JWT role claims and the API use, and
  editable display names (`name_ar`, `name_en`) and description that people see. Code never
  compares display names.
- Seeded roles are **system roles**: they can be renamed (and, except Admin, re-levelled and
  re-scoped) but never deleted. The seeder only creates roles that are missing (by key) and
  never overwrites names, levels or permissions edited from the dashboard.
- `Admin` is locked: every permission with scope `all` (so always `roles:manage` and
  `users:manage`), level 0, enforced on startup. At least one active user must keep it.
- Custom roles can be deleted once no user holds them; the API refuses with `role_in_use`
  (and the count) until their users are moved with `POST /api/roles/{id}/reassign`.
- Every role change (create, rename/re-level, permissions, reassign, delete) is written to
  `role_audit_entries` (actor, role key, before/after per field, time) and served by
  `GET /api/roles/{id}/audit`.

**Hierarchy (anti-escalation)**

Each role has a `level`; a lower number means more authority (Admin 0, SalesManager 10,
AreaManager 20, Supervisor 30, Rep 40). A user's level is their best (lowest) role. Enforced in
`HierarchyGuard` on the server; the dashboard only mirrors it to disable options.

- Create, rename, re-level, delete, edit permissions of, or assign only roles strictly below
  your own level. Level 0 (Admin) is the only level that manages level-0 roles.
- Grant nothing broader than you hold: a new or widened grant (role or user override) must be
  covered by your own permission and scope. Unchanged and narrowed grants are always allowed.
- Manage only users inside your scope (`users:manage`; `roles:manage` for bulk reassign) whose
  best role is below yours. Nobody edits their own roles, overrides or reporting line, and an
  edit to a role you hold may not remove your own role administration access.
- Reporting line (`users.manager_id`): a manager must hold a role with a lower level number
  than each person reporting to them, and the chain may not loop. Checked whenever roles,
  role levels or managers change.

Refusals carry a code in the ProblemDetails body (`role_level_too_high`, `user_level_too_high`,
`scope_too_broad`, `self_edit_forbidden`, `self_lockout`, `manager_level_invalid`,
`manager_cycle`, `admin_role_locked`, `system_role`, `role_in_use`, `last_admin`,
`role_name_taken`, `users_out_of_scope`); the dashboard translates each one.

**Enforcement**

- `[HasPermission("visits:create")]` on endpoints → dynamic policy (`PermissionPolicyProvider`)
  → `PermissionAuthorizationHandler`.
- **Scope** is applied to data with an explicit specification
  (`query.WhereInScope(scope)` / `WhereUsersInScope`), where the scope is resolved for
  the permission the endpoint uses (`IDataScopeResolver`). Explicit instead of a global
  query filter because the same table is read under different permissions
  (e.g. `visits:read` = team, `tracking:history` = own).
  - team = the user plus everyone below them in the manager chain
  - territory = the user's territory and all child territories (region → area → territory)

**Caching and fast propagation**

- Each user has a `permissions_version`. Editing a role (names, level, permissions), moving
  users between roles, or changing a user's roles or overrides bumps it for the affected
  users. Creating or deleting a role affects nobody (a new role has no users; a role can only
  be deleted once it has none).
- The version is cached in Redis (shared by all API instances); the computed permission
  set is cached in memory keyed by (user, version). A bump makes every instance reload.
- Every API response carries `X-Permissions-Version`, including refused (403) and error
  responses; when it changes the frontend refetches `/api/auth/me` and invalidates its
  cached queries, so dashboard edits apply on the user's next request.
- The UI uses `usePermission()` / `<Can permission="...">` only to hide things; the API
  is the authority.

## Location tracking

### Rules

- Tracking runs only between **Start my day** and **End my day** (a `shift`). Points
  outside a shift (2 min grace) are dropped.
- Consent (versioned) must be recorded and the device must have completed the setup
  wizard before a shift can start.

### Device side (battery first)

| | Android (Capacitor) | iPhone PWA / browser |
| --- | --- | --- |
| Engine | Transistorsoft background geolocation (foreground service) | `watchPosition` while the page is visible |
| Movement | motion detection: GPS off and no reporting while stationary | distance / heartbeat thinning in JS |
| Distance filter | 75 m (normal), 20 m (live view) | same, applied in JS |
| Accuracy | balanced; high accuracy only for one-off fixes (visit check-in/out) | browser default |
| Queue | plugin's SQLite | IndexedDB (Dexie) |
| Upload | native HTTP batches, no JS involved, survives app kill (`stopOnTerminate: false`, `startOnBoot`) | throttled batches while visible |
| Keep-alive while stationary | heartbeat (10 min) sends one fix | — |
| Not used | — | Wake Lock, persistent sockets |

The point shape is produced natively by the plugin's `locationTemplate` and includes
the Android **mock-location flag** on every point.

Abstraction: `FRONTEND/src/lib/platform/` defines interfaces for location tracking,
secure storage, offline DB, push, device integrity, device-health inspection and app/OEM
info, with a Capacitor and a web implementation chosen at startup.

### Server side

```
POST /api/tracking/locations (batch)
  → validate (FluentValidation)
  → keep points inside a shift, drop duplicates (user, recorded_at)
  → TrackingAnomalyDetector → score 0-100 per point and per batch
  → insert history into location_points (PostGIS geography, GiST index)
  → update shift.last_point_at (clears "tracking lost")
  → if score ≥ threshold: tracking_flags row for supervisor review
  → latest position → Redis (tracking:latest:{user})
  → SignalR: PositionUpdated / PresenceChanged / FlagRaised to the rep's audience
```

The rep's **audience** is computed from the org hierarchy: `tracking:all`, the rep's
territory group and a group per manager up the chain. On connect, dashboard users join
groups matching their `tracking:view-live` scope. Phones never connect to SignalR.

**Presence**: online (last point within 12 min), idle, tracking lost, off shift.
A Hangfire job runs every minute and marks active shifts with no point for 30 min as
**tracking lost** (presence change + flag). The next accepted point clears it.

**Adaptive frequency (live view)**: when a supervisor opens live view of a rep the
dashboard renews a lease every 60 s (`POST /api/tracking/monitor/live-view/{repId}`,
Redis sorted set with expiry). On the first viewer the server sends an FCM data message
(`tracking-config-changed`); the app fetches `GET /api/tracking/config` and switches to the
live profile. When the last viewer leaves (or the lease expires) it goes back to normal.
The config carries `liveUntil`, so a lost "stop" message cannot keep a phone in live mode.

### Dashboard

- The admin layout owns the realtime side for every page: it polls the presence snapshot
  (60 s safety net) and keeps the `/hubs/tracking` connection, feeding the `liveLocations`
  store used by the live map, the dashboard counters and the sidebar badges. The connection
  is rebuilt when the permissions version changes, because hub groups are assigned on connect.
- Live map: MapLibre GL with OpenStreetMap raster tiles (no API key). Status colors:
  online, stale (on shift but no fix within the 12 min online window), tracking lost, off
  shift. Selecting a rep follows it until the map is dragged and shows the day's route from
  `GET /api/tracking/monitor/history/{userId}` (max 2 days per request). "Watch live" is the
  live-view lease described above; following alone does not wake the phone.
- Lists share one `DataTable` (TanStack Table v9, client-side sorting and paging) and the
  same loading / empty / error states. Filters run as server parameters where the API has
  them, otherwise in the page before rows reach the table.
- Sidebar items appear only with the matching permission (any scope); each route also
  renders a "no access" state, and the API enforces scope on every read.

### Device health and onboarding

The rep app reports device readiness (`POST /api/tracking/device-health`) on setup,
app open and resume: location permission (none / while in use / always), precise vs
approximate, notifications, battery optimization, location services, mock location,
app version and manufacturer/model. The server evaluates issues (same rules in
`DeviceHealthEvaluator.cs` and `features/onboarding/health.ts`), stores the latest
state per device plus history, and pushes changes to supervisors ("unhealthy tracking").

The **Tracking Setup** wizard (`/rep/onboarding`) walks through: consent, location
"while using", "allow all the time" + precise (with a drawn guide of the settings
screen), notifications, location services, battery optimization with manufacturer
specific steps (Samsung, Xiaomi/Redmi/POCO, OPPO/realme/OnePlus, Huawei/Honor,
vivo/iQOO, generic), mock-location check, and a final check that also sends a test fix
to `POST /api/tracking/test-point`. Completing it marks the device ready on the server.
The rep app re-checks on every open/resume and shows a banner when something breaks.

## Anti-fraud layers

1. **Device**
   - Android mock-provider flag on every point (and an explicit check in setup).
   - Play Integrity attestation at shift start (interface + stub; see TODO in
     `PlayIntegrityVerifier`). A failed attestation raises a flag; it never blocks.
2. **Server-side anomaly detection** (`TrackingAnomalyDetector`), each signal counted once per batch:

   | Signal | Weight |
   | --- | --- |
   | mock location | 60 |
   | teleport (≥ 20 km within 5 min, or movement with no elapsed time) | 50 |
   | impossible speed (> 200 km/h, ignoring jumps within combined accuracy / 300 m) | 35 |
   | fix timestamp in the future (> 5 min) | 25 |
   | client/server clock drift (> 5 min) | 20 |
   | suspiciously perfect accuracy (≤ 1.5 m) | 15 |
   | identical accuracy on 6+ consecutive fixes | 15 |
   | GPS far from IP geolocation (> 500 km; needs GeoIP data) | 10 |

   Score ≥ 50 creates a flag. Flags are reviewed (confirmed / dismissed) by supervisors;
   nothing is auto-blocked.
3. **Visit verification**
   - Geofence at check-in: distance to the customer ≤ radius + min(accuracy, 50 m);
     fixes worse than 100 m are refused (the app retries with high accuracy).
   - Optional QR code at the location (constant-time comparison; rotating signed codes are a TODO).
   - Photo upload per visit.
   - Mock flag or out-of-geofence check-out marks the visit for review.

## Data

PostgreSQL with snake_case naming and PostGIS `geography(point, 4326)` columns (distances
in metres). Notable tables: `users`, `roles`, `permissions`, `role_permissions`, `role_audit_entries`,
`user_permission_overrides`, `refresh_tokens`, `territories`, `customers`, `visits`,
`visit_photos`, `shifts`, `location_points`, `tracking_flags`, `devices`,
`device_health_reports`, `tracking_consents`. Hangfire uses its own `hangfire` schema.

Scaling notes: `location_points` will be the largest table; partition by month (or use
TimescaleDB) and move inserts to `COPY` / `ON CONFLICT DO NOTHING` when volume grows.
Enable `SignalR:UseRedisBackplane` when running more than one API instance.

## Errors and validation

- FluentValidation runs for every action argument (filter); failures return 400
  `ValidationProblemDetails` with camelCase field paths.
- Expected errors are typed (`NotFound`, `Forbidden`, `Conflict`, `BusinessRule`, ...)
  and returned as ProblemDetails with a stable `code` (e.g. `consent-required`,
  `outside-geofence`) that the clients translate.
