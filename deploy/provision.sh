#!/usr/bin/env bash
# One-time (and safe to re-run) setup of a fresh Ubuntu 24.04 server. Run it ON THE SERVER as root:
#
#   sudo APP_DOMAIN=reviews.example.com bash ~/deploy/provision.sh
#
# It installs Node 24, Caddy and the PostgreSQL client, creates the unprivileged `gbp` user and the folders, turns on the
# firewall, fail2ban and automatic security updates, adds swap, and installs the systemd units. It does NOT start the app:
# that needs a release (deploy.sh) and your settings in /etc/gbp-dashboard/env.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }
APP_DOMAIN=${APP_DOMAIN:?Set APP_DOMAIN, e.g. APP_DOMAIN=reviews.example.com}
PG_CLIENT_VERSION=${PG_CLIENT_VERSION:-17}   # must be >= the managed database's major version (pg_dump refuses an older client)
NODE_MAJOR=24
PRISMA_VERSION=7.10.1                        # keep equal to "prisma" in package.json
DOTENV_VERSION=18.0.5                        # keep equal to "dotenv" in package.json
HERE=$(cd "$(dirname "$0")" && pwd)

. /etc/os-release
[ "${VERSION_ID:-}" = "24.04" ] || { echo "Expected Ubuntu 24.04, found ${PRETTY_NAME:-unknown}." >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== System packages and updates"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades apt-transport-https debian-keyring debian-archive-keyring

echo "== Node.js $NODE_MAJOR"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node --version

echo "== Caddy"
if ! command -v caddy >/dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== PostgreSQL client $PG_CLIENT_VERSION (pg_dump, psql: backups and the data import)"
if ! command -v "/usr/lib/postgresql/$PG_CLIENT_VERSION/bin/pg_dump" >/dev/null 2>&1; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y "postgresql-client-$PG_CLIENT_VERSION"
fi
# Make the chosen version the default psql/pg_dump.
for tool in psql pg_dump pg_restore; do ln -sfn "/usr/lib/postgresql/$PG_CLIENT_VERSION/bin/$tool" "/usr/local/bin/$tool"; done

echo "== Swap (2 GB servers run out of memory during updates without it)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf && sysctl -p /etc/sysctl.d/99-swappiness.conf >/dev/null
fi

echo "== The app's user and folders"
id gbp >/dev/null 2>&1 || useradd --system --home-dir /srv/gbp/home --create-home --shell /usr/sbin/nologin gbp
install -d -o gbp -g gbp -m 755 /srv/gbp /srv/gbp/releases /srv/gbp/shared /srv/gbp/tools /srv/gbp/bin
install -d -o gbp -g gbp -m 750 /var/backups/gbp
install -d -o root -g gbp -m 750 /etc/gbp-dashboard
if [ ! -f /etc/gbp-dashboard/env ]; then
  install -o root -g gbp -m 640 "$HERE/env.production.example" /etc/gbp-dashboard/env
  echo "   Created /etc/gbp-dashboard/env from the template: EDIT IT before the first deploy."
fi

echo "== Migration tool (installed once, pinned; each release links to it)"
if [ ! -x /srv/gbp/tools/node_modules/.bin/prisma ]; then
  sudo -u gbp -H bash -c "cd /srv/gbp/tools && npm init -y >/dev/null && npm install --save-exact --no-audit --no-fund prisma@$PRISMA_VERSION dotenv@$DOTENV_VERSION"
fi

echo "== TLS certificate bundle for the managed database"
curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /etc/ssl/certs/rds-global-bundle.pem
chmod 644 /etc/ssl/certs/rds-global-bundle.pem

echo "== Scripts and systemd units"
install -o gbp -g gbp -m 755 "$HERE/bin/backup.sh" /srv/gbp/bin/backup.sh
install -m 755 "$HERE/bin/activate-release.sh" /srv/gbp/bin/activate-release.sh
install -m 755 "$HERE/bin/rollback.sh" /srv/gbp/bin/rollback.sh
install -o gbp -g gbp -m 755 "$HERE/bin/app-psql" /srv/gbp/bin/app-psql
for unit in "$HERE"/systemd/*; do install -m 644 "$unit" "/etc/systemd/system/$(basename "$unit")"; done
sed "s/APP_DOMAIN_PLACEHOLDER/$APP_DOMAIN/" "$HERE/Caddyfile" > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable gbp-dashboard.service gbp-dashboard-sync.timer gbp-dashboard-backup.timer
systemctl start gbp-dashboard-backup.timer
systemctl enable caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload-or-restart caddy

echo "== Firewall (22 SSH, 80 and 443 web; everything else closed)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== fail2ban (blocks repeated failed SSH logins)"
systemctl enable --now fail2ban

echo "== Automatic security updates (with a reboot at 20:00 UTC = 04:00 Manila only if one is needed)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
cat > /etc/apt/apt.conf.d/52gbp-unattended <<'APT'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "20:00";
APT
systemctl enable --now unattended-upgrades

echo
echo "Done. Next:"
echo "  1. Edit /etc/gbp-dashboard/env (database address, secrets, SMTP)."
echo "  2. From your computer: deploy/deploy.sh ubuntu@<server>"
