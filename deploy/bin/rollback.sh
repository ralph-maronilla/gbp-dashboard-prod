#!/usr/bin/env bash
# Runs ON THE SERVER, as root:  rollback.sh [release-id]   (no id = the release before the current one)
set -euo pipefail
ROOT=/srv/gbp
CUR=$(basename "$(readlink -f "$ROOT/current")")
if [ -n "${1:-}" ]; then TARGET=$1; else TARGET=$(ls -1t "$ROOT/releases" | grep -vx "$CUR" | head -1); fi
[ -n "$TARGET" ] && [ -d "$ROOT/releases/$TARGET" ] || { echo "No such release. Available:"; ls -1t "$ROOT/releases"; exit 1; }
echo "Current: $CUR  ->  $TARGET"
ln -sfn "$ROOT/releases/$TARGET" "$ROOT/current.new"
mv -T "$ROOT/current.new" "$ROOT/current"
systemctl restart gbp-dashboard
for i in $(seq 1 45); do
  curl -fsS --max-time 3 http://127.0.0.1:3000/api/health > /dev/null 2>&1 && { echo "Healthy. Rolled back to $TARGET."; exit 0; }
  sleep 1
done
echo "Not healthy after the rollback: check 'journalctl -u gbp-dashboard -n 80'." >&2
exit 1
