#!/usr/bin/env bash
# One-time local setup:
#   1. creates .env (random PostgreSQL password) for docker-compose.yml
#   2. stores the API development secrets with `dotnet user-secrets`
#      (kept in ~/.microsoft/usersecrets, never inside the repo)
# Safe to re-run: existing values are kept, the connection string is refreshed from .env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/BACKEND/src/OriginalPharma.Api"

command -v dotnet >/dev/null || { echo "dotnet not found on PATH (see README: .NET SDK)"; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required"; exit 1; }

rand() { openssl rand -base64 96 | tr -dc 'A-Za-z0-9' | cut -c1-"${1:-32}"; }

if [[ ! -f "$ROOT/.env" ]]; then
  sed "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(rand 24)/" "$ROOT/.env.example" > "$ROOT/.env"
  echo "Created .env with a random POSTGRES_PASSWORD"
fi

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

secrets() { dotnet user-secrets --project "$API" "$@"; }
existing="$(secrets list 2>/dev/null || true)"

secrets set "ConnectionStrings:Postgres" \
  "Host=localhost;Port=${POSTGRES_PORT:-5433};Database=${POSTGRES_DB};Username=${POSTGRES_USER};Password=${POSTGRES_PASSWORD}" >/dev/null

if ! grep -q '^Jwt:SigningKey' <<<"$existing"; then
  secrets set "Jwt:SigningKey" "$(rand 64)" >/dev/null
  echo "Created Jwt:SigningKey"
fi

if ! grep -q '^Seed:AdminPassword' <<<"$existing"; then
  admin_password="${ADMIN_PASSWORD:-$(rand 13)Aa1}"
  secrets set "Seed:AdminPassword" "$admin_password" >/dev/null
  echo "Admin login: admin@originalpharma.local / $admin_password"
  echo "Demo users (*@demo.local) use the same password in Development."
fi

echo "Done. Show secrets again with: dotnet user-secrets list --project BACKEND/src/OriginalPharma.Api"
