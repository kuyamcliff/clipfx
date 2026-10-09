'use strict';
// Static taxonomy: categories, supported software, licenses and accepted file types.

const CATEGORIES = [
  { id: 'footage', name: 'Stock Footage', icon: 'film', hue: 210, blurb: 'B-roll, establishing shots, slow motion and drone clips.' },
  { id: 'transitions', name: 'Transitions', icon: 'transition', hue: 265, blurb: 'Whips, zooms, glitches, swipes and seamless cuts.' },
  { id: 'overlays', name: 'Overlays & VFX', icon: 'sparkles', hue: 25, blurb: 'Light leaks, film grain, dust, smoke, fire and flares.' },
  { id: 'luts', name: 'LUTs & Color', icon: 'palette', hue: 330, blurb: 'Creative looks, film emulations and conversion LUTs.' },
  { id: 'templates', name: 'Project Templates', icon: 'layout', hue: 190, blurb: 'Ready-to-edit After Effects, Premiere, Resolve and FCP projects.' },
  { id: 'motion', name: 'Motion Graphics', icon: 'shapes', hue: 150, blurb: 'Titles, lower thirds, shape packs and callouts.' },
  { id: 'presets', name: 'Presets & MOGRTs', icon: 'sliders', hue: 45, blurb: 'Animation presets, effect stacks and motion graphics templates.' },
  { id: 'sfx', name: 'Sound Effects', icon: 'wave', hue: 0, blurb: 'Whooshes, risers, hits, UI sounds, foley and ambience.' },
  { id: 'music', name: 'Music', icon: 'music', hue: 290, blurb: 'Royalty-free beds, loops and stingers.' },
  { id: 'textures', name: 'Textures & Stills', icon: 'image', hue: 100, blurb: 'Backgrounds, paper, film scans, mattes and HDRIs.' },
  { id: '3d', name: '3D Assets', icon: 'cube', hue: 175, blurb: 'Models, scenes and materials for Blender, C4D and more.' },
  { id: 'other', name: 'Other', icon: 'box', hue: 240, blurb: 'Guides, toolkits, fonts and everything else.' },
];

const SOFTWARE = [
  { id: 'ae', name: 'After Effects' },
  { id: 'pr', name: 'Premiere Pro' },
  { id: 'resolve', name: 'DaVinci Resolve' },
  { id: 'fcp', name: 'Final Cut Pro' },
  { id: 'motion', name: 'Apple Motion' },
  { id: 'blender', name: 'Blender' },
  { id: 'c4d', name: 'Cinema 4D' },
  { id: 'capcut', name: 'CapCut' },
  { id: 'vegas', name: 'Vegas Pro' },
  { id: 'ps', name: 'Photoshop' },
  { id: 'any', name: 'Any editor' },
];

const LICENSES = [
  {
    id: 'cc0', name: 'CC0 1.0 — Public Domain', short: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: false, commercial: true, shareAlike: false,
    summary: 'No rights reserved. Use it for anything, no credit needed.',
  },
  {
    id: 'free', name: 'Free Use License', short: 'Free Use', url: '/licenses#free',
    attribution: false, commercial: true, shareAlike: false, noResale: true,
    summary: 'Use it in personal and commercial projects without credit. Just don’t resell or re-upload the asset itself.',
  },
  {
    id: 'cc-by', name: 'CC BY 4.0 — Attribution', short: 'CC BY', url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: true, commercial: true, shareAlike: false,
    summary: 'Use it for anything, including commercial work, as long as you credit the creator.',
  },
  {
    id: 'cc-by-sa', name: 'CC BY-SA 4.0 — Attribution-ShareAlike', short: 'CC BY-SA', url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attribution: true, commercial: true, shareAlike: true,
    summary: 'Credit the creator, and share modified versions of the asset under the same license.',
  },
  {
    id: 'cc-by-nc', name: 'CC BY-NC 4.0 — Attribution-NonCommercial', short: 'CC BY-NC', url: 'https://creativecommons.org/licenses/by-nc/4.0/',
    attribution: true, commercial: false, shareAlike: false,
    summary: 'Credit the creator. Personal and non-commercial projects only.',
  },
];

