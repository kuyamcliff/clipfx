'use strict';
// Exercises the R2 storage adapter against a real S3-compatible endpoint.
// Skipped unless R2_TEST_ENDPOINT is set, e.g. a throwaway R2 bucket or a local moto/MinIO server:
//   R2_TEST_ENDPOINT=http://localhost:5055 R2_TEST_BUCKET=clipfx R2_TEST_KEY=test R2_TEST_SECRET=test npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createR2Storage } = require('../src/storage/r2');
const { sha256Stream, sniff } = require('../src/storage');

const env = process.env;
const opts = { skip: !env.R2_TEST_ENDPOINT && 'set R2_TEST_ENDPOINT to run' };

test('R2 adapter: presigned PUT, multipart, reads, signed GET, delete', opts, async () => {
  const s = createR2Storage({ r2: { endpoint: env.R2_TEST_ENDPOINT, accessKeyId: env.R2_TEST_KEY, secretAccessKey: env.R2_TEST_SECRET, bucket: env.R2_TEST_BUCKET, region: 'auto' } });
  const prefix = `test-${crypto.randomBytes(4).toString('hex')}`;

  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(100)]);
  const key = `${prefix}/thumb.png`;
  const { url, headers } = await s.presignPut(key, { contentType: 'image/png', contentLength: png.length });
  assert.match(new URL(url).searchParams.get('X-Amz-SignedHeaders'), /content-length.*content-type/);
  assert.ok(![...new URL(url).searchParams.keys()].some((k) => /checksum/i.test(k)), 'no checksum params browsers can’t satisfy');
  assert.equal((await fetch(url, { method: 'PUT', headers, body: png })).status, 200);
  assert.deepEqual(await s.stat(key), { size: png.length });
  assert.equal(sniff(await s.readRange(key, 0, 15)), 'png');

  const get = await s.urlFor(key, { attachment: true, filename: 'thumb ü.png', contentType: 'image/png' });
  const r = await fetch(get);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /^attachment;/);
  assert.equal(await s.urlFor(key, { stable: true }), await s.urlFor(key, { stable: true }), 'stable URLs are cacheable');

  const part = 5 * 1024 * 1024;
  const big = crypto.randomBytes(part + 1234);
  const bigKey = `${prefix}/big.bin`;
  const uploadId = await s.createMultipart(bigKey, 'application/octet-stream');
  const etags = [];
  for (const [n, chunk] of [[1, big.subarray(0, part)], [2, big.subarray(part)]]) {
    const res = await fetch(await s.presignPart(bigKey, uploadId, n, chunk.length), { method: 'PUT', body: chunk });
    assert.equal(res.status, 200);
    etags.push({ number: n, etag: res.headers.get('etag') });
  }
  await s.completeMultipart(bigKey, uploadId, etags.reverse());
  assert.equal((await s.stat(bigKey)).size, big.length);
  assert.equal(await sha256Stream(await s.readStream(bigKey)), crypto.createHash('sha256').update(big).digest('hex'));

  await s.remove(key);
  await s.remove(bigKey);
  assert.equal(await s.stat(key), null);
});
