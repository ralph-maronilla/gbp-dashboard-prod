#!/usr/bin/env bash
# Runs ON THE SERVER, as root (via sudo), from deploy.sh:   activate-release.sh <tarball> <release-id>
# Unpacks a release, applies database migrations, switches the app to it, checks it is healthy, and puts the previous
# release back if it is not.
set -euo pipefail

TARBALL=${1:?tarball}; ID=${2:?release id}
ROOT=/srv/gbp
REL="$ROOT/releases/$ID"
SERVICE=gbp-dashboard
KEEP=5

PREV=$(readlink -f "$ROOT/current" 2>/dev/null || true)

echo "== Unpacking $ID"
install -d -o gbp -g gbp "$REL"
tar -xzf "$TARBALL" -C "$REL" --no-same-owner
chown -R gbp:gbp "$REL"
# The migration tool is installed once in $ROOT/tools; link it in rather than shipping it with every release.
ln -sfn "$ROOT/tools/node_modules" "$REL/migrate/node_modules"

echo "== Applying database migrations"
if ! sudo -u gbp -H bash -c "set -a; . /etc/gbp-dashboard/env; set +a; cd '$REL/migrate' && export DIRECT_URL=\"\${DIRECT_URL:-\$DATABASE_URL}\" && ./node_modules/.bin/prisma migrate deploy"; then
  echo "Migration failed: nothing was switched. The running release is untouched." >&2
  exit 1
fi

echo "== Switching to $ID"
ln -sfn "$REL" "$ROOT/current.new"
mv -T "$ROOT/current.new" "$ROOT/current"
systemctl restart "$SERVICE"

echo "== Waiting for the app to answer"
for i in $(seq 1 45); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    echo "Healthy after ${i}s."
    # Keep the newest releases for quick rollback; remove the rest.
    ls -1dt "$ROOT"/releases/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -rf
    rm -f "$TARBALL"
    echo "== Deployed $ID"
    exit 0
  fi
  sleep 1
done

echo "The new release did not become healthy in 45 s." >&2
journalctl -u "$SERVICE" -n 40 --no-pager >&2 || true
if [ -n "$PREV" ] && [ -d "$PREV" ]; then
  echo "== Rolling back to $(basename "$PREV")" >&2
  ln -sfn "$PREV" "$ROOT/current.new"
  mv -T "$ROOT/current.new" "$ROOT/current"
  systemctl restart "$SERVICE"
  echo "Rolled back. (Database migrations are not undone: keep them backward compatible.)" >&2
fi
exit 1
