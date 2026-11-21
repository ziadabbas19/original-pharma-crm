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

Short-lived JWT access tokens (15 min) plus rotating refresh tokens (stored hashed). Every user, whatever
the role, stays signed in on a device for 30 days after its last use, at most 90 days after the password
login (`Auth__SessionDays`, `Auth__SessionMaxDays`).

| | Web dashboard / PWA | Native app |
| --- | --- | --- |
| Access token | memory (Redux) | memory (Redux) |
| Refresh token | httpOnly, Secure, SameSite=Strict cookie, path `/api/auth` | returned in the body, kept in Android Keystore (secure storage) |
| Refresh call | `POST /api/auth/refresh {client:"web"}` (cookie) | `POST /api/auth/refresh {client:"native", refreshToken}` |

### Sessions

- Every password login starts a **session** (`user_sessions`): one device, with its name, last use,
  sliding expiry and hard limit. Its id is the refresh-token family id and the `sid` claim.
- Each refresh rotates the refresh token and slides the session to 30 days from now, never past
  90 days from the login. A device that is not used for 30 days, or reaches 90 days, needs the password.
- Rotation keeps reuse detection: presenting an already-replaced token ends the session, except
  within `Auth__RefreshReuseGraceSeconds` (10 s) of its replacement, so two refreshes sent together
  from one device (the app waking up with several requests in flight) both succeed.
- A session ends at once (refresh tokens revoked, and the session id put on a short-lived revocation
  list in Redis that the JWT check reads, so access tokens already issued stop working too) when the
  user signs out (that device only), changes the password (every other device), has the password
  reset by someone above them, is deactivated or deleted, or one device is signed out from the
  device list. Ending a phone's session also ends its background uploader session.
- `GET /api/account/sessions` and `DELETE /api/account/sessions/{id}` list and sign out your own
  devices; `GET/DELETE /api/users/{id}/sessions[/{sessionId}]` do the same for someone you may reset
  the password of (`users:reset-password`, in scope and below you), for a lost or stolen phone.
  There is no screen for these yet. Each sign-out is written to the user audit trail.
- The clients refresh on open, on return to the foreground (when the access token is about to run
  out) and on a 401. All waiting requests share one refresh. Only a 401 from the refresh ends the
  session; offline, timeouts, 5xx and rate limits keep it and the refresh is tried again later.

- The native **background uploader** gets its own family via
  `POST /api/auth/background-session`, so the app and the uploader never rotate each
  other's tokens. The plugin refreshes natively through `POST /api/auth/refresh-native`.
- Login and refresh are rate limited per IP.
- The access token carries the session's family id (`sid`). Changing your own password
  (`POST /api/account/password`, current password required, rate limited per user) revokes
  every other family; a reset by someone else (`users:reset-password`) revokes all of them
  and sets `must_change_password`. Until the password is changed the API answers every
  signed-in request with 403 `password_change_required`, except changing the password and
  signing out, and the apps show `/change-password`. Account events are written to
  `user_audit_entries` (`GET /api/users/{id}/audit`).
- No network at start-up: the rep app restores the last profile and grants from the device
  and keeps the stored refresh token; only a refused refresh (401) signs the user out.

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
  - territory = the user's territory and all child territories (region → area → town)
  - doctor lists (`rep_doctors`) have no territory of their own: they are visible when the
    rep is visible in the scope, and territory scope also covers doctors in its towns

**New permissions and defaults**

When a permission first appears in the catalog the seeder gives each seeded role the grant
from its template, once (nobody can have edited it yet); existing grants are never touched.
A key split out of an older one names it in the catalog (`DerivedFrom`): when it first appears, every
role holding the old key, custom roles too, receives the new key with the same scope, so nobody loses
an ability (`territories:delete` from `territories:manage`, `orders:deliver` from `orders:manage`).
Editing uses the existing `:manage` keys; deleting and restoring have their own `:delete` and
`:restore` keys, except roles (`roles:manage`).
Defaults for the sales features: Rep `customers:create`, `orders:create`, `orders:read` (own),
`products:read` (all, filtered by product lines); Supervisor `customers:assign`, `orders:read`,
`orders:manage`, `users:reset-password` (team); AreaManager the same with territory scope;
SalesManager also `products:manage`, `lookups:manage` (all). `users:create` is Admin only
until granted from the matrix.

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
the Android **mock-location flag**, altitude, motion activity and device time on every point; the uploader also
sends the phone's device signals (developer options, mock location app, known spoofing apps, automatic time,
emulator, root) with every batch. See [location-trust.md](location-trust.md).

