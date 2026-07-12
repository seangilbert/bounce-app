#!/usr/bin/env bash
# Apply any new supabase/migrations/*.sql to BOTH databases (dev + prod).
# Both projects are CLI-tracked, so `db push` applies only migrations not yet
# recorded in each project's history. Safe to run when there's nothing new.
#
#   PROD: urmqfxsajoboibjqhtmn  ("Rentals App")  ← Vercel Production
#   DEV : vjgurdppmwxdlhczswdb  ("Bounce-app")   ← .env.local + Vercel Preview/Dev
set -euo pipefail
PROD=urmqfxsajoboibjqhtmn
DEV=vjgurdppmwxdlhczswdb

push() {
  echo "→ $1 ($2)"
  supabase link --project-ref "$2" >/dev/null 2>&1
  printf 'y\n' | supabase db push
}

push "PROD" "$PROD"
push "DEV"  "$DEV"
supabase link --project-ref "$PROD" >/dev/null 2>&1   # leave linked to prod
echo "✓ applied to both; linked back to prod"
