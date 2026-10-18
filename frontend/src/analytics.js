'use strict';
// Visit analytics for developer pages, stored in Cloudflare Workers Analytics Engine.
// Each data point: index1 = username; blob1 = event (page | product | download), blob2 = product slug,
// blob3 = country, blob4 = referrer host, blob5 = device. Nothing that identifies a visitor is kept.
// Charts are read back with Analytics Engine's SQL API (needs an "Account Analytics: Read" token).

const BOT_RE = /bot|crawl|spider|slurp|preview|fetch|monitor|curl|wget|python|headless|lighthouse|facebookexternalhit/i;
const USERNAME_RE = /^[a-z0-9_]{1,40}$/;
const SLUG_RE = /^[A-Za-z0-9_-]{1,40}$/;

function device(ua) {
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function referrerHost(req, ownHosts) {
  try {
    const host = new URL(req.get('referer') || '').hostname.replace(/^www\./, '');
    if (!host || ownHosts.some((h) => host === h || host.endsWith(`.${h}`))) return '';
    return host.slice(0, 100);
  } catch {
    return '';
  }
}

function createAnalytics(config) {
  const { track, analytics = {} } = config;
  const dataset = analytics.dataset || 'clipfx_events';
  const ownHosts = [config.pagesDomain].filter(Boolean);

  // Records one visit. Never throws, never waits: analytics must not slow or break a page.
  function record(req, event, username, slug = '') {
    if (typeof track !== 'function' || !USERNAME_RE.test(username)) return;
    const ua = String(req.get('user-agent') || '');
    if (!ua || BOT_RE.test(ua) || req.method !== 'GET') return;
    track({
      indexes: [username],
      blobs: [event, SLUG_RE.test(slug) ? slug : '', String(req.get('cf-ipcountry') || '').slice(0, 2), referrerHost(req, ownHosts), device(ua)],
      doubles: [1],
    });
  }

  const configured = () => !!(analytics.accountId && analytics.token);

  async function sql(query) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${analytics.accountId}/analytics_engine/sql`, {
      method: 'POST', headers: { authorization: `Bearer ${analytics.token}` }, body: query, signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`analytics ${r.status} ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).data || [];
  }

  // Visits for one developer over the last `days` days. null when analytics isn't set up or fails.
  async function report(username, days = 30) {
    if (!configured() || !USERNAME_RE.test(username) || ![7, 30, 90].includes(days)) return null;
    const where = `index1 = '${username}' AND timestamp > NOW() - INTERVAL '${days}' DAY`;
    const count = 'SUM(_sample_interval)';
    try {
      const [perDay, referrers, countries, products, devices] = await Promise.all([
        sql(`SELECT toDate(timestamp) AS day, blob1 AS event, ${count} AS n FROM ${dataset} WHERE ${where} GROUP BY day, event ORDER BY day`),
        sql(`SELECT blob4 AS name, ${count} AS n FROM ${dataset} WHERE ${where} AND blob1 = 'page' AND blob4 != '' GROUP BY name ORDER BY n DESC LIMIT 8`),
        sql(`SELECT blob3 AS name, ${count} AS n FROM ${dataset} WHERE ${where} AND blob3 != '' GROUP BY name ORDER BY n DESC LIMIT 8`),
        sql(`SELECT blob2 AS slug, ${count} AS n FROM ${dataset} WHERE ${where} AND blob1 = 'product' GROUP BY slug ORDER BY n DESC LIMIT 10`),
        sql(`SELECT blob5 AS name, ${count} AS n FROM ${dataset} WHERE ${where} GROUP BY name ORDER BY n DESC`),
      ]);
      const byDay = new Map();
      for (const r of perDay) {
        const d = String(r.day).slice(0, 10);
        const e = byDay.get(d) || { page: 0, product: 0, download: 0 };
        e[r.event] = Number(r.n) || 0;
        byDay.set(d, e);
      }
      const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
      const series = Array.from({ length: days }, (_, i) => {
        const date = new Date(today - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
        const e = byDay.get(date) || { page: 0, product: 0, download: 0 };
        return { date, pageViews: e.page, productViews: e.product };
      });
      const num = (rows) => rows.map((r) => ({ ...r, n: Number(r.n) || 0 }));
      return { series, referrers: num(referrers), countries: num(countries), products: num(products), devices: num(devices) };
    } catch (err) {
      console.error(`[analytics] ${err.message}`);
      return null;
    }
  }

  return { record, report, configured };
}

module.exports = { createAnalytics };
