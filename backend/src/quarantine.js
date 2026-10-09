'use strict';
// With public custom domains, anyone holding an object's URL can fetch it. When moderators remove
// an asset we move its files to new random keys, so links that were shared stop working (Cloudflare
// may keep serving a cached copy until it expires). Restoring moves them back under fresh keys.

const FIELDS = [['file_key', 'f'], ['preview_key', 'p'], ['thumb_key', 't']];
const extOf = (key) => (/\.([a-z0-9]+)$/i.exec(key || '') || [])[1] || '';

async function relocate(models, storage, row, prefixFor, log) {
  const set = {};
  for (const [field, prefix] of FIELDS) {
    if (!row[field]) continue;
    const to = storage.newKey(prefixFor(prefix), extOf(row[field]));
    try {
      await storage.move(row[field], to);
      set[field] = to;
    } catch (err) {
      log.warn(`[quarantine] couldn't move ${field} of asset ${row.id}: ${err.message}`);
    }
  }
  if (Object.keys(set).length) await models.assets.setFields(row.id, set);
}

const quarantine = (models, storage, row, log = console) => relocate(models, storage, row, () => 'x', log);
const release = (models, storage, row, log = console) => relocate(models, storage, row, (prefix) => prefix, log);

module.exports = { quarantine, release };