// Accepted extensions. `inline` = safe to stream to the browser for playback/display.
// Everything else is only ever served as an attachment with a generic content type.
const FILE_TYPES = {
  // video
  mp4: { kind: 'video', mime: 'video/mp4', inline: true },
  m4v: { kind: 'video', mime: 'video/mp4', inline: true },
  webm: { kind: 'video', mime: 'video/webm', inline: true },
  mov: { kind: 'video', mime: 'video/quicktime', inline: true },
  mkv: { kind: 'video', mime: 'video/x-matroska' },
  avi: { kind: 'video', mime: 'video/x-msvideo' },
  mxf: { kind: 'video', mime: 'application/mxf' },
  // audio
  wav: { kind: 'audio', mime: 'audio/wav', inline: true },
  mp3: { kind: 'audio', mime: 'audio/mpeg', inline: true },
  ogg: { kind: 'audio', mime: 'audio/ogg', inline: true },
  m4a: { kind: 'audio', mime: 'audio/mp4', inline: true },
  flac: { kind: 'audio', mime: 'audio/flac', inline: true },
  aif: { kind: 'audio', mime: 'audio/aiff' },
  aiff: { kind: 'audio', mime: 'audio/aiff' },
  // images
  png: { kind: 'image', mime: 'image/png', inline: true },
  jpg: { kind: 'image', mime: 'image/jpeg', inline: true },
  jpeg: { kind: 'image', mime: 'image/jpeg', inline: true },
  gif: { kind: 'image', mime: 'image/gif', inline: true },
  webp: { kind: 'image', mime: 'image/webp', inline: true },
  tif: { kind: 'image', mime: 'image/tiff' },
  tiff: { kind: 'image', mime: 'image/tiff' },
  exr: { kind: 'image', mime: 'image/x-exr' },
  hdr: { kind: 'image', mime: 'image/vnd.radiance' },
  psd: { kind: 'image', mime: 'image/vnd.adobe.photoshop' },
  ai: { kind: 'image', mime: 'application/postscript' },
  svg: { kind: 'image', mime: 'image/svg+xml' }, // never inline: SVG can carry script
  // color
  cube: { kind: 'lut', mime: 'text/plain' },
  '3dl': { kind: 'lut', mime: 'text/plain' },
  look: { kind: 'lut', mime: 'application/xml' },
  xmp: { kind: 'lut', mime: 'application/xml' },
  dcp: { kind: 'lut', mime: 'application/octet-stream' },
  // projects, templates & presets
  aep: { kind: 'project' }, aet: { kind: 'project' }, prproj: { kind: 'project' }, drp: { kind: 'project' },
  drfx: { kind: 'project' }, setting: { kind: 'project' }, comp: { kind: 'project' }, motn: { kind: 'project' },
  moti: { kind: 'project' }, moef: { kind: 'project' }, mogrt: { kind: 'preset' }, ffx: { kind: 'preset' },
  prfpset: { kind: 'preset' }, fcpxml: { kind: 'project' }, json: { kind: 'project' }, lottie: { kind: 'project' },
  // 3d
  blend: { kind: 'model' }, c4d: { kind: 'model' }, fbx: { kind: 'model' }, obj: { kind: 'model' },
  glb: { kind: 'model' }, gltf: { kind: 'model' }, abc: { kind: 'model' }, usdz: { kind: 'model' }, stl: { kind: 'model' },
  // fonts
  ttf: { kind: 'font' }, otf: { kind: 'font' },
  // archives & docs
  zip: { kind: 'archive' }, '7z': { kind: 'archive' }, rar: { kind: 'archive' },
  pdf: { kind: 'document' }, txt: { kind: 'document' }, srt: { kind: 'document' },
};

const KINDS = {
  video: { name: 'Video', icon: 'film' },
  audio: { name: 'Audio', icon: 'wave' },
  image: { name: 'Image', icon: 'image' },
  lut: { name: 'LUT / Look', icon: 'palette' },
  project: { name: 'Project file', icon: 'layout' },
  preset: { name: 'Preset', icon: 'sliders' },
  model: { name: '3D file', icon: 'cube' },
  font: { name: 'Font', icon: 'type' },
  archive: { name: 'Archive', icon: 'box' },
  document: { name: 'Document', icon: 'file' },
};

// Separate preview / thumbnail uploads are limited to formats every browser can show.
const PREVIEW_EXTS = ['mp4', 'webm', 'm4v', 'mov', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
const THUMB_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

// Suggested category when a file is picked (used client side).
const KIND_CATEGORY = {
  video: 'footage', audio: 'sfx', image: 'textures', lut: 'luts', project: 'templates',
  preset: 'presets', model: '3d', font: 'other', archive: 'other', document: 'other',
};

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const CATEGORY_MAP = byId(CATEGORIES);
const SOFTWARE_MAP = byId(SOFTWARE);
const LICENSE_MAP = byId(LICENSES);

function extOf(filename) {
  const m = /\.([a-z0-9]{1,10})$/i.exec(String(filename || ''));
  return m ? m[1].toLowerCase() : '';
}

module.exports = {
  CATEGORIES, SOFTWARE, LICENSES, FILE_TYPES, KINDS, PREVIEW_EXTS, THUMB_EXTS, KIND_CATEGORY,
  CATEGORY_MAP, SOFTWARE_MAP, LICENSE_MAP, extOf,
};
