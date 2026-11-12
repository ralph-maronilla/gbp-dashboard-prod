#!/usr/bin/env bash
# Builds the app on YOUR computer (the 2 GB server is too small to build on) and ships it.
#
#   deploy/deploy.sh ubuntu@<server-ip-or-domain>
#
# Environment: SSH_KEY=/path/to/key.pem   SKIP_CHECK=1 (skip the type check, lint and tests)
set -euo pipefail

TARGET=${1:?usage: deploy/deploy.sh user@host}
cd "$(dirname "$0")/.."
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$SSH_KEY")

SHA=$(git rev-parse --short HEAD 2>/dev/null || echo nogit)
DIRTY=""; git diff --quiet HEAD 2>/dev/null || DIRTY="-dirty"
ID="$(date -u +%Y%m%d-%H%M%S)-${SHA}${DIRTY}"
echo "== Release $ID"

if [ -z "${SKIP_CHECK:-}" ]; then
  echo "== Checks (type check, lint, tests)"
  npm run check
fi

echo "== Build"
npm ci --no-audit --no-fund
rm -rf .next
# These stand-ins only let the build run: the real values come from /etc/gbp-dashboard/env on the server, at run time.
DATABASE_URL=postgresql://build@localhost/build BETTER_AUTH_SECRET=build-only-build-only-build-only-0123456789 APP_URL=https://build.invalid \
  npx next build

echo "== Package"
OUT=$(mktemp -d)
cp -R .next/standalone/. "$OUT/"
mkdir -p "$OUT/.next"
cp -R .next/static "$OUT/.next/static"
[ -d public ] && cp -R public "$OUT/public"
# Database migrations, and the scripts the runbook uses on the server (data import).
mkdir -p "$OUT/migrate"
cp -R prisma prisma.config.ts "$OUT/migrate/"
cp -R scripts "$OUT/scripts"
# The server's own settings are never part of a release.
find "$OUT" -maxdepth 2 \( -name '.env*' -o -name '*.pem' \) -delete
echo "$ID" > "$OUT/RELEASE"
TARBALL="$(mktemp -d)/gbp-$ID.tgz"
tar -czf "$TARBALL" -C "$OUT" .
rm -rf "$OUT"
echo "   $(du -h "$TARBALL" | cut -f1)"

echo "== Upload"
REMOTE_TMP="/tmp/gbp-$ID.tgz"
scp "${SSH_OPTS[@]}" "$TARBALL" "$TARGET:$REMOTE_TMP"

echo "== Activate on the server"
ssh "${SSH_OPTS[@]}" "$TARGET" "sudo /srv/gbp/bin/activate-release.sh '$REMOTE_TMP' '$ID'"
echo "== Done: $ID"
