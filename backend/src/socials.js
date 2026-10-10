'use strict';
// Social links on profiles. People can paste a full profile URL or just their handle; either way
// we store a clean https URL on the platform's own domain, so a profile can't link elsewhere
// while showing, say, a YouTube icon.
const PLATFORMS = {
  youtube: { label: 'YouTube', hosts: ['youtube.com', 'youtu.be'], url: (h) => `https://www.youtube.com/@${h}` },
  tiktok: { label: 'TikTok', hosts: ['tiktok.com'], url: (h) => `https://www.tiktok.com/@${h}` },
  instagram: { label: 'Instagram', hosts: ['instagram.com'], url: (h) => `https://www.instagram.com/${h}` },
  x: { label: 'X', hosts: ['x.com', 'twitter.com'], url: (h) => `https://x.com/${h}` },
  twitch: { label: 'Twitch', hosts: ['twitch.tv'], url: (h) => `https://www.twitch.tv/${h}` },
  vimeo: { label: 'Vimeo', hosts: ['vimeo.com'], url: (h) => `https://vimeo.com/${h}` },
  behance: { label: 'Behance', hosts: ['behance.net'], url: (h) => `https://www.behance.net/${h}` },
  artstation: { label: 'ArtStation', hosts: ['artstation.com'], url: (h) => `https://www.artstation.com/${h}` },
  discord: { label: 'Discord', hosts: ['discord.gg', 'discord.com'], url: (h) => `https://discord.gg/${h}` },
};

const HANDLE_RE = /^[A-Za-z0-9._-]{1,60}$/;

function normalizeSocial(platform, input) {
  const p = PLATFORMS[platform];
  let s = String(input || '').trim();
  if (!p || !s) return { value: '' };
  if (!/[/.]/.test(s.replace(/^@/, '')) || /^@/.test(s)) {
    const handle = s.replace(/^@/, '');
    return HANDLE_RE.test(handle) ? { value: p.url(handle) } : { error: `That doesn’t look like a ${p.label} handle.` };
  }
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
    if (!p.hosts.includes(host) || u.pathname.length < 2 || s.length > 200) throw new Error('host');
    u.protocol = 'https:';
    u.hash = '';
    return { value: u.toString() };
  } catch {
    return { error: `Paste your ${p.label} profile link or handle.` };
  }
}

function parseSocials(stored) {
  try {
    const v = JSON.parse(stored || '{}');
    return Object.fromEntries(Object.entries(v).filter(([k, url]) => PLATFORMS[k] && typeof url === 'string' && url.startsWith('https://')));
  } catch {
    return {};
  }
}

module.exports = { PLATFORMS, normalizeSocial, parseSocials };
