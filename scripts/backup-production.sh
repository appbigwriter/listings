#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
mkdir -p "$BACKUP_DIR"
case "$RETENTION_DAYS" in ''|*[!0-9]*) echo 'BACKUP_RETENTION_DAYS must be an integer' >&2; exit 2;; esac
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$BACKUP_DIR/prelisting-$stamp.dump"
umask 077
pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" --file="$file"
test -s "$file"
find "$BACKUP_DIR" -type f -name 'prelisting-*.dump' -mtime "+$RETENTION_DAYS" -delete
printf '{"status":"ok","file":"%s","retention_days":%s}\n' "$file" "$RETENTION_DAYS"
