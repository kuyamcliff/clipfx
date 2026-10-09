'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { startServer, client, baseFields } = require('./helpers');

const hasFfmpeg = (() => { try { return spawnSync('ffmpeg', ['-version']).status === 0; } catch { return false; } })();

test('ffmpeg generates thumbnails, metadata and web previews', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const srv = await startServer({ mediaProcessing: true });
  try {
    const dir = fs.mkdtempSync(path.join(srv.dataDir, 'src-'));
    const mkv = path.join(dir, 'clip.mkv');
    const wav = path.join(dir, 'hit.wav');
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24:duration=2', '-c:v', 'mpeg4', mkv]);
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', wav]);

    const c = client(srv.base);
    await c.signup('editor');
    let res = await c.upload(baseFields({ category: 'footage' }), { file: { name: 'clip.mkv', data: fs.readFileSync(mkv) } });
    assert.equal(res.status, 201, res.text_);
    const videoSlug = JSON.parse(res.text_).url.split('/').pop();
    res = await c.upload(baseFields({ category: 'sfx', title: 'Sine Hit' }), { file: { name: 'hit.wav', data: fs.readFileSync(wav) } });
    const audioSlug = JSON.parse(res.text_).url.split('/').pop();

    await srv.media.idle();
    const v = srv.models.assets.bySlug(videoSlug);
    assert.equal(v.media_status, 'done');
    assert.equal(v.width, 1280);
    assert.equal(v.height, 720);
    assert.ok(Math.abs(v.duration - 2) < 0.2);
    assert.ok(v.thumb_key, 'thumbnail generated');
    assert.equal(v.preview_ext, 'mp4', 'mkv gets a web preview');
    assert.equal(v.resolution, '720p');

    const thumb = await c.get(`/m/${videoSlug}/thumb`);
    assert.equal(thumb.headers.get('content-type'), 'image/jpeg');
    const preview = await c.get(`/m/${videoSlug}/preview`);
    assert.equal(preview.headers.get('content-type'), 'video/mp4');

    const a = srv.models.assets.bySlug(audioSlug);
    assert.ok(a.thumb_key, 'waveform generated');
    assert.ok(Math.abs(a.duration - 1) < 0.2);
  } finally {
    await srv.stop();
  }
});
