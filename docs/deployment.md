# Deployment

Production layout:

| Part | Where | Address |
| --- | --- | --- |
| API | Railway service built from `BACKEND/Dockerfile` | `https://api.your-domain` |
| Database | PostgreSQL with PostGIS on Railway | private network |
| Cache | Redis on Railway | private network |
| Uploads | Railway volume mounted into the API service | `FileStorage__RootPath` |
| Web app | Static host | `https://app.your-domain` |
| Android app | Signed release build | talks to the API over HTTPS |

The web app and the API must be subdomains of **one domain you own**. The web session cookie is
`SameSite=Strict`, so it is only sent between the two when they share a registrable domain. Two
`*.up.railway.app` addresses do not qualify.

## API variables

Names use the .NET convention: `__` is the section separator. `.env.production.example` lists them all.
The API refuses to start in any environment other than `Development` and `Testing` when a required value
is missing, unsafe or still a placeholder, and names each variable to fix.

### Required

| Variable | Value |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` (already set in the image) |
| `ConnectionStrings__Postgres` | `Host=...;Port=5432;Database=...;Username=...;Password=...` |
| `ConnectionStrings__Redis` | `host:6379,password=...` |
| `Jwt__SigningKey` | At least 32 random characters: `openssl rand -base64 48` |
| `Jwt__Issuer` | Token issuer, for example `original-pharma-api` |
| `Jwt__Audience` | Token audience, for example `original-pharma-clients` |
| `App__PublicBaseUrl` | Public HTTPS origin of the API, no path. Requests for any other host are refused |
| `Cors__AllowedOrigins` | Comma-separated exact origins: the web app, plus `https://localhost` for the Android app |
| `FileStorage__RootPath` | Absolute path of the mounted uploads volume |
| `ForwardedHeaders__TrustAllProxies` | `true` on Railway. Elsewhere use `ForwardedHeaders__KnownNetworks` instead |
| `Seed__AdminEmail` | First administrator. Needed only until an admin exists |
| `Seed__AdminPassword` | Initial password, 12+ characters with upper case, lower case and a digit. Must be changed at first sign-in |

