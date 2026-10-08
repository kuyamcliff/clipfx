'use strict';
// Optional background media processing with ffmpeg: probes metadata, makes thumbnails,
// waveform images and lightweight web previews for formats browsers can't play.
const { execFile, spawnSync } = require('node:child_process');
const path = require('node:path');
const fsp = require('node:fs/promises');

const WEB_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);
const WEB_CONTAINERS = new Set(['mp4', 'm4v', 'webm']);
const BROWSER_AUDIO = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac']);
const BIG_FILE = 200 * 1024 * 1024;

function createMedia({ config, models, storage, log = console }) {
  let available = false;
  if (config.mediaProcessing) {
    try {
      available = spawnSync(config.ffmpegPath, ['-version']).status === 0
        && spawnSync(config.ffprobePath, ['-version']).status === 0;
    } catch { available = false; }
  }

  const queue = [];
  let running = false;
  let waiters = [];

  const run = (bin, args, timeout = 15 * 60 * 1000) => new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });

  async function probe(file) {
    const out = await run(config.ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], 60 * 1000);
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

  async function tmpOut(ext) {
    await fsp.mkdir(config.tmpDir, { recursive: true });
    return path.join(config.tmpDir, `media-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  }

  async function produce(ext, args) {
    const out = await tmpOut(ext);
    try {
      await run(config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
      const st = await fsp.stat(out);
      if (!st.size) throw new Error('empty output');
      return await storage.moveIn(out, ext);
    } catch (err) {
      await fsp.unlink(out).catch(() => {});
      throw err;
    }
  }

  const scale = "scale='min(960,iw)':-2";

  async function processAsset(id) {
    const asset = models.assets.rawById(id);
    if (!asset) return;
    const src = storage.abs(asset.file_key);
    const update = {};
    const step = async (name, fn) => {
      try { await fn(); } catch (err) { log.warn(`[media] ${name} failed for asset ${id}: ${err.message.split('\n')[0]}`); }
    };

    let info = null;
    if (['video', 'audio', 'image'].includes(asset.file_kind)) {
      await step('probe', async () => {
        info = await probe(src);
        if (asset.file_kind !== 'audio') { update.width = info.width; update.height = info.height; }
        if (asset.file_kind !== 'image') update.duration = info.duration;
      });
    }

    if (asset.file_kind === 'video') {
      if (!asset.thumb_key) {
        await step('thumbnail', async () => {
          const t = info && info.duration ? Math.min(1, info.duration / 4) : 0;
          update.thumb_key = await produce('jpg', ['-ss', String(t), '-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '4']);
        });
      }
      const webFriendly = WEB_CONTAINERS.has(asset.file_ext) && info && WEB_CODECS.has(info.vcodec) && asset.file_size <= BIG_FILE;
      if (!asset.preview_key && !webFriendly) {
        await step('preview', async () => {
          update.preview_key = await produce('mp4', ['-i', src, '-t', '30', '-vf', "scale='min(1280,iw)':-2,format=yuv420p",
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']);
          update.preview_ext = 'mp4';
        });
      }
    } else if (asset.file_kind === 'audio') {
      if (!asset.thumb_key) {
        await step('waveform', async () => {
          update.thumb_key = await produce('png', ['-i', src, '-filter_complex',
            'aformat=channel_layouts=mono,showwavespic=s=1280x720:colors=0x8a8a86', '-frames:v', '1']);
        });
      }
      if (!asset.preview_key && !BROWSER_AUDIO.has(asset.file_ext)) {
        await step('audio preview', async () => {
          update.preview_key = await produce('mp3', ['-i', src, '-t', '300', '-vn', '-c:a', 'libmp3lame', '-q:a', '4']);
          update.preview_ext = 'mp3';
        });
      }
    } else if (asset.file_kind === 'image' && !asset.thumb_key) {
      await step('image thumbnail', async () => {
        update.thumb_key = await produce('jpg', ['-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '3']);
      });
    }

    // The asset may have been deleted while we worked.
    if (!models.assets.rawById(id)) {
      for (const k of ['thumb_key', 'preview_key']) if (update[k]) await storage.remove(update[k]);
      return;
    }
    update.media_status = 'done';
    models.assets.setMedia(id, update);
  }

  async function pump() {
    if (running) return;
    running = true;
    while (queue.length) {
      const id = queue.shift();
      try {
        await processAsset(id);
      } catch (err) {
        log.warn(`[media] asset ${id} failed: ${err.message}`);
        try { models.assets.setMedia(id, { media_status: 'failed' }); } catch { /* deleted */ }
      }
    }
    running = false;
    const w = waiters;
    waiters = [];
    w.forEach((fn) => fn());
  }

  function needsWork(kind) {
    return available && ['video', 'audio', 'image'].includes(kind);
  }

  function enqueue(id) {
    if (!available) return;
    queue.push(id);
    setImmediate(pump);
  }

  // Re-queue anything left pending by a restart.
  function resume() {
    if (!available) return;
    const rows = models.db.prepare("SELECT id FROM assets WHERE media_status = 'pending'").all();
    rows.forEach((r) => enqueue(r.id));
  }

  const idle = () => (running || queue.length ? new Promise((r) => waiters.push(r)) : Promise.resolve());

  return { available, enqueue, needsWork, resume, idle, probe };
}

module.exports = { createMedia };
