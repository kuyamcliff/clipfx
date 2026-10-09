'use strict';
// Fills a local instance with demo content. Usage: npm run seed
// Generates real media with ffmpeg when available, otherwise small placeholder files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');
const { hashPassword } = require('../src/security');

const DEMO = [
  { title: 'Organic Light Leaks Vol. 1', category: 'overlays', license: 'cc0', tags: 'light leak, film, warm, overlay', software: ['ae', 'pr', 'resolve'], gen: ['video', 'gradients=size=1920x1080:c0=0xff6a00:c1=0xff2d95:duration=4:speed=0.05'] },
  { title: 'Whip Pan Transitions', category: 'transitions', license: 'free', tags: 'whip, pan, transition, fast', software: ['pr', 'ae'], gen: ['video', 'testsrc2=size=1920x1080:rate=30:duration=3'] },
  { title: 'City Night Drone B-Roll', category: 'footage', license: 'cc-by', tags: 'drone, city, night, aerial', software: ['any'], gen: ['video', 'mandelbrot=size=3840x2160:rate=25', 3] },
  { title: 'Retro VHS Glitch Overlay', category: 'overlays', license: 'cc-by-sa', tags: 'vhs, glitch, retro, noise', software: ['ae', 'pr', 'capcut'], gen: ['video', 'cellauto=s=1280x720:rule=110', 3] },
  { title: 'Teal & Orange Cinematic LUT', category: 'luts', license: 'cc0', tags: 'lut, teal, orange, cinematic', software: ['resolve', 'pr', 'fcp'], gen: ['file', 'teal-orange.cube', 'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n'] },
  { title: 'Deep Whoosh Sound Pack', category: 'sfx', license: 'free', tags: 'whoosh, swish, transition, sfx', software: ['any'], gen: ['audio', 'anoisesrc=d=2:c=pink:r=44100:a=0.5,afade=t=in:d=0.8,afade=t=out:st=1:d=1'] },
  { title: 'Ambient Lo-fi Bed (60s)', category: 'music', license: 'cc-by', tags: 'lofi, chill, ambient, background', software: ['any'], gen: ['audio', 'sine=frequency=220:duration=6,volume=0.3'] },
  { title: 'Minimal Lower Thirds Template', category: 'templates', license: 'free', tags: 'lower third, titles, minimal, corporate', software: ['ae'], gen: ['file', 'lower-thirds.zip', 'PK demo template'] },
  { title: 'Bounce & Overshoot Presets', category: 'presets', license: 'cc0', tags: 'animation, bounce, easing, preset', software: ['ae'], gen: ['file', 'bounce.ffx', 'demo preset'] },
  { title: 'Grungy Paper Textures', category: 'textures', license: 'cc0', tags: 'paper, texture, grunge, background', software: ['ps', 'ae'], gen: ['image', 'cellauto=s=1920x1080:rule=30'] },
  { title: 'Low-Poly Floating Islands', category: '3d', license: 'cc-by', tags: 'low poly, blender, island, scene', software: ['blender'], gen: ['file', 'islands.blend', 'BLENDER demo'] },
  { title: 'Vertical Social Shapes Pack', category: 'motion', license: 'free', tags: 'shapes, vertical, social, reels', software: ['ae', 'capcut'], gen: ['video', 'life=s=720x1280:mold=10:r=30:ratio=0.1:death_color=#C83232:life_color=#00ff00', 3] },
];

async function main() {
  const config = loadConfig();
  const { models, storage, media, close } = createApp(config, { log: { log() {}, warn: console.warn, error: console.error } });
  const ffmpeg = media.available;
  const tmp = fs.mkdtempSync(path.join(config.tmpDir, 'seed-'));

  let user = models.users.byUsername('demo');
  if (!user) {
    const id = models.users.create({ username: 'demo', passwordHash: await hashPassword('demo-password'), displayName: 'Demo Studio', role: models.users.count() ? 'user' : 'admin' });
    models.users.updateProfile(id, { displayName: 'Demo Studio', bio: 'Example uploads so you can see how the site looks.', website: 'https://example.org/', email: '' });
    user = models.users.byId(id);
  }

  for (const d of DEMO) {
    const [type, a, b] = d.gen;
    let file;
    if (type === 'file' || !ffmpeg) {
      file = path.join(tmp, type === 'file' ? a : `${d.title.replace(/\W+/g, '-')}.zip`);
      fs.writeFileSync(file, type === 'file' ? b : 'PK placeholder');
    } else if (type === 'video') {
      file = path.join(tmp, `${crypto.randomBytes(4).toString('hex')}.mp4`);
      const args = ['-v', 'error', '-f', 'lavfi', '-i', a];
      if (b) args.push('-t', String(b));
      spawnSync(config.ffmpegPath, [...args, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', file]);
    } else if (type === 'audio') {
      file = path.join(tmp, `${crypto.randomBytes(4).toString('hex')}.wav`);
      spawnSync(config.ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', a, file]);
    } else if (type === 'image') {
      file = path.join(tmp, `${crypto.randomBytes(4).toString('hex')}.png`);
      spawnSync(config.ffmpegPath, ['-v', 'error', '-f', 'lavfi', '-i', a, '-frames:v', '1', file]);
    }
    const ext = path.extname(file).slice(1);
    const { FILE_TYPES } = require('../src/catalog');
    const size = fs.statSync(file).size;
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const fileKey = await storage.moveIn(file, ext);
    const kind = FILE_TYPES[ext].kind;
    const { id } = models.assets.create({
      userId: user.id, title: d.title, description: `${d.title} — demo content generated for local development.\n\nReplace it with real uploads!`,
      category: d.category, software: d.software, tags: d.tags.split(', '), license: d.license, visibility: 'public',
      fileName: `${d.title.replace(/\W+/g, '-').toLowerCase()}.${ext}`, fileKey, fileSize: size, fileExt: ext, fileKind: kind, sha256,
      mediaStatus: media.needsWork(kind) ? 'pending' : 'none',
    });
    models.db.prepare('UPDATE assets SET downloads = ?, views = ? WHERE id = ?').run(Math.floor(Math.random() * 900), Math.floor(Math.random() * 4000), id);
    media.enqueue(id);
    console.log(`+ ${d.title}`);
  }
  await media.idle();
  fs.rmSync(tmp, { recursive: true, force: true });
  close();
  console.log('\nDone. Log in as demo / demo-password');
}

main().catch((err) => { console.error(err); process.exit(1); });
