# Deployment Guide — Examination Management System

How to stand up this app **from scratch on the college's own MySQL server**.

---

## 1. Architecture (what you're deploying)

```
                ┌────────────────────────── one server (or two) ──────────────────────────┐
  Browser ──►   nginx :80/:443                                                              │
                 ├── /            → static React build  (frontend/dist → /var/www/exam-portal)
                 └── /api/*       → Node/Express backend  (127.0.0.1:5001)  ──►  MySQL (college DB)
```

- **Backend**: Node 20 + Express, listens on `:5001`, reads config from `backend/.env`.
- **Frontend**: React built by Vite into static files. The app calls the API at the
  *relative* path `/api`, so nginx must serve the app and proxy `/api` on the **same origin**.
  Do that and CORS never enters the picture.
- **Database**: MySQL **8.0+** recommended (the schema uses the `utf8mb4_0900_ai_ci`
  collation — see step 2 for the MySQL 5.7 / MariaDB fallback).

---

## 2. Files in this repo that matter for deployment

| File | Purpose |
|------|---------|
| `backend/schema.sql` | **Complete DB structure** (18 tables + FKs/indexes), dumped from the working DB. Load this into the new server. |
| `backend/seed-admin.js` | One-shot script to create the first admin login (bcrypt-hashed). |
| `backend/.env.example` | Template for backend config. Copy to `backend/.env` and fill in. |
| `deploy/nginx.conf.example` | nginx site config (static app + `/api` proxy). |
| `deploy/exam-portal.service` | systemd unit to run/restart the backend. |

> ⚠️ **There is no separate "create tables" migration set** for the base tables — the
> incremental files in `backend/migrations/` only *add* later features. `schema.sql` is the
> single source of truth and already includes every migration. Use it; don't run the
> migration scripts on a fresh DB.

---

## 3. Prerequisites on the server

```bash
node -v      # need v18+ (developed on v20)
npm -v
mysql --version
nginx -v
```

Install whatever's missing (Node via NodeSource/nvm, MySQL Server, nginx).

---

## 4. Step-by-step

### Step 1 — Get the code onto the server
```bash
sudo mkdir -p /opt/exam-portal
# copy the repo here (git clone, scp, or rsync). End state:
#   /opt/exam-portal/backend
#   /opt/exam-portal/frontend
#   /opt/exam-portal/deploy
```

### Step 2 — Create the database and load the schema
```bash
# As a MySQL admin user:
mysql -u root -p -e "CREATE DATABASE exam_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Optionally create a dedicated app user:
mysql -u root -p -e "CREATE USER 'examapp'@'%' IDENTIFIED BY 'CHANGE_ME';
                     GRANT ALL PRIVILEGES ON exam_portal.* TO 'examapp'@'%';
                     FLUSH PRIVILEGES;"

# Load the structure:
mysql -u examapp -p exam_portal < /opt/exam-portal/backend/schema.sql
```

**MySQL 5.7 or MariaDB?** The dump uses `utf8mb4_0900_ai_ci` (8.0-only). Downgrade the
collation in one pass before loading:
```bash
sed 's/utf8mb4_0900_ai_ci/utf8mb4_unicode_ci/g' backend/schema.sql > backend/schema.portable.sql
mysql -u examapp -p exam_portal < backend/schema.portable.sql
```

Verify 18 tables landed:
```bash
mysql -u examapp -p exam_portal -e "SHOW TABLES;" | wc -l   # → 19 (header + 18)
```

### Step 3 — Configure the backend
```bash
cd /opt/exam-portal/backend
cp .env.example .env
```
Edit `.env`:
```
DB_HOST=<college db host or 127.0.0.1>
DB_PORT=3306
DB_USER=examapp
DB_PASSWORD=<the password you set>
DB_NAME=exam_portal
DB_SSL=false                 # ← false for a plain LAN MySQL; true only if it requires TLS
NODE_ENV=production
PORT=5001
JWT_SECRET=<output of: openssl rand -hex 32>
CORS_ORIGINS=https://exams.college.edu   # the public URL the browser uses
```
> **`DB_SSL`** is the single most common first-connect failure. Managed clouds (Aiven)
> need `true`; a college LAN MySQL almost always needs `false`.

