#!/usr/bin/env bash
# Daily logical backup of the app database to /var/backups/gbp, keeping 14 days. Runs as the `gbp` user from a systemd timer.
# This is IN ADDITION to the managed database's own automatic backups and snapshots (Lightsail console), which are the
# primary safety net; this copy lives on the server's disk and is the quickest to restore a single table from.
set -euo pipefail
set -a; . /etc/gbp-dashboard/env; set +a

DIR=/var/backups/gbp
STAMP=$(date -u +%Y-%m-%d-%H%M)
OUT="$DIR/gbp-$STAMP.dump"

export PGSSLMODE=verify-full
export PGSSLROOTCERT="${DATABASE_CA_FILE:-/etc/ssl/certs/rds-global-bundle.pem}"
pg_dump "${DIRECT_URL:-$DATABASE_URL}" --format=custom --no-owner --no-privileges --file="$OUT.partial"
mv "$OUT.partial" "$OUT"
# A dump that cannot be listed is not a backup.
pg_restore --list "$OUT" > /dev/null

find "$DIR" -name 'gbp-*.dump' -mtime +14 -delete
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