Abstraction: `FRONTEND/src/lib/platform/` defines interfaces for location tracking,
secure storage, offline DB, push, device integrity, device-health inspection and app/OEM
info, with a Capacitor and a web implementation chosen at startup.

### Server side

```
POST /api/tracking/locations (batch)
  → validate (FluentValidation)
  → keep points inside a shift, drop duplicates (user, recorded_at)
  → TrackingAnomalyDetector → score 0-100, reason codes and trust status
    (trusted / suspicious / rejected) per point, thresholds from the location trust settings
  → insert history into location_points (PostGIS geography, GiST index); nothing is dropped
  → update shift.last_point_at (clears "tracking lost")
  → if score ≥ threshold: tracking_flags row for review (repeats update the open flag),
    audit entry, in-app notice to the supervisor (once per rep per hour)
  → latest position → Redis (tracking:latest:{user})
  → SignalR: PositionUpdated / PresenceChanged / FlagRaised to the rep's audience
```

The rep's **audience** is computed from the org hierarchy: `tracking:all`, the rep's
territory group and a group per manager up the chain. On connect, dashboard users join
groups matching their `tracking:view-live` scope. Every connection also joins the user's own inbox
group for notifications. Phones connect only while the app is on screen, and never for tracking.

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

The full description (checks, codes, settings, review, limits, privacy) is in
[location-trust.md](location-trust.md).

1. **Device**
   - Android mock-provider flag on every point (and an explicit check in setup). On a mock fix the rep app shows a
     bilingual notice, re-checks on its own and reports it (`POST /api/tracking/integrity-events`); it never blocks.
   - Device signals from a local native plugin (`DeviceSignalsPlugin`): developer options, mock location app,
     known spoofing apps (best-effort list, `<queries>` instead of `QUERY_ALL_PACKAGES`), automatic time,
     emulator and basic root signals.
   - Play Integrity attestation at shift start (interface + stub; see TODO in
     `PlayIntegrityVerifier`). A failed attestation raises a flag; it never blocks.
2. **Server-side plausibility checks** (`TrackingAnomalyDetector`), each signal counted once per batch. Every point
   gets a trust status: **rejected** (physically impossible: teleport, impossible speed), **suspicious** (mock fix,
   synthetic-looking fix, clock, spoofing settings) or **trusted**:

   | Signal | Weight |
   | --- | --- |
   | mock location | 60 |
   | teleport (≥ 20 km within 5 min, or movement with no elapsed time) | 50 |
   | spoofing app selected as mock location app / emulator | 40 each |
   | impossible speed (> max plausible speed, ignoring jumps within combined accuracy / 300 m) | 35 |
   | fix or device time in the future (> 5 min) | 25 |
   | client/server clock drift (> 5 min) | 20 |
   | frozen position (same coordinates, no GPS jitter) / phone still while moving | 20 each |
   | suspiciously perfect accuracy (≤ 1.5 m) / identical accuracy on 6+ fixes / altitude always 0 | 15 each |
   | root signals (informational) | 15 |
   | GPS far from IP geolocation (> 500 km; needs GeoIP data) | 10 |
   | spoofing app installed / automatic time off (informational) | 10 / 5 |

   Score ≥ 50 creates a flag. Flags are reviewed by supervisors (confirmed / dismissed on Tracking flags, or
   acknowledged with a comment on Suspicious activity); nothing is auto-blocked or deleted.
3. **Visit verification**
   - Geofence at check-in: distance to the customer ≤ radius + min(accuracy, 50 m);
     fixes worse than 100 m are refused (the app retries with high accuracy). A customer with no saved
     location cannot be checked in to.
   - Outside the geofence the visit is kept and marked for review (`Visits:RejectOutsideGeofence` = false;
     set it to true to refuse those check-ins instead).
   - Optional QR code at the location (constant-time comparison; rotating signed codes are a TODO).
   - Photo upload per visit.
   - A mock location at check-in or check-out, a check-in outside the geofence and a check-out with no
     location mark the visit for review; the reasons are returned as `reviewReasons`.
   - Check-in and check-out further than the max distance from the doctor (`far-from-doctor`), or with weak
     evidence (`low-trust`: poor or synthetic accuracy, spoofing settings, suspicious points around the visit) are
     marked too and stored in `visits.trust_reasons`.
