'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatBytes } = require('../src/format');
const { buildSearch } = require('../src/models');
const { parseAssetFields } = require('../src/routes/assets');
const { sanitizeFileName } = require('../src/routes/uploads');
const { normalizeWebsite } = require('../src/routes/users');
const { sniff, contentDisposition } = require('../src/storage');

test('formatBytes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(5 * 1024 ** 3), '5.0 GB');
});

test('search query builder strips FTS syntax', () => {
  assert.equal(buildSearch('light-leak "OR" (4k)*'), '"light"* "leak"* "or"* "4k"*');
  assert.equal(buildSearch('   '), '');
});

test('asset field parsing', () => {
  const { values, errors } = parseAssetFields({
    title: '  My   Pack ', category: 'luts', license: 'cc0', software: ['ae', 'bogus', 'ae'],
    tags: 'Film, #grain, x, Film, light leak!!', visibility: 'unlisted',
  });
  assert.deepEqual(errors, {});
  assert.equal(values.title, 'My Pack');
  assert.deepEqual(values.software, ['ae']);
  assert.deepEqual(values.tags, ['film', 'grain', 'light leak']);
  assert.equal(values.visibility, 'unlisted');
  assert.equal(parseAssetFields({ visibility: 'private' }).values.visibility, 'public');
  assert.deepEqual(parseAssetFields({ tags: ['a b', 'cd'] }).values.tags, ['a b', 'cd']);
});

test('file names are sanitized', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFileName('C:\\Users\\me\\clip.mov'), 'clip.mov');
  assert.equal(sanitizeFileName('we<ird>:name?.zip'), 'we_ird__name_.zip');
  assert.ok(sanitizeFileName(`${'x'.repeat(300)}.mov`).endsWith('.mov'));
});

test('website normalization', () => {
  assert.equal(normalizeWebsite('example.com').value, 'https://example.com/');
  assert.ok(normalizeWebsite('javascript:alert(1)').error);
  assert.ok(normalizeWebsite('localhost').error);
  assert.equal(normalizeWebsite('').value, '');
});

test('magic-byte sniffing and content disposition', () => {
  assert.equal(sniff(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')), 'png');
  assert.equal(sniff(Buffer.from('<html><body>hi</body>')), null);
  assert.equal(contentDisposition('attachment', 'Clip "1" ü.mp4'), 'attachment; filename="Clip _1_ _.mp4"; filename*=UTF-8\'\'Clip%20%221%22%20%C3%BC.mp4');
});

test('production refuses local storage uploads unless allowed', () => {
  const { loadConfig } = require('../src/config');
  const os = require('node:os');
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const dataDir = require('node:fs').mkdtempSync(require('node:path').join(os.tmpdir(), 'cfx-cfg-'));
    assert.equal(loadConfig({ dataDir, storage: 'local' }).uploadsEnabled, false);
    assert.equal(loadConfig({ dataDir, storage: 'r2', r2: { endpoint: 'https://x.r2.cloudflarestorage.com', accessKeyId: 'a', secretAccessKey: 'b', bucket: 'c' } }).uploadsEnabled, true);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('R2 public domains: media and downloads use custom domains, uploads stay signed', async () => {
  const { createR2Storage } = require('../src/storage/r2');
  const s = createR2Storage({ r2: {
    endpoint: 'https://acc.r2.cloudflarestorage.com', accessKeyId: 'a', secretAccessKey: 'b', bucket: 'clipfx', region: 'auto',
    public: { image: 'https://image.example', video: 'https://video.example', audio: '', download: 'https://download.example' },
  } });
  assert.equal(await s.urlFor('t/ab/x.jpg', { kind: 'image' }), 'https://image.example/t/ab/x.jpg');
  assert.equal(await s.urlFor('f/ab/x.zip', { kind: 'download', attachment: true, filename: 'x.zip' }), 'https://download.example/f/ab/x.zip');
  assert.match(await s.urlFor('f/ab/x.mp3', { kind: 'audio' }), /^https:\/\/acc\.r2\.cloudflarestorage\.com\/clipfx\/f\/ab\/x\.mp3\?X-Amz-/, 'falls back to a signed URL');
  const put = await s.presignPut('f/ab/x.zip', { contentType: 'application/octet-stream', contentLength: 10, contentDisposition: 'attachment; filename="x.zip"' });
  assert.equal(new URL(put.url).searchParams.get('X-Amz-SignedHeaders'), 'content-disposition;content-length;content-type;host');
  assert.equal(put.headers['Content-Disposition'], 'attachment; filename="x.zip"');
  assert.deepEqual(s.origins, ['https://acc.r2.cloudflarestorage.com', 'https://image.example', 'https://video.example', 'https://download.example']);
});