### Optional

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | Listening port. Railway sets it |
| `Serilog__MinimumLevel__Default` | `Information` | Log level: `Debug`, `Information`, `Warning`, `Error` |
| `ForwardedHeaders__ClientIpHeader` | `X-Forwarded-For` | Header holding the client address. Railway: `X-Real-IP` |
| `ForwardedHeaders__ForwardLimit` | `1` | Proxies to read through |
| `ForwardedHeaders__KnownProxies` | none | Comma-separated proxy addresses |
| `ForwardedHeaders__KnownNetworks` | none | Comma-separated proxy ranges in CIDR form |
| `Auth__RefreshCookie__Domain` | API host only | Leave empty unless another subdomain must receive the cookie |
| `Auth__RefreshCookie__Secure` | `true` | Must stay `true` in production |
| `Auth__RefreshCookie__SameSite` | `Strict` | `Strict` or `Lax` |
| `Database__MigrateOnStartup` | `true` | See [Migrations](#migrations) |
| `Seed__AdminFullName` | `System Admin` | Display name of the first administrator |
| `AllowedHosts` | public host and Railway's health check | Semicolon-separated host override |
| `DeveloperPages__Enabled` | `false` | Turns on `/swagger` and `/openapi/v1.json`. The Hangfire dashboard stays local-only |
| `SignalR__UseRedisBackplane` | `false` | Needed only when running more than one API instance |

## Railway setup

1. **Database.** Add a PostgreSQL service that includes PostGIS: Railway's PostGIS template, or the
   `postgis/postgis:18-3.7` image with a volume on `/var/lib/postgresql`. The plain PostgreSQL template
   has no PostGIS and the first migration fails on it.
2. **Redis.** Add Railway's Redis service.
3. **API.** Add a service from this repository, set the root directory to `BACKEND`, and let it build the
   Dockerfile.
4. **Volume.** Attach a volume to the API service at `/var/lib/original-pharma/uploads`.
5. **Health check.** Set the health check path to `/health`.
6. **Domain.** Add the custom domain `api.your-domain` to the API service.
7. **Variables.** Add these, then the rest of the required list:

   ```
   ConnectionStrings__Postgres=Host=${{Postgres.PGHOST}};Port=${{Postgres.PGPORT}};Database=${{Postgres.PGDATABASE}};Username=${{Postgres.PGUSER}};Password=${{Postgres.PGPASSWORD}}
   ConnectionStrings__Redis=${{Redis.REDISHOST}}:${{Redis.REDISPORT}},password=${{Redis.REDISPASSWORD}}
   FileStorage__RootPath=/var/lib/original-pharma/uploads
   ForwardedHeaders__TrustAllProxies=true
   ForwardedHeaders__ClientIpHeader=X-Real-IP
   RAILWAY_RUN_UID=0
   ```

   `Postgres` and `Redis` are the service names in your project. `RAILWAY_RUN_UID=0` is needed because
   Railway mounts volumes as root and the image otherwise runs as a non-root user.

8. **First sign-in.** Sign in with `Seed__AdminEmail`, choose a new password, then delete
   `Seed__AdminEmail` and `Seed__AdminPassword` from the service variables.

Railway does not publish its proxy addresses, so the API trusts the connecting proxy and reads the client
address from `X-Real-IP`, which Railway's edge overwrites on every public request. Services in the same
Railway environment can reach the API directly and could set that header themselves, so keep only trusted
services in that environment.

A service with a volume runs as one instance, and a redeploy has a short outage while the volume moves to
the new container.

## Security behaviour in production

- HTTP requests are redirected to HTTPS and HTTPS responses carry HSTS. `/health` is exempt from the redirect
  because the platform's health check calls the container directly.
- CORS allows only `Cors__AllowedOrigins`. The web refresh cookie is `HttpOnly`, `Secure` and `SameSite=Strict`.
- Until a temporary password is changed, signed-in requests get `403` with the code
  `password_change_required`. Only changing the password and signing out work, plus sign-in and session
  refresh, which the apps need to reach the change-password screen.
- Sign-in, refresh and native refresh allow 30 requests per minute per client address.
- `/health` answers only `{"status":"Healthy"}`, or `503` with `Unhealthy`.
- Swagger, OpenAPI and the Hangfire dashboard are off unless `DeveloperPages__Enabled=true`.

## Data

### Migrations

Migrations are applied **on startup**. Each instance takes a PostgreSQL advisory lock before migrating and
seeding, so only one works at a time and the others wait, for up to five minutes. If initialisation fails the
container exits and the platform restarts it, so it never serves an unmigrated database.

To run migrations by hand instead, set `Database__MigrateOnStartup=false` and run this before deploying:

```bash
cd BACKEND
dotnet tool restore
ConnectionStrings__Postgres='<connection string>' dotnet dotnet-ef database update \
  -p src/OriginalPharma.Infrastructure -s src/OriginalPharma.Api
```

The lock needs a direct database connection. Do not point the API at a pooler in transaction mode.

### What production seeds

Roles, permissions, doctor specialties, collection methods and the first administrator. Demo users, regions,
products, doctors and orders are created only in `Development`. Setting `Seed__DemoData=true` in production
stops the API from starting.

### Uploads

Product pictures, profile pictures and visit photos are stored under `FileStorage__RootPath`. The API checks
at startup that the folder is writable, and refuses any path that resolves outside it.

### Backup

Take the database and the uploads volume together, so that rows and files match.

**Database.** Use the `DATABASE_PUBLIC_URL` of the PostgreSQL service. The image keeps `pg_dump` on the same
major version as the server:

```bash
export DATABASE_PUBLIC_URL='postgresql://...'
mkdir -p backups
podman run --rm -e PGURL="$DATABASE_PUBLIC_URL" -v "$PWD/backups:/backups:Z" docker.io/postgis/postgis:18-3.7 \
  sh -c 'pg_dump "$PGURL" --format=custom --no-owner --no-privileges --file=/backups/original-pharma-$(date +%F-%H%M).dump'
```

Keep backups outside the repository and encrypted: they hold personal data and password hashes.

**Uploads.** Enable scheduled backups on the API service's volume in Railway (service **Backups** tab).

Railway's own database volume backups can run alongside this, but the dump is what lets you restore into
any PostgreSQL server.

### Restore

Restore into a **new empty database**, check it, then switch the API over:

```bash
export RESTORE_URL='postgresql://.../original_pharma_restore'
podman run --rm -e PGURL="$RESTORE_URL" -v "$PWD/backups:/backups:Z" docker.io/postgis/postgis:18-3.7 \
  sh -c 'pg_restore --dbname="$PGURL" --no-owner --no-privileges --exit-on-error /backups/<file>.dump'
```

1. Check row counts, for example `SELECT count(*) FROM users;`.
2. Restore the uploads volume from the backup taken at the same time.
3. Point `ConnectionStrings__Postgres` at the restored database and redeploy.

## Web app

Build on the static host with:

```bash
cd FRONTEND
npm ci
npm run build:production
```

Publish `FRONTEND/dist`. The build stops if the variables below are missing or unsafe.

| Variable | Required | Value |
| --- | --- | --- |
| `VITE_API_BASE_URL` | yes | Public HTTPS origin of the API |
| `VITE_MAP_TILE_URL` | yes | HTTPS tile template with `{z}`, `{x}`, `{y}` |
| `VITE_MAP_TILE_ATTRIBUTION` | yes | Credit the tile provider requires (HTML allowed) |
| `VITE_MAP_TILE_SIZE` | no | Tile size in pixels, default `256` |
| `VITE_MAP_TILE_MAX_ZOOM` | no | Highest zoom the provider serves, default `19` |
| `VITE_FCM_ENABLED` | no | `true` once Firebase is configured for the Android app |

`VITE_*` values are compiled into the public bundle, so never put a secret in one.

**Hosting files.** `public/_redirects` (single-page fallback) and `public/_headers` (security and cache headers)
work on Netlify, Cloudflare Pages and compatible hosts. On any other host, configure the same behaviour:

- Serve `index.html` for every path that is not a file.
- Send `Cache-Control: no-cache` for `index.html`, `sw.js`, `registerSW.js` and `manifest.webmanifest`.
- Send `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`.

**Service worker.** It caches only the app's own build files and never API responses. A new release replaces the
previous one on the next visit, and a tab left open across a release reloads itself when it needs a file that is gone.

### Map tiles

Development uses the public OpenStreetMap servers. Their
[usage policy](https://operations.osmfoundation.org/policies/tiles/) does not cover production applications, so a
production build requires a provider:

| Option | `VITE_MAP_TILE_URL` |
| --- | --- |
| MapTiler | `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=KEY` |
| Stadia Maps | `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=KEY` |
| Thunderforest | `https://tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey=KEY` |
| Your own tile server | `https://tiles.your-domain/{z}/{x}/{y}.png` |

Tile keys are visible in the browser. Restrict each key in the provider's console to the web app's domain and, if
the provider supports it, to `https://localhost` for the Android app. Check the provider's plan and attribution
terms before going live. Use a light raster style: the dark theme is derived from it.

## Android

Install JDK 21 and the Android SDK (see the README). Release builds refuse plain HTTP in three ways: the manifest
disables cleartext traffic, the network security config blocks it, and the build stops if the last
`cap sync` used `CAP_DEV_HTTP`. `CAP_DEV_HTTP=1` is for local debug builds only.

### Debug build against the live API

```bash
cd FRONTEND
VITE_API_BASE_URL=https://api.your-domain npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK is in `android/app/build/outputs/apk/debug/`.

### Signed release build

Create the upload keystore once and keep it, with its passwords, outside the repository. Losing it means you can no
longer update the app without a key reset through Google Play.

```bash
keytool -genkeypair -v -keystore ~/keys/original-pharma-upload.jks \
  -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

Give the build the signing details through environment variables:

```bash
export ANDROID_KEYSTORE_PATH="$HOME/keys/original-pharma-upload.jks"
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS=upload
export ANDROID_KEY_PASSWORD='...'
```

Or put `storeFile`, `storePassword`, `keyAlias` and `keyPassword` in `FRONTEND/android/keystore.properties`, which is
git-ignored. Then build:

```bash
cd FRONTEND
npm run build:production
npx cap sync android
cd android && ./gradlew bundleRelease
```

The bundle is in `android/app/build/outputs/bundle/release/`. Raise `versionCode` and `versionName` in
`android/app/build.gradle` for every release.

Before the first public release, also add the background geolocation license, Firebase and the Play Console
declarations listed in the README.

## Production check on your machine

Runs the production image against the local PostgreSQL and Redis from `docker-compose.yml`:

```bash
cp .env.production.example .env.production.local   # fill it in; use Host=postgres and redis:6379
podman compose --profile api up -d --build
curl -H 'Host: api.your-domain' http://127.0.0.1:8080/health
```

Use a separate database name in `.env.production.local`, so the check leaves your development data alone.
