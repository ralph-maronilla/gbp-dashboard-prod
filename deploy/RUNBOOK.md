# Deployment runbook (AWS Lightsail)

What you end up with:

```
people's browsers ──HTTPS──▶ Caddy (port 443, certificates automatic)
                               │  sets X-Real-IP
                               ▼
                         Node app on 127.0.0.1:3000   ◀── systemd timer calls /api/cron/sync every 15 min
                         (systemd service "gbp-dashboard")
                               │  TLS, private network
                               ▼
                         Lightsail managed PostgreSQL
```

One Lightsail **instance** (Ubuntu 24.04, 2 GB) runs Caddy and the app. A Lightsail **managed database** holds the data and keeps its own backups.
The app is built on your computer and copied over; the server never builds anything.

> The Lightsail console changes its labels now and then. The steps below name the things to look for; if a button has moved, the
> intent is the same. Nothing here depends on a specific screen.

Every command marked **laptop** runs on your computer, in the project folder. Every command marked **server** runs over SSH on the instance.

---

## 0. Before you start

| You need | Why | If you do not have it yet |
|---|---|---|
| An AWS account with Lightsail | hosting | aws.amazon.com |
| A **domain name** you can edit DNS for (for example `reviews.yourcompany.com`) | HTTPS certificates need a name | For a test run you can use a free name that points at your IP: `1-2-3-4.sslip.io` for the IP `1.2.3.4` (Caddy gets a real certificate for it). Use a real domain before real users. |
| **SMTP credentials** (host, port, user, password, a "from" address) | confirmation and password-reset emails | Any provider: Amazon SES, Mailgun, Brevo, your company's mail server. Without it nobody can sign up or reset a password. |
| Your **Serper API key** | extraction | serper.dev |
| The **old Supabase connection string** (the session-pooler / direct one, port 5432) | the one-time data copy | Supabase → Connect. Read access is enough. |
| Node 24 and git on your computer; `ssh`, `scp` | building and shipping | `node --version` should say v24 |

Rotate the keys you pasted into chat or files earlier (Serper, Supabase, Upstash) once everything is moved. Make **new** secrets for production; do not reuse your local ones.

---

## 1. Create the Lightsail resources

Pick **one region** for both resources (they must be together). Choose the one closest to most of your users.

### 1.1 SSH key
Lightsail → Account → **SSH keys**. Download the default key for your region (a `.pem` file) and keep it safe; fix its permissions:

```bash
chmod 600 ~/Downloads/LightsailDefaultKey-REGION.pem        # laptop
```

### 1.2 The instance
Lightsail → **Create instance** → Linux/Unix → **OS only → Ubuntu 24.04 LTS** → the **2 GB RAM** plan → name it `gbp-dashboard` → Create.

### 1.3 A fixed IP address
Instance → **Networking** → **Create static IP** → attach it to the instance. (Without this the address changes when the instance is stopped.) Write the IP down.

