'use strict';
// Talking to the ClipFX API: server-side calls for rendering pages, and a streaming proxy for
// the browser's own /api requests (so cookies stay first-party on this domain).
const { Readable } = require('node:stream');

const FORWARD_REQUEST_HEADERS = ['accept', 'content-type', 'content-length', 'x-csrf-token', 'origin', 'range', 'user-agent', 'if-none-match', 'if-modified-since'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'content-length', 'content-range', 'content-disposition', 'accept-ranges', 'cache-control', 'etag', 'last-modified', 'location', 'retry-after', 'x-robots-tag', 'content-security-policy'];

function clientIp(req) {
  const real = req.get('x-real-ip');
  if (real) return real;
  const xff = req.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function createBackend(config, { log = console } = {}) {
  const base = config.backendUrl;

  const commonHeaders = (req) => ({
    'x-internal-secret': config.internalSecret,
    'x-client-ip': clientIp(req),
    'x-forwarded-host': req.get('host'),
    'x-forwarded-proto': req.protocol,
  });

  const cookieHeader = (req) => Object.entries(req.cookies || {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');

  // Server-side call. Forwards the visitor's cookies and the CSRF token the frontend already checked.
  async function call(req, method, path, body) {
    const headers = { ...commonHeaders(req), accept: 'application/json', cookie: cookieHeader(req) };
    if (req.cookies && req.cookies.csrf) headers['x-csrf-token'] = req.cookies.csrf;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let r;
    try {
      r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    } catch (err) {
      log.error(`[backend] ${method} ${path} failed: ${err.message}`);
      return { status: 503, data: { ok: false, error: 'The service is unavailable right now. Please try again in a minute.' }, setCookies: [] };
    }
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    return { status: r.status, data: data || { ok: r.ok }, setCookies: r.headers.getSetCookie(), location: r.headers.get('location') };
  }

  // Passes Set-Cookie headers (login, logout) from the API through to the browser.
  const passCookies = (res, result) => { for (const c of result.setCookies || []) res.append('Set-Cookie', c); };

  // Streaming proxy for /api/*.
  async function proxy(req, res) {
    const headers = { ...commonHeaders(req) };
    for (const h of FORWARD_REQUEST_HEADERS) if (req.get(h)) headers[h] = req.get(h);
    if (req.headers.cookie) headers.cookie = req.headers.cookie;
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    let r;
    try {
      r = await fetch(base + req.originalUrl, {
        method: req.method, headers, redirect: 'manual',
        body: hasBody ? Readable.toWeb(req) : undefined,
        duplex: hasBody ? 'half' : undefined,
      });
    } catch (err) {
      log.error(`[proxy] ${req.method} ${req.originalUrl.split('?')[0]} failed: ${err.message}`);
      return res.status(503).json({ ok: false, error: 'The service is unavailable right now. Please try again in a minute.' });
    }
    res.status(r.status);
    for (const h of FORWARD_RESPONSE_HEADERS) { const v = r.headers.get(h); if (v) res.setHeader(h, v); }
    for (const c of r.headers.getSetCookie()) res.append('Set-Cookie', c);
    if (!r.body || req.method === 'HEAD') return res.end();
    return Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
  }

  return { call, proxy, passCookies, clientIp };
}

module.exports = { createBackend, clientIp };
