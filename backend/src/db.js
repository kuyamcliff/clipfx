'use strict';
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  software TEXT NOT NULL DEFAULT ',',
  tags TEXT NOT NULL DEFAULT ',',
  license TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  file_name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_ext TEXT NOT NULL,
  file_kind TEXT NOT NULL,
  file_sha256 TEXT NOT NULL DEFAULT '',
  preview_key TEXT,
  preview_ext TEXT,
  thumb_key TEXT,
  width INTEGER,
  height INTEGER,
  duration REAL,
  media_status TEXT NOT NULL DEFAULT 'none',
  downloads INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  removed_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assets_listing ON assets(status, visibility, created_at);
CREATE INDEX IF NOT EXISTS assets_user ON assets(user_id, created_at);
CREATE INDEX IF NOT EXISTS assets_category ON assets(category, created_at);
CREATE INDEX IF NOT EXISTS assets_hash ON assets(file_sha256);

CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
  title, description, tags, content='assets', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS assets_fts_insert AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(rowid, title, description, tags) VALUES (new.id, new.title, new.description, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS assets_fts_delete AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, title, description, tags) VALUES ('delete', old.id, old.title, old.description, old.tags);
END;
CREATE TRIGGER IF NOT EXISTS assets_fts_update AFTER UPDATE OF title, description, tags ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, title, description, tags) VALUES ('delete', old.id, old.title, old.description, old.tags);
  INSERT INTO assets_fts(rowid, title, description, tags) VALUES (new.id, new.title, new.description, new.tags);
END;

CREATE TABLE IF NOT EXISTS daily_downloads (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (asset_id, day)
);
CREATE INDEX IF NOT EXISTS daily_downloads_day ON daily_downloads(day);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, asset_id)
);
CREATE INDEX IF NOT EXISTS favorites_asset ON favorites(asset_id);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status, created_at);

-- Files the browser is uploading (or has uploaded) straight to storage but that aren't
-- attached to an asset yet. Rows left behind are cleaned up after a day.
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  field TEXT NOT NULL,
  file_name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  multipart_id TEXT,
  part_size INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS uploads_user ON uploads(user_id);
CREATE INDEX IF NOT EXISTS uploads_created ON uploads(created_at);

-- Files removed for copyright / abuse can't simply be uploaded again.
CREATE TABLE IF NOT EXISTS blocked_hashes (
  sha256 TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  return db;
}

function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction };
