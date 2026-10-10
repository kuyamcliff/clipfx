<p><img src="frontend/public/static/brand/logo-large.png" alt="ClipFX logo" width="120"></p>

# ClipFX

**A free, nonprofit library where video editors and motion designers share assets with each other.**

Upload footage, transitions, overlays, LUTs, project templates, MOGRTs, sound effects, music, textures and 3D files, pick a clear license, and share one short link. Anyone can download, no account needed. No ads, no paywalls, no tracking.

## How it fits together

```
                 pages, forms, /api/*                     JSON
 Browser ───────────────────────────────▶  frontend/  ─────────────▶  backend/
   │                                      (Vercel)                   (Render)
   │                                                                  │  Postgres (Supabase)
   │   upload & download with signed URLs                             │  signs R2 URLs
   └──────────────────────────────────────▶  Cloudflare R2  ◀─────────┘  (thumbnails, hashing)
```

- **frontend/** runs on **Vercel**. It renders every page on the server, so share links unfurl with a thumbnail in Discord, X and iMessage. It handles HTML forms and forwards the browser's `/api/*` calls to the backend, so login cookies stay first-party on your domain.
- **backend/** runs on **Render**. It's a JSON API for accounts, assets, permissions and moderation. Its database is **Postgres** (e.g. Supabase) via `DATABASE_URL`; without it, SQLite is used for local development.
- **Cloudflare R2** stores every file. **Uploads and downloads go straight between the browser and R2.** File bytes never pass through Render or Vercel:
  1. The browser tells the API what it wants to upload (name, size). The API checks type, size and quota and answers with signed R2 URLs. Files over 64 MB get one URL per part.
  2. The browser uploads directly to R2: four parts at a time, each retried on failure, with live progress.
  3. The API checks the object in R2 (it exists, has exactly the approved size, and previews really are images or videos), then saves the asset.
  4. Downloads hit the API, which counts the download and redirects the browser to a short-lived signed R2 URL.
- In the background the API hashes each file, so files removed for copyright stay blocked, and runs ffmpeg for thumbnails, waveforms and web previews. ffmpeg reads the file from R2 over a signed URL; nothing is copied to the server's disk.

## Features

- Drag-and-drop uploads up to 2 GB (configurable), with resumable parts, progress, speed and ETA
- Upload with an account or anonymously (anonymous uploads get a private manage link to edit or delete)
- Private links: make a link expire after any number of minutes, hours or days, cap the number of downloads, or lock the file with a password
- Profiles with photos and social links (YouTube, TikTok, Instagram, X, Twitch, Vimeo, Behance, ArtStation, Discord)
- Sign in with Google or TikTok, or a username and password
- Open to search engines and AI assistants: sitemap index, `robots.txt` that welcomes AI crawlers, `/llms.txt`, and a public JSON API documented at `/developers`
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
TEST_DATABASE_URL=postgres://… npm --prefix backend test   # run the API tests against Postgres
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
      "AllowedHeaders": ["content-type", "content-disposition"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
   ```
   `ExposeHeaders: ETag` is required for big files (multipart uploads), and `content-disposition` must be an allowed header because the download filename is set during upload.
4. Recommended: add a lifecycle rule to **abort incomplete multipart uploads after 1 day**. The API also cleans up abandoned uploads hourly.
5. Optional: connect custom domains to the bucket (e.g. `image.`, `video.`, `audio.` and `download.` subdomains) and set `R2_PUBLIC_IMAGE_URL`, `R2_PUBLIC_VIDEO_URL`, `R2_PUBLIC_AUDIO_URL` and `R2_PUBLIC_DOWNLOAD_URL` on the API. Previews and downloads are then served from those domains through Cloudflare's cache. Uploads still use signed URLs on the S3 API. A custom domain makes objects readable by anyone who has the URL, so file keys are random, the download filename is stored on each object, and assets removed by moderators are moved to new keys so shared links stop working. Cloudflare may serve a cached copy until it expires; purge the cache for urgent takedowns.

### 2. Database (Supabase or any Postgres)

1. Create a Supabase project (or any Postgres 14+).
2. **Project Settings → Database → Connection string**, choose **Session pooler** (port 5432) and copy the URI with your password filled in. Use the session pooler, not the transaction pooler (6543).
3. That's `DATABASE_URL`. On first start the API creates its tables in a `clipfx` schema. Supabase doesn't expose that schema through its REST API, and row-level security is on, so only the API's own database user can read it.

### 3. Render (API)

1. **New → Blueprint**, pick this repo. Render reads `render.yaml` and creates `clipfx-api` (Docker, with ffmpeg). No disk is needed: the database is Postgres and files are in R2.
2. Fill in the prompted values: `DATABASE_URL`, `BASE_URL` (your Vercel URL; you can update it after step 4), `INTERNAL_SECRET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and optionally `DONATE_URL` and `CONTACT_EMAIL`.
3. After it deploys, open `https://<your-service>.onrender.com/healthz`. It should say `"storage":"r2","database":"postgres"`.

Free Render instances sleep after 15 minutes without traffic, so the first request after that takes up to a minute. The *Starter* plan stays awake.

### 4. Vercel (website)

1. **Add New → Project**, import this repo, and set **Root Directory** to `frontend`. Framework preset: *Other*. Leave the build settings empty; `frontend/vercel.json` handles them.
2. Environment variables: `BACKEND_URL` = your Render URL (no trailing slash) and `INTERNAL_SECRET` = the same value as on Render. Add `PUBLIC_URL` if you use a custom domain.
3. Deploy. Then set `BASE_URL` on Render to the final site address, and add the same address to the R2 CORS rule.

Keep Vercel's function region close to Render's (the blueprint uses Render's *Virginia* region; Vercel's default is *iad1*, Washington D.C.).

### Backups

Accounts, listings and reports live in Postgres. Supabase takes daily backups on paid plans; on the free plan, export with `pg_dump` now and then. Files in R2 are kept until an asset is deleted.

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
