'use strict';
// Static taxonomy: categories, supported software, licenses and accepted file types.

const CATEGORIES = [
  { id: 'apps', name: 'Apps & Software', icon: 'code', hue: 200, blurb: 'Desktop, mobile and web apps, installers and portable builds.' },
  { id: 'devtools', name: 'Developer Tools & CLIs', icon: 'sliders', hue: 150, blurb: 'Command-line tools, dev servers, debuggers and build utilities.' },
  { id: 'plugins', name: 'Plugins & Extensions', icon: 'shapes', hue: 265, blurb: 'Editor, browser and app plugins, add-ons and integrations.' },
  { id: 'libraries', name: 'Libraries & SDKs', icon: 'box', hue: 175, blurb: 'Packages, SDKs, frameworks and API clients.' },
  { id: 'templates', name: 'Templates & Starters', icon: 'layout', hue: 190, blurb: 'Boilerplates, starter kits, UI kits and project templates.' },
  { id: 'scripts', name: 'Scripts & Automations', icon: 'transition', hue: 45, blurb: 'Scripts, workflows, bots and automation recipes.' },
  { id: 'ai', name: 'AI Models & Tools', icon: 'sparkles', hue: 290, blurb: 'Models, weights, prompts, agents and AI-powered tools.' },
  { id: 'games', name: 'Games & Mods', icon: 'cube', hue: 330, blurb: 'Games, mods, maps and game-dev assets.' },
  { id: 'design', name: 'Design Assets', icon: 'palette', hue: 25, blurb: 'Icons, fonts, mockups, textures, 3D models and design files.' },
  { id: 'media', name: 'Media & Audio', icon: 'film', hue: 210, blurb: 'Video, sound effects, music, LUTs and creative packs.' },
  { id: 'docs', name: 'Docs & Guides', icon: 'image', hue: 100, blurb: 'Documentation, e-books, cheat sheets and courses.' },
  { id: 'other', name: 'Other', icon: 'box', hue: 240, blurb: 'Everything else.' },
];

// Categories from the media-library days. Old links and stored products map onto the new ones.
const LEGACY_CATEGORIES = {
  footage: 'media', transitions: 'media', overlays: 'media', luts: 'media', motion: 'media', sfx: 'media', music: 'media',
  presets: 'templates', textures: 'design', '3d': 'design', software: 'apps',
};

// Platforms a product runs on (stored in the "software" column). Creative apps stay for older uploads.
const SOFTWARE = [
  { id: 'windows', name: 'Windows' },
  { id: 'macos', name: 'macOS' },
  { id: 'linux', name: 'Linux' },
  { id: 'web', name: 'Web' },
  { id: 'ios', name: 'iOS' },
  { id: 'android', name: 'Android' },
  { id: 'node', name: 'Node.js' },
  { id: 'python', name: 'Python' },
  { id: 'docker', name: 'Docker' },
  { id: 'vscode', name: 'VS Code' },
  { id: 'jetbrains', name: 'JetBrains IDEs' },
  { id: 'chrome', name: 'Chrome' },
  { id: 'firefox', name: 'Firefox' },
  { id: 'figma', name: 'Figma' },
  { id: 'unity', name: 'Unity' },
  { id: 'unreal', name: 'Unreal Engine' },
  { id: 'blender', name: 'Blender' },
  { id: 'ae', name: 'After Effects' },
  { id: 'pr', name: 'Premiere Pro' },
  { id: 'resolve', name: 'DaVinci Resolve' },
  { id: 'fcp', name: 'Final Cut Pro' },
  { id: 'motion', name: 'Apple Motion' },
  { id: 'c4d', name: 'Cinema 4D' },
  { id: 'capcut', name: 'CapCut' },
  { id: 'vegas', name: 'Vegas Pro' },
  { id: 'ps', name: 'Photoshop' },
  { id: 'any', name: 'Any platform' },
];

