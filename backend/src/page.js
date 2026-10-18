'use strict';
// Developer pages (name.clipfx.me): the settings a developer can change, stored as JSON on users.page.
// Everything is validated here, so the website can render the stored values without second-guessing.

const ACCENTS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#64748b', '#0f172a'];
const THEMES = ['auto', 'dark', 'light'];
const LAYOUTS = ['grid', 'list'];
const COVERS = ['gradient', 'mesh', 'grid', 'plain'];
const MAX_LINKS = 6;
const MAX_FEATURED = 6;

const DEFAULT_PAGE = Object.freeze({
  headline: '', about: '', accent: ACCENTS[0], theme: 'auto', layout: 'grid', cover: 'gradient',
  featured: [], links: [], cta: null, show_stats: true, show_socials: true,
});

const cleanText = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

function cleanUrl(input) {
  let s = String(input || '').trim();
  if (!s) return { value: '' };
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || s.length > 300) throw new Error('bad');
    return { value: u.toString() };
  } catch {
    return { error: 'Enter a full web address, like https://example.com' };
  }
}

// Stored JSON -> settings with every field present and valid (bad or old data falls back to defaults).
function parsePage(stored) {
  let raw = {};
  try { raw = typeof stored === 'string' ? JSON.parse(stored || '{}') : (stored || {}); } catch { raw = {}; }
  const { value } = normalizePage(raw, { lenient: true });
  return value;
}

// Form/API input -> { value, errors }. `ownedSlugs` limits featured products to the developer's own.
function normalizePage(input = {}, { ownedSlugs = null, lenient = false } = {}) {
  const errors = {};
  const v = { ...DEFAULT_PAGE };
  v.headline = cleanText(input.headline, 120);
  v.about = cleanText(input.about, 4000);
  const accent = String(input.accent || '').toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(accent)) v.accent = accent;
  else if (accent && !lenient) errors.accent = 'Pick a color.';
  if (THEMES.includes(input.theme)) v.theme = input.theme;
  if (LAYOUTS.includes(input.layout)) v.layout = input.layout;
  if (COVERS.includes(input.cover)) v.cover = input.cover;
  v.show_stats = input.show_stats === undefined ? true : input.show_stats === true || input.show_stats === 'on' || input.show_stats === '1' || input.show_stats === 1;
  v.show_socials = input.show_socials === undefined ? true : input.show_socials === true || input.show_socials === 'on' || input.show_socials === '1' || input.show_socials === 1;

  const featured = Array.isArray(input.featured) ? input.featured : String(input.featured || '').split(/[\s,]+/);
  v.featured = [...new Set(featured.map((s) => String(s).trim()).filter((s) => /^[A-Za-z0-9_-]{4,32}$/.test(s)))]
    .filter((s) => !ownedSlugs || ownedSlugs.has(s)).slice(0, MAX_FEATURED);

  const links = Array.isArray(input.links) ? input.links : [];
  v.links = [];
  links.slice(0, MAX_LINKS * 2).forEach((l, i) => {
    const label = cleanText(l && l.label, 40);
    const url = cleanUrl(l && l.url);
    if (!label && !url.value && !url.error) return;
    if (url.error || !url.value) { if (!lenient) errors[`links_${i}`] = url.error || 'Add the link address.'; return; }
    if (v.links.length < MAX_LINKS) v.links.push({ label: label || new URL(url.value).hostname.replace(/^www\./, ''), url: url.value });
  });

  const cta = input.cta && typeof input.cta === 'object' ? input.cta : null;
  if (cta && (cta.label || cta.url)) {
    const url = cleanUrl(cta.url);
    if (url.error || !url.value) { if (!lenient) errors.cta = url.error || 'Add the button’s link.'; } else v.cta = { label: cleanText(cta.label, 30) || 'Get started', url: url.value };
  }
  return { value: v, errors };
}

module.exports = { DEFAULT_PAGE, ACCENTS, THEMES, LAYOUTS, COVERS, MAX_LINKS, MAX_FEATURED, parsePage, normalizePage };