### Step 4 — Install backend deps and create the first admin
```bash
cd /opt/exam-portal/backend
npm ci --omit=dev        # production install (skips test tooling)

node seed-admin.js --email admin@college.edu --password 'ChooseAStrongPass' --name "Exam Cell Admin"
# → ✅ Admin created: admin@college.edu
```
Re-running `seed-admin.js` with the same email just resets that admin's password (safe).

Smoke-test the API:
```bash
node server.js
# → "✅ Database Connected"  and  "Server running in production mode on port 5001"
# Ctrl-C once you see it connect; step 6 runs it as a service.
```

### Step 5 — Build the frontend and publish it
```bash
cd /opt/exam-portal/frontend
npm ci
npm run build                       # → frontend/dist

sudo mkdir -p /var/www/exam-portal
sudo cp -r dist/* /var/www/exam-portal/
```
> The app talks to `/api` (relative), so **no frontend env var is needed** as long as nginx
> proxies `/api` on the same origin (step 6). No rebuild required to point at the backend.

### Step 6 — nginx (serve app + proxy API)
```bash
sudo cp /opt/exam-portal/deploy/nginx.conf.example /etc/nginx/sites-available/exam-portal
sudo nano /etc/nginx/sites-available/exam-portal     # set server_name to the real host
sudo ln -s /etc/nginx/sites-available/exam-portal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
HTTPS (recommended): `sudo certbot --nginx -d exams.college.edu`.

### Step 7 — Run the backend as a service
```bash
sudo cp /opt/exam-portal/deploy/exam-portal.service /etc/systemd/system/
sudo nano /etc/systemd/system/exam-portal.service    # check User / WorkingDirectory / node path
sudo systemctl daemon-reload
sudo systemctl enable --now exam-portal
systemctl status exam-portal                         # should be "active (running)"
journalctl -u exam-portal -f                         # live logs
```

### Step 8 — Verify end to end
1. Open `https://exams.college.edu` → login page loads.
2. Log in with the admin from step 4.
3. Create the first **exam period / semester** in the UI (this also seeds the invigilator
   role targets automatically). From there: upload courses → enrollments → slots → schedule →
   seating → invigilators, exactly as in normal use.

---

## 5. Security must-fix (do this before going live)

`backend/.env` is **currently tracked in git** — that means the old Aiven credentials and JWT
secret are committed to history. Before deploying:

```bash
cd /opt/exam-portal
git rm --cached backend/.env        # stop tracking it (keeps the local file)
echo "backend/.env" >> .gitignore
git commit -m "Stop tracking backend/.env (contains secrets)"
```
Then **rotate the secrets**: set a brand-new `JWT_SECRET` and a new DB password on the
college server. Treat the old Aiven creds as compromised since they were in the repo.

`schema.sql`, `seed-admin.js`, and the `deploy/` files contain **no secrets** and are safe to commit.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Backend logs `❌ DB Error: ... handshake` / `ETIMEDOUT` on start | TLS mismatch. Set `DB_SSL=false` for LAN MySQL (or `true` if the server requires TLS). Also confirm host/port/firewall. |
| `mysql ... < schema.sql` fails on `utf8mb4_0900_ai_ci` | Server is MySQL 5.7 / MariaDB. Use the `sed` portability step in Step 2. |
| Login always fails | No admin row (run `seed-admin.js`), or wrong DB selected, or `JWT_SECRET` empty. |
| Browser console: blocked by CORS | App is served from a different origin than `/api`. Serve both via the same nginx (Step 6), or add the frontend origin to `CORS_ORIGINS`. |
| Upload returns **413** | Raise `client_max_body_size` in nginx (it's set to 15M in the example). |
| `502 Bad Gateway` on `/api` | Backend not running — `systemctl status exam-portal`, check `journalctl`. |
| Page reload gives 404 on a deep route | SPA fallback missing — ensure the nginx `try_files ... /index.html` block is present. |

---

## 7. Backups

Once live, schedule a regular dump of the college DB:
```bash
mysqldump -u examapp -p --single-transaction exam_portal > exam_portal_$(date +%F).sql
```
(Add `--ssl-mode=REQUIRED` only if the server enforces TLS.)