### 1.4 Firewall
Same Networking tab → **IPv4 Firewall**:
- **SSH (22):** change "Any IPv4 address" to **your own IP** (or your office's). Lightsail's browser-based SSH needs the default; skip that button and use `ssh` from your computer.
- **HTTP (80)** and **HTTPS (443):** both open to everyone (add a **Custom TCP 443** rule if HTTPS is not in the list). Port 80 is needed for the certificate.
- If the IPv6 firewall shows rules, mirror the same three.

### 1.5 The database
Lightsail → **Databases** → **Create database** → **PostgreSQL**, the newest major version offered (the app needs 16 or newer), same region, a plan with at least 1 GB RAM, **daily automatic backups on** (the default). Choose a master username (the default `dbmasteruser` is fine) and a long password. Create it, then open it:

- **Connect tab:** copy the **endpoint** (a long `ls-….rds.amazonaws.com` name) and port 5432. The database name is `postgres` unless you chose another.
- **Networking tab:** keep **Public mode OFF**. (The instance reaches it privately.)
- Make sure **VPC peering** is on for the region: Lightsail → Account → **Advanced** → *VPC peering* → enable for your region. Without it the instance cannot see a private database.

Write down: endpoint, port, username, password, database name, **and its PostgreSQL major version** (you will need it in 3.1).

### 1.6 DNS
At your domain provider add an **A record**: `reviews.yourcompany.com` → the static IP. Check it with `dig +short reviews.yourcompany.com`. (Skip if you are using an `sslip.io` name.)

---

## 2. Check you can reach the server

```bash
ssh -i ~/Downloads/LightsailDefaultKey-REGION.pem ubuntu@<static-ip>      # laptop
```

You should land at a prompt. Leave it for a moment and exit; the next step copies files first.

---

## 3. Provision the server (once)

### 3.1 Copy the setup files over and run them
```bash
scp -i KEY.pem -r deploy ubuntu@<static-ip>:~/                              # laptop
ssh -i KEY.pem ubuntu@<static-ip>                                           # laptop
sudo APP_DOMAIN=reviews.yourcompany.com PG_CLIENT_VERSION=17 bash ~/deploy/provision.sh     # server
```

`PG_CLIENT_VERSION` must be **the same as or newer than** the database's major version (from 1.5). It installs Node 24, Caddy, the database tools, a swap file, the firewall (ufw), fail2ban and automatic security updates, creates the unprivileged `gbp` user and the folders under `/srv/gbp`, and installs the service and timers. It is safe to run again.

### 3.2 Fill in the settings
```bash
sudo nano /etc/gbp-dashboard/env                                           # server
```

Fill in every line that is not commented out (the file explains each one). Generate the two secrets on the server:

```bash
openssl rand -base64 32      # → BETTER_AUTH_SECRET
openssl rand -hex 32         # → CRON_SECRET
```

- `APP_URL` is the public address with `https://` and no trailing slash.
- Put the database password in the two database URLs. **Special characters in the password must be percent-encoded** (`@` → `%40`, `/` → `%2F`, `:` → `%3A`, `#` → `%23`, `?` → `%3F`).
- Do not add `?sslmode=` to those URLs: the app verifies TLS with `DATABASE_CA_FILE`.
- Save with Ctrl+O, Enter, Ctrl+X. The file stays readable only by root and the app.

### 3.3 Check the server can reach the database
```bash
sudo -u gbp /srv/gbp/bin/app-psql -c "select version()"          # server
```

`app-psql` is a small helper that connects to the database using the address, password and TLS settings from that file. You should see the PostgreSQL version. If it hangs: VPC peering (1.5) or the endpoint. If it says "password authentication failed": the password or its encoding. If it says "certificate verify failed": the endpoint does not match what you typed.

---

## 4. First deploy

From your computer, in the project folder:

```bash
SSH_KEY=~/Downloads/LightsailDefaultKey-REGION.pem deploy/deploy.sh ubuntu@<static-ip>      # laptop
```

It runs the checks, builds, uploads, then **on the server**: unpacks the release, creates the database structure (`prisma migrate deploy`), switches over, restarts the app and waits until `/api/health` answers. If the new release does not become healthy within 45 seconds it puts the previous one back by itself.

Then verify:

```bash
curl -s https://reviews.yourcompany.com/api/health            # → {"data":{"status":"ok"}}
```

Open `https://reviews.yourcompany.com` in a browser: you should see the sign-in page with a valid padlock. (The first load can take a few seconds while Caddy gets its certificate.)

On the server, these should all look healthy:
```bash
systemctl status gbp-dashboard caddy                     # active (running)
systemctl list-timers 'gbp-dashboard-*'                  # the sync timer (every 15 min) and the backup timer
```

---

## 5. Move your data (the cutover)

Do a **rehearsal first** (this section, with a note to yourself that you will redo it), then the real one when you are ready. Nothing in the old app is changed by this: it is only read.

### 5.1 Start from an empty database
After step 4 the database has the structure and one blank settings row, nothing else. If you tried sign-ups on the new server, wipe them:

```bash
sudo systemctl stop gbp-dashboard                                                         # server
sudo -u gbp /srv/gbp/bin/app-psql -c "drop schema public cascade; drop schema if exists app cascade; create schema public;"
sudo -u gbp -H bash -c 'set -a; . /etc/gbp-dashboard/env; set +a; cd /srv/gbp/current/migrate && DIRECT_URL=${DIRECT_URL:-$DATABASE_URL} ./node_modules/.bin/prisma migrate deploy'
```

### 5.2 For the real cutover only: freeze the old app
Tell people there is a short window. In the old app, switch **automatic extraction off** and ask people not to extract or approve anyone until you say so. (Anything done in the old app after the copy is not carried over.)

### 5.3 Copy
```bash
sudo -u gbp -H bash -c '
  set -a; . /etc/gbp-dashboard/env; set +a
  SOURCE="postgresql://postgres.PROJECT:OLD-DB-PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
  TARGET="${DATABASE_URL}?sslmode=verify-full&sslrootcert=${DATABASE_CA_FILE}"
  /srv/gbp/current/scripts/import-supabase.sh "$SOURCE" "$TARGET" auth
'                                                                                         # server
```

Use the old project's **session-pooler or direct** string (port 5432), not the transaction pooler (6543): `pg_dump` needs a session. The script refuses to run on a non-empty database, copies everything in one transaction (all or nothing), and ends by **comparing row counts** with the source. Every line must say `ok`; if any says `MISMATCH` it exits with an error and you should not use that database: send me the output.

### 5.4 Start and check
```bash
sudo systemctl start gbp-dashboard                                                        # server
curl -s https://reviews.yourcompany.com/api/health
```

Sign in with an existing account and its **existing password** (the password hashes were copied over unchanged). Check: the Overview numbers match the old app, an admin sees the Users page, a limited user sees only their locations.
Everyone has to sign in again once (sessions do not carry over).

### 5.5 Switch people over
- Same domain as the old app? Change its DNS A record to the new static IP (lower the TTL a day earlier so it switches quickly).
- New domain? Tell people the new address.
- Keep the old Vercel/Supabase project **untouched** for at least two weeks: it is your way back. To go back, point DNS at the old app again and switch its automatic extraction back on. (Anything done on the new server in between would not be in the old one.)
- Delete the old project only after you have used the new server for a while and have a fresh backup (section 7).

---

## 6. Go-live checklist

- [ ] `https://…/api/health` says ok and the padlock is valid.
- [ ] Sign-up on the new server sends a confirmation email that arrives, the link works, and an admin can approve the new account.
- [ ] "Forgot password" sends an email and the link lets you choose a new password.
- [ ] A limited user sees only their own locations; Users page works for admins.
- [ ] Extract one location: reviews arrive (this spends real Serper credits).
- [ ] Automatic extraction: the Extraction page shows **Scheduler connected** within 15 minutes of switching it on.
- [ ] A backup exists: `sudo -u gbp /srv/gbp/bin/backup.sh` and `ls -lh /var/backups/gbp`.
- [ ] You can roll back (section 7), and you have tried `journalctl -u gbp-dashboard -n 50`.
- [ ] An uptime check is pointed at `https://…/api/health` (UptimeRobot, Better Stack, or Lightsail's own alarms).
- [ ] The old keys (Serper, Supabase, Upstash) are rotated.

---

## 7. Day-to-day

| I want to… | Do this |
|---|---|
| **Deploy a change** | commit it, then `SSH_KEY=… deploy/deploy.sh ubuntu@<ip>` (laptop) |
| **Deploy from scratch** (a build looks wrong) | `CLEAN=1 SSH_KEY=… deploy/deploy.sh ubuntu@<ip>` reinstalls the packages and discards the build cache. Normal deploys reuse both, which is what keeps them quick. |
| **Update the server's own files** (anything in `deploy/` changed: Caddyfile, `bin/`, `systemd/`) | copy `deploy/` to the server and run `provision.sh` again (section 3); it is safe to repeat. |
| **Roll back** | `sudo /srv/gbp/bin/rollback.sh` (server) goes to the previous release; `sudo /srv/gbp/bin/rollback.sh <release-id>` to a specific one (`ls -1t /srv/gbp/releases`). Database changes are **not** undone, so keep migrations backward compatible. |
| **See the app's log** | `sudo journalctl -u gbp-dashboard -f` |
| **See web traffic / certificate issues** | `sudo journalctl -u caddy -n 100` |
| **Check the extraction timer** | `systemctl list-timers 'gbp-dashboard-*'` and `sudo journalctl -u gbp-dashboard-sync -n 20` |
| **Change a setting or secret** | `sudo nano /etc/gbp-dashboard/env` then `sudo systemctl restart gbp-dashboard` (changing `BETTER_AUTH_SECRET` signs everyone out) |
| **Restart** | `sudo systemctl restart gbp-dashboard` |
| **Back up now** | `sudo -u gbp /srv/gbp/bin/backup.sh` (also runs daily; 14 days are kept in `/var/backups/gbp`) |
| **Restore a backup** | see below |
| **Make someone an admin** | they sign up and confirm their email; then `sudo -u gbp /srv/gbp/bin/app-psql -c "update public.profiles set role = 'admin', status = 'approved', approved_at = now() where email = 'you@example.com'"` |
| **Update Ubuntu** | automatic for security fixes (it reboots at 04:00 Manila only if one needs it). For the rest: `sudo apt update && sudo apt upgrade` now and then. |

### Google Sheet mirror
The app can keep a copy of every review in a Google Sheet: a first tab **All reviews** and **one tab per location**, each with the 18 export columns. It is off until you set it up.

**Set it up (once, about 10 minutes):**
1. Go to <https://console.cloud.google.com>, create a project (any name), then open **APIs & Services → Library**, find **Google Sheets API** and click **Enable**.
2. Open **IAM & Admin → Service Accounts → Create service account**. Give it a name (for example `reviews-sheet`) and finish; it needs no roles. This is a robot Google account the app signs in as.
3. Open the new service account, **Keys → Add key → Create new key → JSON**. A file downloads. Keep it private: it is a password.
4. Create the Google Sheet (or open an existing one), click **Share**, paste the service account's email (it ends in `iam.gserviceaccount.com`, and is `client_email` in the file) and make it an **Editor**.
5. On the server, add to `/etc/gbp-dashboard/env`:
   ```
   GOOGLE_SHEETS_SPREADSHEET_ID=<the long id between /d/ and /edit in the sheet's address>
   GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email from the file>
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="<private_key from the file, exactly as written there, on one line, with its \n>"
   ```
6. Restart the app (`sudo systemctl restart gbp-dashboard`), open **Extraction** as an admin and press **Sync now** in the side panel. The first sync creates the tabs.

**How it behaves:**
- After an extraction saves reviews, or a location is added, edited or deleted, the panel shows **Update pending**. The 15-minute timer then writes the sheet once, after any running extraction has finished. **Sync now** writes it at once.
- The app rewrites its own tabs completely on every sync. Do not type in them: notes, formulas, charts and pivot tables belong in tabs you add yourself (they can refer to the app's tabs). The app never changes or deletes a tab it did not create.
- Tabs are named after the locations and follow renames. A deleted location's tab is removed at the next sync. If you delete one of the app's tabs by hand, it comes back at the next sync.
- Everyone the sheet is shared with can read reviewer names and comments. Who that is, is decided in Google, not in the app.

**If it shows an error:**
- *"Google refused access…"*: the sheet is not shared with the service account as Editor, or the Google Sheets API is not enabled in the project.
- *"The spreadsheet was not found…"*: `GOOGLE_SHEETS_SPREADSHEET_ID` is wrong.
- *"Google did not accept the service account…"* or *"…key could not be read"*: the email or the private key is wrong. The key must keep its `\n` and stand in double quotes.
- To replace a leaked key: create a new key for the service account, put it in the env file, restart, then delete the old key in Google Cloud.

### Restoring a backup
The managed database also keeps its own daily backups and lets you take snapshots in the Lightsail console (Databases → your database → **Snapshots** / restore to a new database). That is the main safety net: take a manual snapshot **before any risky change**. To restore from the server's own dump files instead:

```bash
sudo systemctl stop gbp-dashboard
sudo -u gbp /srv/gbp/bin/app-psql -c "drop schema public cascade; drop schema if exists app cascade; create schema public;"
sudo -u gbp -H bash -c 'set -a; . /etc/gbp-dashboard/env; set +a
  pg_restore --no-owner --no-privileges -d "${DATABASE_URL}?sslmode=verify-full&sslrootcert=${DATABASE_CA_FILE}" /var/backups/gbp/gbp-YYYY-MM-DD-HHMM.dump'
sudo systemctl start gbp-dashboard
```

---

## 8. When something is wrong

| Symptom | Likely cause and fix |
|---|---|
| Browser: certificate warning or no HTTPS | DNS not pointing at the static IP yet, or port 80/443 closed in the Lightsail firewall. `sudo journalctl -u caddy -n 50` says what Caddy is waiting for. |
| `502 Bad Gateway` | the app is not running: `systemctl status gbp-dashboard`, `journalctl -u gbp-dashboard -n 80`. |
| Deploy ends with "did not become healthy" | it already rolled back; the log shows why (usually a wrong value in `/etc/gbp-dashboard/env`: `Missing environment variable …`). |
| Log: `Missing environment variable: APP_URL` / `BETTER_AUTH_SECRET` | not set (or still blank) in `/etc/gbp-dashboard/env`. |
| Log: `self-signed certificate` / `unable to verify` to the database | `DATABASE_CA_FILE` missing or wrong; rerun `provision.sh` to fetch the bundle. |
| Nobody gets emails | SMTP values wrong (`journalctl -u gbp-dashboard \| grep mail`); also check the sender address is allowed by your provider and check spam. |
| "Scheduler not connected" | `systemctl list-timers` should list `gbp-dashboard-sync`; `journalctl -u gbp-dashboard-sync` shows the last call and any error (401 = `CRON_SECRET` differs between the file and what the app was started with: restart it). |
| Everyone suddenly gets "Too many requests" | the app is not seeing real client addresses: Caddy must be the only way in and `APP_URL`/Caddyfile unchanged. `curl -i https://…/api/health` should work; the app only listens on 127.0.0.1. |
| Out of disk | `df -h`; old releases are pruned automatically (5 kept), dumps after 14 days. |
| Server unreachable | Lightsail console → the instance → restart; the app and Caddy start by themselves. |

---

## 9. What this does not do (yet)

- It is a **single server**: a reboot or an update causes a few seconds of downtime. That is a deliberate trade for simplicity at this size.
- No CDN or WAF. The app already sends strict security headers and rate-limits sign-in.
- Load testing (k6) and a rehearsal at higher volume are the next step in the plan; do them before announcing to a large group.