4. **Admin settings and policy**: thresholds and the mock location policy (flag only, or flag and exclude from
   distance and attendance) are edited in the dashboard and stored in `app_settings`.

## Sales: doctors, catalog and orders

- **Territories**: region → area → town. Reps and supervisors are assigned to an area;
  doctors are placed in a town. "Outside area" warnings compare a doctor's town with the
  rep's area (never a refusal).
- **Doctor lists**: a doctor is one `customers` row; `rep_doctors` (unique per rep and doctor)
  puts it on reps' lists. Reps search the directory before creating a doctor
  (`doctor_exists` with the existing id when the same name exists in the town).
- **Catalog**: product lines and products (price in EGP, stock, picture). Users see only
  the lines assigned to them (`user_product_lines`) unless they hold `orders:manage` or
  `products:manage`.
- **Orders**: numbers come from the `order_numbers` sequence (`ORD-2026-000123`). Lines keep
  a price and name snapshot; totals are computed on the server (`OrderPricing`, rounded to
  piasters half away from zero). Quantity above stock is a warning (`stockWarnings`), stock
  is not deducted yet. Each role may carry `max_discount_percent` (null = no cap; the most
  generous role wins); a higher line discount is refused with `discount_above_cap`.
  Exactly one of `collection_method_id` / `collection_method_other` (validator and check
  constraint). Status changes and edits go to `order_history`.
- **Offline**: the rep app always saves orders through the device outbox (IndexedDB in the
  browser, SQLite in the Android app) with a client-generated `clientRequestId`; a unique
  index on (rep, clientRequestId) makes retries return the existing order. Orders refused by
  the server (4xx) move to a "needs attention" list to fix or discard.

## Deleting, archiving and restoring

Every delete is `POST .../bulk-delete` with the ids and an optional `dryRun`. Each item is checked on
its own (permission scope, hierarchy, integrity) and comes back as deleted, archived or blocked with a
reason code. The confirmation dialog calls the dry run first, so it can say what will happen; blocked
rows stay selected afterwards. Typing the word "delete" is required for users, roles and more than
10 items.

One request changes at most 500 items; a `dryRun` may judge up to 2000, so a whole selection is forecast as one set. The apps send larger selections in consecutive batches and merge the results into one summary. Items refused only because a related item was in a later batch (a parent and its child, a manager and their report) are sent again once the others are done. If a batch fails part way, what already went through stays done and the remaining items are reported as not processed and stay selected.

| Record | Deleted when | Archived when | Blocked when |
| --- | --- | --- | --- |
| Specialty, collection method | unused | doctors or orders use it | |
| Town, area, region | unused | doctors, orders or visits point at it | active child nodes or users |
| Doctor, pharmacy | no visits or orders | visits or orders point at it | outside the scope |
| Product | not on orders or visits | on past orders or visits | |
| Product line | always; its products stay, unassigned | | |
| User | no activity | any activity | self, last admin, level, scope, people still reporting |
| Role | custom and unused | | system role, level, users holding it |
| Order, visit | never | always | scope; a visit in progress |
| Device record | always, with its health history | | outside the scope |

Archived rows leave lists, pickers and statistics, old records keep showing them, and users with the
`:restore` permission bring them back. Edits, deletes, archives and restores are written to
`audit_entries` (who, what, when, how many), shown in the activity log (`audit:read`).

**Product lines**: a product has at most one line and may have none. Deleting a line clears it on its
products first (the foreign key is restrictive, so a line can never take products with it). Unassigned
products are visible only to `products:manage` and `orders:manage`; orders that already contain one
keep working with their price snapshot.

**Discounts**: products and lines may carry a default and a maximum percent. The default on a new order
line is the product's, else the line's. The highest discount allowed is the lowest of the product
maximum, the line maximum and the role cap, enforced in `OrderService` (`discount_above_cap`, with
`limit` = product, line or role).

## Notifications

`notifications` holds one row per recipient; every query filters on the caller. Order decisions and
deliveries notify the rep; visit feedback notifies the rep's supervisor and the manager above them,
and a reply notifies the rep. Rows are saved with the change they announce, then pushed to the
recipient's inbox group on the hub. Rejecting needs a reason. Reasons and notes reach the rep; an
internal note on a decision never does.

## Visit flow in the rep app

