<p><img src="frontend/public/static/brand/logo-large.png" alt="ClipFX logo" width="120"></p>

# ClipFX

**Publish, distribute and track your software.**

Developers upload apps, plugins, libraries, templates and assets, pick a license, and get their own page at `yourname.clipfx.me` with direct product links and analytics. Downloads need no account. API keys and an MCP server let scripts, CI and AI agents publish for you.

## How it fits together

```
                   pages, forms, /api/*                     JSON                 SQL over HTTPS
 Browser ──────────────────────────────▶  frontend/  ─────────────▶  backend/  ───────────────▶  workers/db ──▶ D1
 (www.clipfx.me, name.clipfx.me)        (Cloudflare Worker)         (Render)                   (Cloudflare Worker)
   │                                         │ page views                │ signs R2 URLs
   │                                         ▼                           │ (thumbnails, hashing)
   │                              Workers Analytics Engine               │
   │   upload & download with signed URLs                                ▼
   └──────────────────────────────────────────────────────────▶  Cloudflare R2
```

- **frontend/** runs on **Cloudflare Workers** (`frontend/worker.js`, `frontend/wrangler.jsonc`). It renders every page on the server, so share links unfurl with a thumbnail, handles HTML forms, forwards the browser's `/api/*` calls to the backend (login cookies stay first-party), and serves developer pages on `<username>.PAGES_DOMAIN`. Static files are served by Workers Static Assets. Page and product views go to Workers Analytics Engine. A cron trigger keeps the API warm.
- **backend/** runs on **Render** (Docker, with ffmpeg). It's a JSON API for accounts, products, developer pages, permissions and moderation. Its database is **Cloudflare D1**, reached through the small `workers/db` gateway Worker (`D1_URL` + `D1_SECRET`). Postgres (`DATABASE_URL`) and SQLite (local development) still work.
- **Cloudflare R2** stores every file. **Uploads and downloads go straight between the browser and R2.** File bytes never pass through Render or the website Worker:
  1. The browser tells the API what it wants to upload (name, size). The API checks type, size and quota and answers with signed R2 URLs. Files over 64 MB get one URL per part.
  2. The browser uploads directly to R2: four parts at a time, each retried on failure, with live progress.
  3. The API checks the object in R2 (it exists, has exactly the approved size, and previews really are images or videos), then saves the asset.
  4. Downloads hit the API, which counts the download and redirects the browser to a short-lived signed R2 URL.
- In the background the API hashes each file, so files removed for copyright stay blocked, and runs ffmpeg for thumbnails, waveforms and web previews. ffmpeg reads the file from R2 over a signed URL; nothing is copied to the server's disk.

## Features

- Drag-and-drop uploads up to 2 GB (configurable), with resumable parts, progress, speed and ETA
- Upload with an account or anonymously (anonymous uploads get a private manage link to edit or delete)
- Private links: make a link expire after any number of minutes, hours or days, cap the number of downloads, or lock the file with a password
- Developer pages on `yourname.clipfx.me`: headline, about, accent color, theme, layout, banner, featured products, links and a call-to-action button, plus a direct link for every product
- Analytics: page views, product views and downloads per day, referrers, countries, devices and top products (Workers Analytics Engine; no cookies or IPs stored)
- Profiles with photos and social links (GitHub, GitLab, LinkedIn, YouTube, X, Discord and more)
- Sign in with GitHub or Google, or a username and password
- Open to search engines and AI assistants: sitemap index, `robots.txt` that welcomes AI crawlers, `/llms.txt`, and a public JSON API documented at `/developers`
- A short share link for every asset, a direct-download link, and a public or **unlisted** option
- Upload a **new version** without breaking the link
- In-browser thumbnail frame picker; server-side previews for ProRes/MKV/AIFF and other formats browsers can't play
- Full-text search, filters (category, software, file type, license, "commercial use OK", "no credit"), trending
- Clear licenses (MIT, Apache 2.0, GPL 3.0, BSD, CC0, CC BY and others, or proprietary), with a copy-ready credit line, and a SHA-256 for every file
- Saves, a dashboard with download counts and storage use, API keys with scoped permissions and an MCP server (OAuth or keys)
- Reports, a moderation queue, removal, file-hash blocking, bans, moderator roles and password reset links
- scrypt passwords, CSRF protection, strict CSP, rate limiting, per-user quotas, and no executable uploads

## Local development

Requires **Node.js 22.13+**. ffmpeg is optional but recommended.

```bash
npm run setup      # installs backend/ and frontend/
npm run seed       # optional demo content (login: demo / demo-password)
npm run dev        # website http://localhost:3000, API http://localhost:4000
npm test           # backend + frontend tests
TEST_DATABASE_URL=postgres://… npm --prefix backend test   # run the API tests against Postgres
```

Without R2 settings, the API stores files in `backend/data/uploads`. It uses the same signed-URL flow, so you're testing the real upload path. The first account you create becomes the admin.

To test against real R2 locally, put the `R2_*` variables from `backend/.env.example` in your environment before `npm run dev`.

## Deploying

You'll set up four things: an R2 bucket, a D1 database, the API on Render and the website on Cloudflare Workers. Pick one long random string to use as `INTERNAL_SECRET` on both Render and the website Worker (for example, the output of `openssl rand -hex 32`).

### 1. Cloudflare R2

1. In Cloudflare: **R2 → Create bucket**, e.g. `clipfx`. Keep it **private** (no public access needed).
2. **R2 → Manage API tokens → Create API token** with *Object Read & Write* on that bucket. Note the Access Key ID, Secret Access Key and your Account ID.
3. Allow browsers on your site to upload. Either run the script below (after deploying the website, so you know the URL):
   ```bash
   cd backend
   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=clipfx \
   CORS_ORIGINS=https://your-site.vercel.app npm run r2:cors
   ```
   or paste this into the bucket's **Settings → CORS policy**:
   ```json
   [{ "AllowedOrigins": ["https://your-site.vercel.app"], "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedHeaders": ["content-type", "content-disposition"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
   `ExposeHeaders: ETag` is required for big files (multipart uploads), and `content-disposition` must be an allowed header because the download filename is set during upload.
4. Recommended: add a lifecycle rule to **abort incomplete multipart uploads after 1 day**. The API also cleans up abandoned uploads hourly.
5. Optional: connect custom domains to the bucket (e.g. `image.`, `video.`, `audio.` and `download.` subdomains) and set `R2_PUBLIC_IMAGE_URL`, `R2_PUBLIC_VIDEO_URL`, `R2_PUBLIC_AUDIO_URL` and `R2_PUBLIC_DOWNLOAD_URL` on the API. Previews and downloads are then served from those domains through Cloudflare's cache. Uploads still use signed URLs on the S3 API. A custom domain makes objects readable by anyone who has the URL, so file keys are random, the download filename is stored on each object, and assets removed by moderators are moved to new keys so shared links stop working. Cloudflare may serve a cached copy until it expires; purge the cache for urgent takedowns.

### 2. Database (Cloudflare D1)

1. Create the database: `npx wrangler d1 create clipfx` and put its id in `workers/db/wrangler.jsonc`.
2. Deploy the gateway: `npm run deploy:db`, then `npx wrangler secret put DB_SECRET -c workers/db/wrangler.jsonc` with a long random value.
3. On Render, set `D1_URL` to the gateway's URL and `D1_SECRET` to the same value. The API creates its tables on first start.

Moving from Postgres: `workers/migrate` is a one-off Worker that copies every table from Postgres into D1 through Hyperdrive.

### 3. Render (API)

1. **New → Blueprint**, pick this repo. Render reads `render.yaml` and creates `clipfx-api` (Docker, with ffmpeg). No disk is needed.
2. Fill in the prompted values: `D1_URL`, `D1_SECRET`, `BASE_URL` (e.g. `https://www.clipfx.me`), `INTERNAL_SECRET`, the `R2_*` values, and optionally `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (callback `BASE_URL/auth/github/callback`), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and `CONTACT_EMAIL`. `PAGES_DOMAIN` turns on developer pages.
3. After it deploys, open `https://<your-service>.onrender.com/healthz`. It should say `"storage":"r2","database":"d1"`.

### 4. Cloudflare Workers (website)

1. Edit the `vars` in `frontend/wrangler.jsonc`: `BACKEND_URL` (your Render URL), `PUBLIC_URL`, `PAGES_DOMAIN` and `CF_ACCOUNT_ID`.
2. Secrets: `INTERNAL_SECRET` (same as Render) and `ANALYTICS_TOKEN` (a Cloudflare API token with *Account Analytics: Read*, for the charts). Enable Analytics Engine once in the dashboard (Workers → Analytics Engine).
3. `npm run deploy:web`. Then route `www.<domain>/*`, `<domain>/*` and `*.<domain>/*` to the `clipfx-web` Worker, with a proxied wildcard DNS record (`*`) so developer pages resolve. Exclude hostnames that belong to other services (API, R2 custom domains).

The Free Workers plan limits each request to 10 ms of CPU; server-rendered pages use 10–30 ms, so production should be on Workers Paid.

### Backups

Accounts, listings and reports live in D1, which keeps 30 days of point-in-time history (Time Travel: `npx wrangler d1 time-travel restore clipfx --timestamp=...`). Export with `npx wrangler d1 export clipfx --output=backup.sql` now and then. Files in R2 are kept until an asset is deleted.

## Configuration

See `backend/.env.example` and `frontend/.env.example`. Notable settings: `MAX_UPLOAD_MB` (default 2048), `USER_QUOTA_MB` (default 25600), `MULTIPART_THRESHOLD_MB`, `ADMIN_USERNAMES`, `OPEN_SIGNUPS`, `MEDIA_PROCESSING`.

## Project layout

```
frontend/                    Website: Cloudflare Worker (worker.js, wrangler.jsonc); server.js for Node
  api/index.js               Legacy Vercel entry (kept until the move to Workers is complete)
  src/app.js                 page routes, form handling, /api proxy
  src/backend.js             calls to the API + streaming proxy
  src/html.js, decorate.js   templating and display helpers
  views/                     HTML templates
  public/static/             CSS, browser JS (incl. the direct-to-R2 uploader), favicon
  vercel.json
backend/                     Render service (Docker)
  src/app.js                 API wiring, sessions, CSRF, cleanup
  src/routes/                meta, auth, uploads, assets, users, admin, blob (local storage only)
  src/storage/               r2.js (production) and local.js (development), one interface
  src/media.js               hashing + ffmpeg jobs
  src/models.js              queries (shared by both databases)
  src/db/                    postgres.js (production) and sqlite.js (development), one interface
  scripts/                   seed.js, r2-cors.js
  test/                      API tests (+ r2.test.js, opt-in against a real bucket)
  Dockerfile
render.yaml                  Render blueprint
dev.js                       runs both apps locally
```

## License

Code: MIT. Assets uploaded to an instance belong to their creators and are licensed as shown on each asset page.
