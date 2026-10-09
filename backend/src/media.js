'use strict';
// Background work after an upload lands in storage:
//  - always: SHA-256 of the file (to block re-uploads of removed files)
//  - with ffmpeg: metadata, thumbnails, waveforms and web previews for formats browsers can't play.
// ffmpeg reads straight from storage (a presigned R2 URL in production), so nothing is copied to disk first.
const { execFile, spawnSync } = require('node:child_process');
const path = require('node:path');
const fsp = require('node:fs/promises');
const { sha256Stream } = require('./storage');
const { quarantine } = require('./quarantine');

const WEB_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);
const WEB_CONTAINERS = new Set(['mp4', 'm4v', 'webm']);
const BROWSER_AUDIO = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac']);
const MEDIA_KINDS = new Set(['video', 'audio', 'image']);
const BIG_FILE = 200 * 1024 * 1024;
const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', mp3: 'audio/mpeg' };

function createMedia({ config, models, storage, log = console }) {
  let available = false;
  if (config.mediaProcessing) {
    try {
      available = spawnSync(config.ffmpegPath, ['-version']).status === 0
        && spawnSync(config.ffprobePath, ['-version']).status === 0;
    } catch { available = false; }
  }

  const queue = [];
  const queued = new Set();
  let running = false;
  let waiters = [];

  const run = (bin, args, timeout = 15 * 60 * 1000) => new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });

  async function probe(input) {
    const out = await run(config.ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input], 2 * 60 * 1000);
    const info = JSON.parse(out);
    const streams = info.streams || [];
    const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
    const a = streams.find((s) => s.codec_type === 'audio');
    let width = v ? v.width : null;
    let height = v ? v.height : null;
    const rotation = v && v.side_data_list && v.side_data_list.find((d) => d.rotation !== undefined);
    if (rotation && Math.abs(rotation.rotation) % 180 === 90) [width, height] = [height, width];
    const duration = parseFloat((info.format && info.format.duration) || (v && v.duration) || (a && a.duration)) || null;
    return { width, height, duration, vcodec: v ? v.codec_name : null, hasAudio: !!a };
  }

  // Runs ffmpeg into a temp file, then stores it under a new key.
  async function produce(prefix, ext, args) {
    await fsp.mkdir(config.tmpDir, { recursive: true });
    const out = path.join(config.tmpDir, `media-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    try {
      await run(config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
      const st = await fsp.stat(out);
      if (!st.size) throw new Error('empty output');
      const key = storage.newKey(prefix, ext);
      await storage.putFile(out, key, CONTENT_TYPES[ext]);
      return key;
    } finally {
      await fsp.unlink(out).catch(() => {});
    }
  }

  const scale = "scale='min(960,iw)':-2";

  async function processAsset(id) {
    const asset = models.assets.rawById(id);
    if (!asset) return;
    const update = {};
    const created = [];
    const step = async (name, fn) => {
      try { await fn(); } catch (err) { log.warn(`[media] ${name} failed for asset ${id}: ${String(err.message).split('\n')[0]}`); }
    };

    if (!asset.file_sha256) {
      await step('hash', async () => { update.file_sha256 = await sha256Stream(await storage.readStream(asset.file_key)); });
    }

    if (available && asset.media_status === 'pending' && MEDIA_KINDS.has(asset.file_kind)) {
      const src = await storage.ffmpegInput(asset.file_key);
      let info = null;
      await step('probe', async () => {
        info = await probe(src);
        if (asset.file_kind !== 'audio') { update.width = info.width; update.height = info.height; }
        if (asset.file_kind !== 'image') update.duration = info.duration;
      });

      const make = async (field, prefix, ext, args) => {
        update[field] = await produce(prefix, ext, args);
        created.push(update[field]);
      };
      if (asset.file_kind === 'video') {
        if (!asset.thumb_key) {
          await step('thumbnail', () => make('thumb_key', 't', 'jpg', ['-ss', String(info && info.duration ? Math.min(1, info.duration / 4) : 0), '-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '4']));
        }
        const webFriendly = WEB_CONTAINERS.has(asset.file_ext) && info && WEB_CODECS.has(info.vcodec) && asset.file_size <= BIG_FILE;
        if (!asset.preview_key && !webFriendly) {
          await step('preview', async () => {
            await make('preview_key', 'p', 'mp4', ['-i', src, '-t', '30', '-vf', "scale='min(1280,iw)':-2,format=yuv420p",
              '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']);
            update.preview_ext = 'mp4';
          });
        }
      } else if (asset.file_kind === 'audio') {
        if (!asset.thumb_key) {
          await step('waveform', () => make('thumb_key', 't', 'png', ['-i', src, '-filter_complex',
            'aformat=channel_layouts=mono,showwavespic=s=1280x720:colors=0x8a8a86', '-frames:v', '1']));
        }
        if (!asset.preview_key && !BROWSER_AUDIO.has(asset.file_ext)) {
          await step('audio preview', async () => {
            await make('preview_key', 'p', 'mp3', ['-i', src, '-t', '300', '-vn', '-c:a', 'libmp3lame', '-q:a', '4']);
            update.preview_ext = 'mp3';
          });
        }
      } else if (asset.file_kind === 'image' && !asset.thumb_key) {
        await step('image thumbnail', () => make('thumb_key', 't', 'jpg', ['-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '3']));
      }
    }

    // The asset may have been deleted, or its file replaced, while we worked.
    const now = models.assets.rawById(id);
    if (!now || now.file_key !== asset.file_key) {
      await Promise.all(created.map((k) => storage.remove(k)));
      return;
    }
    if (asset.media_status === 'pending') update.media_status = 'done';
    models.assets.setFields(id, update);

    if (update.file_sha256 && models.assets.isBlockedHash(update.file_sha256)) {
      models.assets.setStatus(id, 'removed', 'Same file as one removed earlier');
      await quarantine(models, storage, models.assets.rawById(id), log);
      log.warn(`[media] asset ${id} matches a blocked file and was removed`);
    }
  }

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const id = queue.shift();
      queued.delete(id);
      try {
        await processAsset(id);
      } catch (err) {
        log.warn(`[media] asset ${id} failed: ${err.message}`);
        try { models.assets.setFields(id, { media_status: 'failed' }); } catch { /* deleted */ }
      }
    }
    running = false;
    const w = waiters;
    waiters = [];
    w.forEach((fn) => fn());
  }

  // Whether ffmpeg work (thumbnails etc.) will happen for this kind of file.
  const needsMedia = (kind) => available && MEDIA_KINDS.has(kind);

  function enqueue(id) {
    if (queued.has(id)) return;
    queued.add(id);
    queue.push(id);
    setImmediate(pump);
  }

  // Re-queue anything left unfinished by a restart.
  function resume() {
    models.assets.needingWork().forEach((r) => enqueue(r.id));
  }

  const idle = () => (running || queue.length ? new Promise((r) => waiters.push(r)) : Promise.resolve());

  return { available, enqueue, needsMedia, resume, idle, probe };
}

module.exports = { createMedia };
