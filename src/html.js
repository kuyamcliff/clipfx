'use strict';
// Tiny HTML templating: every interpolated value is escaped unless wrapped in raw().

class Safe {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
const esc = (s) => String(s).replace(/[&<>"'`]/g, (c) => ESCAPES[c]);

function renderValue(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Safe) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}

function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new Safe(out);
}

const raw = (s) => new Safe(String(s));

// Plain text → paragraphs, line breaks and clickable links. Input is escaped first.
function richText(text) {
  const paragraphs = String(text || '').trim().split(/\n{2,}/).filter(Boolean);
  return raw(paragraphs.map((p) => {
    const linked = esc(p).replace(/https?:\/\/[^\s<]+/g, (url) => {
      const trail = /[.,!?;:)\]]+$/.exec(url);
      const clean = trail ? url.slice(0, -trail[0].length) : url;
      return `<a href="${clean}" rel="nofollow ugc noopener" target="_blank">${clean}</a>${trail ? trail[0] : ''}`;
    });
    return `<p>${linked.replace(/\n/g, '<br>')}</p>`;
  }).join(''));
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const s = Math.round(seconds);
  if (s < 1) return '0:01';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function formatCount(n) {
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  if (n < 1e6) return `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

function timeAgo(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.345, 'week'], [12, 'month'], [Infinity, 'year']];
  let v = s;
  for (const [size, unit] of steps) {
    if (v < size) {
      const r = Math.max(1, Math.floor(v));
      return unit === 'second' ? 'just now' : `${r} ${unit}${r === 1 ? '' : 's'} ago`;
    }
    v /= size;
  }
  return '';
}

function formatDate(ms) {
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const plural = (n, word, pluralWord = `${word}s`) => `${formatCount(n)} ${n === 1 ? word : pluralWord}`;

module.exports = { html, raw, esc, Safe, richText, formatBytes, formatDuration, formatCount, timeAgo, formatDate, plural };
