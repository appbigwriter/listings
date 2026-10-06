#!/bin/sh
set -eu
# Hard allowlist: this drill cannot address a remote database or application database.
[ "${PGHOST:-}" = restore-db ] && [ "${PGUSER:-}" = ag04_fixture ] && [ "${PGDATABASE:-}" = ag04_fixture ] || { echo 'Refusing non-fixture database'; exit 2; }
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSFILE
export PGPORT=5432 PGSSLMODE=disable
export PGPASSWORD="$(cat /run/secrets/fixture_password)"
target="ag04_restore_$(date +%s)_$$"
case "$target" in ag04_restore_[0-9]*_[0-9]*) ;; *) exit 2;; esac
dump=/tmp/fixture.dump
cleanup() { dropdb --if-exists "$target" >/dev/null 2>&1 || true; rm -f "$dump"; }
trap cleanup EXIT INT TERM
started=$(date +%s)
pg_dump --format=custom --no-owner --no-acl --file="$dump" ag04_fixture
pg_restore --list "$dump" >/dev/null
createdb "$target"
pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname="$target" "$dump"
source_rows=$(psql -XAt --dbname=ag04_fixture -c 'SELECT json_agg(p ORDER BY id)::text FROM ag04_probe p')
restored_rows=$(psql -XAt --dbname="$target" -c 'SELECT json_agg(p ORDER BY id)::text FROM ag04_probe p')
[ "$source_rows" = "$restored_rows" ] || { echo 'Row comparison failed'; exit 1; }
receipt=$(psql -XAt --dbname="$target" -c "SELECT hash FROM ag04_receipts WHERE id=1")
[ "$receipt" = fixture-receipt ] || exit 1
next_id=$(psql -XAt --dbname="$target" -c "INSERT INTO ag04_probe(value) VALUES('sequence-check') RETURNING id")
[ "$(printf '%s\n' "$next_id" | head -n 1)" = 3 ] || { echo 'Identity sequence failed'; exit 1; }
elapsed=$(($(date +%s)-started))
printf '{"scenario":"isolated_synthetic_backup_restore","rows":2,"receipt_verified":true,"next_identity":3,"elapsed_seconds":%s,"production_restore":false}\n' "$elapsed"