Check-in, proof photo, content and check-out go through one ordered outbox on the device, online or
not (`features/visits/visit-outbox.ts`, order rules in `visit-queue.ts`). The check-in's
`clientRequestId` becomes the visit id, so later steps and orders can point at a visit that has not
reached the server yet; retries with the same key return what already exists. A step the server refuses
holds back the later steps of that visit only, stays listed under My visits and can be sent again.
A check-in that arrives late is matched to the shift running at its device time. The visit in progress
is kept in the device database, so it survives the app being closed. One open visit per rep is enforced
by a partial unique index.

## Visit feedback and products

The rep writes feedback (with an optional category) and the products discussed on their own visit
while it is in progress and for `Visits:ContentEditHours` (24) after check-out. The app saves through
the device outbox; each update carries the device time of the edit, and the server ignores anything
older than what it already applied. Feedback is readable by the rep's reporting line and by anyone
whose `visits:read` scope covers the rep.

## Statistics

`StatsService` aggregates in SQL inside the caller's `stats:read` scope, so the same code gives a rep
their own numbers, a supervisor their team, a manager their territory and an admin everything. The
client never totals raw rows. Results are cached for 60 seconds per user, permissions version and
filters. Archived orders and visits are left out. CSV export of each table needs `stats:export`.

## Images

`ImageService` (product and profile pictures): at most 5 MB, recognised by file signature
(JPEG, PNG, WebP), decoded with SkiaSharp (pixel limit against decompression bombs), EXIF
orientation applied, re-encoded to WebP (which drops all metadata) as a display size and a
thumbnail, stored under a random 128-bit key. Files are written once and served by
`GET /api/images/{key}/{size}.webp` with `Cache-Control: immutable` and an ETag; a new upload
gets a new key. The URLs are unguessable but not signed, so anyone holding one can load the
picture. Storage root: `FileStorage:RootPath` (default `~/.local/share/original-pharma/uploads`,
the `uploads` folder of the data volume in the container image), never inside the repository.

## Data

PostgreSQL with snake_case naming and PostGIS `geography(point, 4326)` columns (distances
in metres). Notable tables: `users`, `roles`, `permissions`, `role_permissions`, `role_audit_entries`,
`user_permission_overrides`, `user_audit_entries`, `refresh_tokens`, `territories`, `customers`,
`rep_doctors`, `specialties`, `product_lines`, `products`, `user_product_lines`,
`collection_methods`, `orders`, `order_lines`, `order_history`, `seed_history`, `visits`,
`visit_photos`, `visit_feedback`, `visit_feedback_seen`, `visit_feedback_replies`, `visit_products`,
`notifications`, `audit_entries`, `app_settings`, `shifts`, `location_points`, `tracking_flags`, `devices`,
`device_health_reports`, `tracking_consents`. Hangfire uses its own `hangfire` schema (jobs:
`tracking-lost-monitor` every minute, `device-signals-retention` daily).

Scaling notes: `location_points` will be the largest table; partition by month (or use
TimescaleDB) and move inserts to `COPY` / `ON CONFLICT DO NOTHING` when volume grows.
Enable `SignalR:UseRedisBackplane` when running more than one API instance.

## Visits by day and daily expenses

Days are Egypt days (`Stats__TimeZone`, Africa/Cairo with daylight saving) on both sides:
`LocalCalendar` on the server, `lib/egypt-day.ts` in the clients.

- `GET /api/visits?day=yyyy-MM-dd&limit=` lists one day (instead of from/to); the list items carry
  the doctor's town. The rep's Visits screen and the managers' "By day" view of Visits use a day
  picker (previous, next, Today, a calendar for any date); the chosen day stays in the address.
- Each town has a default daily expense (`territories.default_daily_expense`, EGP, set from Areas &
  towns with `expenses:settings`). The first visit of a rep in a town on a day creates that town's
  line (`expense_lines`, source auto, `original_amount` = the default) in one
  `INSERT ... ON CONFLICT DO NOTHING` against a partial unique index (rep, day, town) of automatic
  lines, so simultaneous first visits make one line, and a line the rep removed (archived) or added
  by hand is never duplicated. Towns with no amount, and visits without a town, create nothing.
- Reps (`expenses:read-own`, `expenses:write-own`) change their own lines and notes from today back
  `Expenses__EditableDays` days (45); never for a day still to come (day notes may be written ahead).
  Managers read their scope (`expenses:read`, scoped like visits) and, with `expenses:manage`,
  change any past day of the reps in scope and write a manager note. Every create, change, removal
  and note is written to the activity log with the values before and after.