const LICENSES = [
  {
    id: 'mit', name: 'MIT License', short: 'MIT', url: 'https://opensource.org/license/mit',
    attribution: true, commercial: true, shareAlike: false,
    summary: 'Use, change and ship it anywhere, including commercially. Keep the copyright notice.',
  },
  {
    id: 'apache-2.0', name: 'Apache License 2.0', short: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0',
    attribution: true, commercial: true, shareAlike: false,
    summary: 'Use, change and ship it anywhere. Keep the notices and note your changes; includes a patent grant.',
  },
  {
    id: 'gpl-3.0', name: 'GNU GPL v3', short: 'GPL-3.0', url: 'https://www.gnu.org/licenses/gpl-3.0.html',
    attribution: true, commercial: true, shareAlike: true,
    summary: 'Use and change it freely; anything you distribute that builds on it must be GPL too, with source.',
  },
  {
    id: 'bsd-3', name: 'BSD 3-Clause', short: 'BSD-3', url: 'https://opensource.org/license/bsd-3-clause',
    attribution: true, commercial: true, shareAlike: false,
    summary: 'Use it anywhere. Keep the notice and don’t use the author’s name to promote your product.',
  },
  {
    id: 'proprietary', name: 'Proprietary (free download)', short: 'Proprietary', url: '/licenses#proprietary',
    attribution: false, commercial: true, shareAlike: false, noResale: true,
    summary: 'Free to download and use as the developer intends. All other rights reserved; see the product’s own terms.',
  },
  {
    id: 'cc0', name: 'CC0 1.0 (Public Domain)', short: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: false, commercial: true, shareAlike: false,
    summary: 'No rights reserved. Use it for anything, no credit needed.',
  },
  {
    id: 'free', name: 'Free Use License', short: 'Free Use', url: '/licenses#free',
    attribution: false, commercial: true, shareAlike: false, noResale: true,
    summary: 'Use it in personal and commercial projects without credit. Just don’t resell or re-upload the asset itself.',
  },
  {
    id: 'cc-by', name: 'CC BY 4.0 (Attribution)', short: 'CC BY', url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: true, commercial: true, shareAlike: false,
    summary: 'Use it for anything, including commercial work, as long as you credit the creator.',
  },
  {
    id: 'cc-by-sa', name: 'CC BY-SA 4.0 (Attribution-ShareAlike)', short: 'CC BY-SA', url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    attribution: true, commercial: true, shareAlike: true,
    summary: 'Credit the creator, and share modified versions of the asset under the same license.',
  },
  {
    id: 'cc-by-nc', name: 'CC BY-NC 4.0 (Attribution-NonCommercial)', short: 'CC BY-NC', url: 'https://creativecommons.org/licenses/by-nc/4.0/',
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
  // software: installers, apps, plugins and scripts. Always served as an opaque download, never inline.
  exe: { kind: 'software' }, msi: { kind: 'software' }, dmg: { kind: 'software' }, pkg: { kind: 'software' },
  appimage: { kind: 'software' }, deb: { kind: 'software' }, rpm: { kind: 'software' }, apk: { kind: 'software' },
  zxp: { kind: 'software' }, aex: { kind: 'software' }, ofx: { kind: 'software' }, jsx: { kind: 'software' }, jsxbin: { kind: 'software' },
  msix: { kind: 'software' }, appx: { kind: 'software' }, ipa: { kind: 'software' }, aab: { kind: 'software' }, xapk: { kind: 'software' },
  snap: { kind: 'software' }, flatpak: { kind: 'software' }, app: { kind: 'software' },
  // packages & extensions
  vsix: { kind: 'package' }, crx: { kind: 'package' }, xpi: { kind: 'package' }, whl: { kind: 'package' }, jar: { kind: 'package' },
  war: { kind: 'package' }, nupkg: { kind: 'package' }, gem: { kind: 'package' }, wasm: { kind: 'package' }, unitypackage: { kind: 'package' },
  // scripts & source
  sh: { kind: 'code' }, ps1: { kind: 'code' }, bat: { kind: 'code' }, py: { kind: 'code' }, js: { kind: 'code' }, ts: { kind: 'code' },
  lua: { kind: 'code' }, rb: { kind: 'code' }, go: { kind: 'code' }, rs: { kind: 'code' }, sql: { kind: 'code' }, ipynb: { kind: 'code' },
  yml: { kind: 'code' }, yaml: { kind: 'code' }, toml: { kind: 'code' },
  // AI models
  gguf: { kind: 'ai' }, safetensors: { kind: 'ai' }, onnx: { kind: 'ai' }, pt: { kind: 'ai' }, ckpt: { kind: 'ai' }, tflite: { kind: 'ai' },
  // more archives, design and docs
  tar: { kind: 'archive' }, gz: { kind: 'archive' }, tgz: { kind: 'archive' }, bz2: { kind: 'archive' }, xz: { kind: 'archive' },
  zst: { kind: 'archive' }, iso: { kind: 'archive' },
  fig: { kind: 'design' }, sketch: { kind: 'design' }, xd: { kind: 'design' }, woff: { kind: 'font' }, woff2: { kind: 'font' },
  md: { kind: 'document' }, epub: { kind: 'document' }, csv: { kind: 'document' },
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
  software: { name: 'Software', icon: 'code' },
  package: { name: 'Package / extension', icon: 'box' },
  code: { name: 'Script / source', icon: 'code' },
  ai: { name: 'AI model', icon: 'sparkles' },
  design: { name: 'Design file', icon: 'palette' },
};

// Separate preview / thumbnail uploads are limited to formats every browser can show.
const PREVIEW_EXTS = ['mp4', 'webm', 'm4v', 'mov', 'png', 'jpg', 'jpeg', 'gif', 'webp'];
const THUMB_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

// Suggested category when a file is picked (used client side).
const KIND_CATEGORY = {
  video: 'media', audio: 'media', image: 'design', lut: 'media', project: 'templates', preset: 'templates', model: 'design',
  font: 'design', archive: 'other', document: 'docs', software: 'apps', package: 'plugins', code: 'scripts', ai: 'ai', design: 'design',
};

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const CATEGORY_MAP = byId(CATEGORIES);
const SOFTWARE_MAP = byId(SOFTWARE);
const LICENSE_MAP = byId(LICENSES);

// A category id from a form or link, with the old media-library ids mapped onto the new ones.
const normalizeCategory = (id) => (CATEGORY_MAP[id] ? id : LEGACY_CATEGORIES[id] || '');

function extOf(filename) {
  const m = /\.([a-z0-9]{1,10})$/i.exec(String(filename || ''));
  return m ? m[1].toLowerCase() : '';
}

module.exports = {
  CATEGORIES, LEGACY_CATEGORIES, SOFTWARE, LICENSES, FILE_TYPES, KINDS, PREVIEW_EXTS, THUMB_EXTS, KIND_CATEGORY,
  CATEGORY_MAP, SOFTWARE_MAP, LICENSE_MAP, extOf, normalizeCategory,
};
