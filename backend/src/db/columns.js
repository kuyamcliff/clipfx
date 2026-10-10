'use strict';
// Columns added after the first release. Both drivers add whichever are missing on startup,
// so existing databases (Supabase in production) upgrade themselves without a migration step.
// Types are written for Postgres; SQLite accepts them as is.
module.exports = {
  users: [
    ['avatar_key', 'TEXT'],
    ['socials', "TEXT NOT NULL DEFAULT '{}'"],
    ['is_system', 'INTEGER NOT NULL DEFAULT 0'],
  ],
  assets: [
    ['password_hash', 'TEXT'],
    ['expires_at', 'BIGINT'],
    ['max_downloads', 'INTEGER'],
    ['manage_hash', 'TEXT'],
  ],
  uploads: [
    ['anon_hash', 'TEXT'],
  ],
};