- The rep app queues its own changes in the device outbox (`expense-outbox.ts`) like visits and
  orders; each change carries the time it was made and the server keeps the latest change of each
  field of a line, so an amount changed on one device never undoes a note written on another.
- Month totals are always summed from the current lines of the calendar month's days (1st to last,
  Egypt days): a change made later counts in the month of the line's day. `GET /api/expenses/day`,
  `/month`, `/month-report` and the range report give day, month, per rep, per city and per day
  totals; `/export` and `/statement` give CSV (one rep or every rep in scope).

## Phones (every role)

The Android app and the web app on a phone open the same experience for the same person:

- People who manage others (`canUseDashboard`) get the management screens; everyone else the rep app.
  Field work is recognised by `tracking:report` / `visits:create` held at scope `own` (the admin role
  holds every permission at scope `all` and is not a field user). Someone with both sees their own
  field pages under "My field work" in the More menu, and a Management entry in the rep Account tab.
- Below 768 px the management shell replaces the sidebar with a floating bottom bar: the four most
  used pages the role may open (`phoneTabs` in `admin-nav.ts`) and More, a full-screen menu with every
  other page, the profile, theme, language and sign-out.
- `DataTable` shows rows as cards on phones (title column, labelled fields, a sort picker, select all)
  with the row actions in a bottom-sheet menu. Filters (`FilterField` in a toolbar or `FilterBar`) move
  into a bottom sheet with Reset and Apply and show as removable chips. The bulk selection bar sits
  above the bottom bar. Tables with many numeric columns (permission matrix, statistics tables, a rep's
  points, a doctor's visit locations) stay tables that scroll inside their own box with a sticky
  first column.
- Dialogs are bottom sheets on phones with the buttons pinned at the bottom; inputs, selects and
  buttons are 44 px tall and checkboxes have a 44 px touch area. The live map keeps the full width
  and the selected rep's details slide up over it.
- Exports go through `lib/export-file.ts`: a download in a browser; in the Android app the local
  `FileSharePlugin` opens Android's "Save as" screen (or the share sheet).
- Location tracking, the tracking setup, health checks and warnings run only for people who track
  (`tracksLocation`); `applyCollection` refuses to start the tracker for anyone else.
- Offline, management screens keep the last loaded data under an offline notice, and changes fail at
  once with the "no connection" message instead of waiting.

## Errors and validation

- FluentValidation runs for every action argument (filter); failures return 400
  `ValidationProblemDetails` with camelCase field paths.
- Expected errors are typed (`NotFound`, `Forbidden`, `Conflict`, `BusinessRule`, ...)
  and returned as ProblemDetails with a stable `code` (e.g. `consent-required`,
  `outside-geofence`) that the clients translate. Every body carries `traceId`.
- Business-rule (422) and conflict (409) titles are written for users and carry
  `safeToShow: true`; every other title is for developers and is never shown as it is.

### In the clients

`FRONTEND/src/lib/errors/error-handler.ts` is the only code that interprets failed requests
for display:

- `normalizeError` turns anything thrown into an `AppError` with a `kind` (`network`, `timeout`,
  `unauthorized`, `forbidden`, `notFound`, `conflict`, `validation`, `rateLimited`, `server`,
  `cancelled`, `unknown`), the status, code, field errors, `traceId` and whether a retry can help.
- `getErrorMessage` gives the text: the translation of the problem code (`errors.<code>`), else a
  title marked `safeToShow`, else the generic text of the kind (`errors.kind.<kind>`). Server and
  unexpected failures also show the `traceId` as a reference the user can quote.
- `handleError` logs (development builds only, without bodies or tokens) and shows one toast;
  identical toasts within 2 s are merged and offline toasts appear at most every 15 s.
- TanStack Query routes failures through it: queries toast only when there is no cached data to
  show, mutations always unless `meta.silent`. Forms and dialogs show the error inline instead
  (`inlineErrors` on the mutation hook, `useFormErrors` / `applyFieldErrors` for field messages).
- 401 stays with the session refresh in `lib/api-client.ts`: an error only reaches the handler
  as `unauthorized` after the refresh failed for good, and the handler never redirects. 403 is a
  message, not a redirect.
- `<ErrorState>`, `<FormError>` and the router's error and not-found screens all render from
  the handler's output.
