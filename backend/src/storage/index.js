'use strict';
// Storage backends share one interface so the API doesn't care where bytes live:
//   R2 (production): browsers upload/download directly with presigned URLs.
//   local (development/tests): same flow, but the "presigned" URLs point at /api/blob on this server.
const crypto = require('node:crypto');

function newKey(prefix, ext) {
  const id = crypto.randomBytes(16).toString('hex');
  return `${prefix}/${id.slice(0, 2)}/${id}${ext ? `.${ext}` : ''}`;
}

function sha256Stream(stream) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    stream.on('error', reject).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex')));
  });
}

// Magic-byte check for files we show inline (previews & thumbnails).
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  return null;
}

// RFC 6266 Content-Disposition with a UTF-8 filename and an ASCII fallback.
function contentDisposition(type, filename) {
  if (!filename) return type;
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

function createStorage(config) {
  if (config.storage === 'r2') return require('./r2').createR2Storage(config);
  return require('./local').createLocalStorage(config);
}

module.exports = { createStorage, newKey, sha256Stream, sniff, contentDisposition };
