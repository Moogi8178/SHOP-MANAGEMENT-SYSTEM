# Ekambi Hardware — Stock & Till

A small full-stack app for a hardware store:

- **Register** (open to anyone with the link) — ring up sales, print receipts, stock goes down automatically.
- **Admin** (PIN-protected) — log restocks with cost/sell price and a photo, see inventory, and a profit dashboard.

Stack: React (Vite) frontend + Express API + PostgreSQL, all served from one Node web service — built to deploy on **Render**, with source on **GitHub**.

---

## 1. Push this to GitHub

```bash
cd ekambi-hardware
git init
git add .
git commit -m "Ekambi Hardware — initial version"
```

Create a new empty repo on GitHub (no README/license, you already have files), then:

```bash
git remote add origin https://github.com/<your-username>/ekambi-hardware.git
git branch -M main
git push -u origin main
```

## 2. Deploy on Render

The repo includes a `render.yaml` **Blueprint** that creates both the database and the web service in one go.

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect your GitHub account and pick the `ekambi-hardware` repo.
3. Render reads `render.yaml` and shows two resources: a free Postgres database (`ekambi-hardware-db`) and a web service (`ekambi-hardware`). Click **Apply**.
4. Once created, open the web service → **Environment** and set:
   - `ADMIN_PIN` — the PIN staff will use to unlock the Admin tab (pick something other than the default).
   - (`DATABASE_URL` and `JWT_SECRET` are filled in automatically by the blueprint.)
5. Render will run `npm run build` (builds the React app, installs server deps) then `npm start`. First deploy takes a few minutes.
6. Open the service's `.onrender.com` URL — that's your live store system.

**Note on the free tier:** Render's free Postgres database is fine for trying this out, but free databases expire after 30 days. For a store you actually run day to day, upgrade the database to a paid plan before that (Render will email you) so your product and sales history isn't lost. The free web service also spins down after inactivity — the first request after a quiet spell takes ~30s to wake up.

## 3. Set your admin PIN

Do this from the Render dashboard (`ADMIN_PIN` environment variable), not in code, so it isn't sitting in GitHub. Change it any time by editing the env var and redeploying.

---

## Local development

You'll need Node 18+ and either Docker or a local Postgres install.

```bash
# 1. Start a local database
docker compose up -d

# 2. Configure the server
cd server
cp .env.example .env
npm install

# 3. Configure and run the client (in a second terminal)
cd ../client
npm install
npm run dev
# client runs on http://localhost:5173 and proxies /api to the server

# 4. Run the server (in a first terminal, from /server)
node index.js
# API on http://localhost:3000
```

Visit `http://localhost:5173`. The default local admin PIN is `2580` (from `.env.example`) — change it in `server/.env`.

## How it's organized

```
ekambi-hardware/
  render.yaml          # Render Blueprint: web service + Postgres
  docker-compose.yml   # local Postgres for development
  server/               # Express API
    index.js
    db.js               # Postgres connection + schema
    auth.js              # admin PIN → JWT
    routes/
      products.js        # list + add/restock inventory (admin only to write)
      sales.js            # list sales, checkout (server-side price + stock check)
      admin.js             # PIN login
  client/                # React (Vite) frontend
    src/
      App.jsx             # Register + Admin UI
      api.js               # fetch wrappers
      styles.css
```

## A few things worth knowing

- The admin PIN gates the UI *and* the server route that adds stock — a person can't restock inventory without it, but it's still a single shared PIN, not per-user accounts. If you need individual employee logins or an audit trail of who rang up what, that's a natural next step.
- Checkout is done server-side: the API looks up current price and stock for each item, rejects the sale if there isn't enough stock, and updates everything in one database transaction — so it stays correct even with two tills selling at once.
- Product photos are compressed in the browser before upload to keep the database small.
