# ClipFX

**A free, nonprofit library where video editors and motion designers share assets with each other.**

Upload footage, transitions, overlays, LUTs, project templates, MOGRTs, sound effects, music, textures and 3D files, pick a clear license, and share one short link. Anyone can download, no account needed. No ads, no paywalls, no tracking.

## Features

**Sharing**
- Drag-and-drop uploads up to 2 GB (configurable) with a live progress bar, speed and ETA
- A short share link for every asset (`/a/Xy7kQ2pD`), a copy button and a direct-download link
- Public or **unlisted** (only people with the link) visibility
- Upload a **new version** without breaking the link
- Open Graph / Twitter tags so links unfurl with a thumbnail or video in Discord, X, Slack and iMessage

**Media**
- Thumbnails are picked in the browser: scrub a slider to choose the video frame
- Server-side processing with ffmpeg (when installed): metadata (resolution, duration), thumbnails, waveform images for audio, and lightweight web previews for formats browsers can't play (ProRes MOV, MKV, MXF, AIFF…)
- Optional separate preview clip/image, useful for LUTs, presets and templates
- Hover-to-play previews on cards, range-request streaming

**Discovery**
- Full-text search (SQLite FTS5) with prefix matching
- Filters for category, software (AE, Premiere, Resolve, FCP, Blender…), file type, license, "commercial use OK" and "no credit required"
- Sort by newest, trending (downloads over the last 14 days) or most downloaded
- Tags, creator profiles, related assets, saved collections

**Licensing**
- CC0, a plain-English Free Use license, CC BY, CC BY-SA and CC BY-NC
- Each asset page shows what you can and can't do, plus a copy-ready attribution credit

**Trust & safety**
- Reports (copyright, leaked paid assets, malware, etc.) and a moderation dashboard
- Remove, restore or purge assets; block a file's SHA-256 so it can't be re-uploaded
- Ban users (hides their uploads), promote moderators, generate password reset links
- File-type allowlist (no executables/plugins), magic-byte checks on previews, downloads always served as attachments, sandboxed CSP on all media
- scrypt password hashing, CSRF protection (double-submit token + Origin check), SameSite cookies, strict CSP, rate limiting, per-user storage quotas

**Nonprofit pages**: About & mission, Donate, Community guidelines, Licenses explained, Terms, Privacy, Copyright/takedown policy.

Everything works without JavaScript. JS adds drag-and-drop, progress, frame picking and other conveniences.

## Quick start

Requires **Node.js 22.13+**. ffmpeg is optional but recommended.

```bash
npm install
npm run seed     # optional: demo content (login: demo / demo-password)
npm start        # http://localhost:3000
```

The **first account** you create becomes the admin/moderator.

```bash
npm test         # integration + unit tests
npm run dev      # restart on file changes
```

## Deploying

### Docker

```bash
docker build -t clipfx .
docker run -d -p 3000:3000 -v clipfx-data:/data \
  -e BASE_URL=https://clipfx.example.org -e TRUST_PROXY=1 \
  -e DONATE_URL=https://opencollective.com/your-project clipfx
```

The image includes ffmpeg. All state (SQLite database + files) lives in `/data`, so **back up that volume**.

### Behind a reverse proxy

Put it behind Caddy/nginx for HTTPS, set `TRUST_PROXY=1`, and allow large request bodies, e.g. nginx:

```nginx
client_max_body_size 2300m;
proxy_request_buffering off;
proxy_read_timeout 3h;
```

### Configuration

See [`.env.example`](.env.example). The important ones: `BASE_URL`, `DATA_DIR`, `TRUST_PROXY`, `DONATE_URL`, `CONTACT_EMAIL`, `MAX_UPLOAD_MB`, `USER_QUOTA_MB`, `ADMIN_USERNAMES`.

## Architecture

- **Express 5**, server-rendered HTML through a small auto-escaping template helper (`src/html.js`)
- **SQLite** via Node's built-in `node:sqlite`, so no native modules to compile
- Files on local disk under `DATA_DIR/uploads`, sharded by random key; original filenames are only used in `Content-Disposition`
- Background media queue (`src/media.js`) runs ffmpeg one job at a time and resumes after restarts

```
src/
  app.js          middleware, sessions, CSRF, wiring
  catalog.js      categories, software, licenses, accepted file types
  models.js       database queries
  media.js        ffmpeg processing queue
  routes/         pages, auth, browse, assets, account, admin
  views/          HTML templates
public/           CSS, JS, favicon
scripts/seed.js   demo content
test/             node:test suites
```

## Scaling notes

This runs as a single process, which is fine for a community site on one small VPS. When it outgrows that:
- put a CDN in front of `/m/*` and `/a/*/download` (responses are cacheable and support range requests)
- move uploads to S3-compatible object storage (swap `src/storage.js`)
- move rate limiting to Redis if you run several instances

## Contributing

Issues and PRs are welcome, especially for accessibility, translations and moderation tools. Please run `npm test` before opening a PR.

## License

Code: MIT. Assets uploaded to an instance belong to their creators and are licensed as shown on each asset page.
