# ClipFX

**A free, nonprofit library where video editors and motion designers share assets with each other.**

Upload footage, transitions, overlays, LUTs, project templates, MOGRTs, sound effects, music, textures and 3D files, pick a clear license, and share one short link. Anyone can download, no account needed. No ads, no paywalls, no tracking.

## How it fits together

```
                 pages, forms, /api/*                     JSON
 Browser ───────────────────────────────▶  frontend/  ─────────────▶  backend/
   │                                      (Vercel)                   (Render)
   │                                                                  │  SQLite on a disk
   │   upload & download with signed URLs                             │  signs R2 URLs
   └──────────────────────────────────────▶  Cloudflare R2  ◀─────────┘  (thumbnails, hashing)
```

- **frontend/** runs on **Vercel**. It renders every page on the server, so share links unfurl with a thumbnail in Discord, X and iMessage. It handles HTML forms and forwards the browser's `/api/*` calls to the backend, so login cookies stay first-party on your domain.
- **backend/** runs on **Render**. It's a JSON API for accounts, assets, permissions and moderation, with a SQLite database on a persistent disk.
- **Cloudflare R2** stores every file. **Uploads and downloads go straight between the browser and R2.** File bytes never pass through Render or Vercel:
  1. The browser tells the API what it wants to upload (name, size). The API checks type, size and quota and answers with signed R2 URLs. Files over 64 MB get one URL per part.
  2. The browser uploads directly to R2: four parts at a time, each retried on failure, with live progress.
  3. The API checks the object in R2 (it exists, has exactly the approved size, and previews really are images or videos), then saves the asset.
  4. Downloads hit the API, which counts the download and redirects the browser to a short-lived signed R2 URL.
- In the background the API hashes each file, so files removed for copyright stay blocked, and runs ffmpeg for thumbnails, waveforms and web previews. ffmpeg reads the file from R2 over a signed URL; nothing is copied to the server's disk.

## Features

- Drag-and-drop uploads up to 2 GB (configurable), with resumable parts, progress, speed and ETA
- A short share link for every asset, a direct-download link, and a public or **unlisted** option
- Upload a **new version** without breaking the link
- In-browser thumbnail frame picker; server-side previews for ProRes/MKV/AIFF and other formats browsers can't play
- Full-text search, filters (category, software, file type, license, "commercial use OK", "no credit"), trending
- Clear licenses (CC0, Free Use, CC BY, CC BY-SA, CC BY-NC), with a copy-ready credit line
- Saves, creator profiles, a dashboard with download counts and storage use
- Reports, a moderation queue, removal, file-hash blocking, bans, moderator roles and password reset links
- scrypt passwords, CSRF protection, strict CSP, rate limiting, per-user quotas, and no executable uploads

## Local development

Requires **Node.js 22.13+**. ffmpeg is optional but recommended.

```bash
npm run setup      # installs backend/ and frontend/
npm run seed       # optional demo content (login: demo / demo-password)
npm run dev        # website http://localhost:3000, API http://localhost:4000
npm test           # backend + frontend tests
```

Without R2 settings, the API stores files in `backend/data/uploads`. It uses the same signed-URL flow, so you're testing the real upload path. The first account you create becomes the admin.

To test against real R2 locally, put the `R2_*` variables from `backend/.env.example` in your environment before `npm run dev`.

## Deploying

You'll set up three things: an R2 bucket, the API on Render and the website on Vercel. Pick one long random string to use as `INTERNAL_SECRET` in both Render and Vercel (for example, the output of `openssl rand -hex 32`).

### 1. Cloudflare R2

1. In Cloudflare: **R2 → Create bucket**, e.g. `clipfx`. Keep it **private** (no public access needed).
2. **R2 → Manage API tokens → Create API token** with *Object Read & Write* on that bucket. Note the Access Key ID, Secret Access Key and your Account ID.
3. Allow browsers on your site to upload. Either run the script below (after deploying Vercel, so you know the URL):
   ```bash
   cd backend
   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=clipfx \
   CORS_ORIGINS=https://your-site.vercel.app npm run r2:cors
   ```
   or paste this into the bucket's **Settings → CORS policy**:
   ```json
   [{ "AllowedOrigins": ["https://your-site.vercel.app"], "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedHeaders": ["content-type"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
   `ExposeHeaders: ETag` is required for big files (multipart uploads).
4. Recommended: add a lifecycle rule to **abort incomplete multipart uploads after 1 day**. The API also cleans up abandoned uploads hourly.

### 2. Render (API)

1. **New → Blueprint**, pick this repo. Render reads `render.yaml` and creates `clipfx-api` (Docker, with ffmpeg) plus a 1 GB disk at `/data` for the database.
2. Fill in the prompted values: `BASE_URL` (your Vercel URL; you can update it after step 3), `INTERNAL_SECRET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and optionally `DONATE_URL` and `CONTACT_EMAIL`.
3. After it deploys, open `https://<your-service>.onrender.com/healthz`. It should say `"storage":"r2"`.

A persistent disk needs a paid instance: the blueprint uses *Starter*. Free instances have no disk (the database would be wiped on every deploy) and sleep when idle.

### 3. Vercel (website)

1. **Add New → Project**, import this repo, and set **Root Directory** to `frontend`. Framework preset: *Other*. Leave the build settings empty; `frontend/vercel.json` handles them.
2. Environment variables: `BACKEND_URL` = your Render URL (no trailing slash) and `INTERNAL_SECRET` = the same value as on Render. Add `PUBLIC_URL` if you use a custom domain.
3. Deploy. Then set `BASE_URL` on Render to the final site address, and add the same address to the R2 CORS rule.

Keep Vercel's function region close to Render's (the blueprint uses Render's *Virginia* region; Vercel's default is *iad1*, Washington D.C.).

### Backups

Everything except the files lives in one SQLite database on the Render disk (`/data/clipfx.db`). Render takes daily disk snapshots on paid plans; for extra safety, copy the file somewhere else periodically. Files in R2 are kept until an asset is deleted.

## Configuration

See `backend/.env.example` and `frontend/.env.example`. Notable settings: `MAX_UPLOAD_MB` (default 2048), `USER_QUOTA_MB` (default 25600), `MULTIPART_THRESHOLD_MB`, `ADMIN_USERNAMES`, `OPEN_SIGNUPS`, `MEDIA_PROCESSING`.

## Project layout

```
frontend/                    Vercel project (Root Directory: frontend)
  api/index.js               Vercel function entry
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
  src/models.js, db.js       SQLite schema and queries
  scripts/                   seed.js, r2-cors.js
  test/                      API tests (+ r2.test.js, opt-in against a real bucket)
  Dockerfile
render.yaml                  Render blueprint
dev.js                       runs both apps locally
```

## License

Code: MIT. Assets uploaded to an instance belong to their creators and are licensed as shown on each asset page.
