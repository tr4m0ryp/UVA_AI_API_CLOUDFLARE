const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { findFirefoxProfileDir } = require('./cookie-paths');

const DOMAIN = 'aichat.uva.nl';
const COOKIE_NAMES = [
  'next-auth.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
];

/*
 * Find the most recently modified Firefox profile with a cookies.sqlite.
 */
function findCookiesDb() {
  const profileDir = findFirefoxProfileDir();
  if (!profileDir) return null;

  let newest = 0;
  let result = null;

  let entries;
  try { entries = fs.readdirSync(profileDir, { withFileTypes: true }); }
  catch { return null; }

  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const dbPath = path.join(profileDir, ent.name, 'cookies.sqlite');
    try {
      const stat = fs.statSync(dbPath);
      if (stat.mtimeMs > newest) {
        newest = stat.mtimeMs;
        result = dbPath;
      }
    } catch { /* not found, skip */ }
  }
  return result;
}

/*
 * Extract cookies for aichat.uva.nl from a Firefox cookies.sqlite.
 * Copies the DB first since Firefox holds a lock.
 * Uses better-sqlite3 (no sqlite3 CLI dependency).
 * Returns "name=value" string or null.
 */
function extractFirefoxCookies() {
  const dbPath = findCookiesDb();
  if (!dbPath) return null;

  const tmp = path.join(os.tmpdir(), `uva_ff_cookies_${process.pid}.sqlite`);
  try {
    fs.copyFileSync(dbPath, tmp);
    /* Copy WAL and SHM if present for consistency */
    const walSrc = dbPath + '-wal';
    if (fs.existsSync(walSrc)) {
      fs.copyFileSync(walSrc, tmp + '-wal');
    }
    const shmSrc = dbPath + '-shm';
    if (fs.existsSync(shmSrc)) {
      fs.copyFileSync(shmSrc, tmp + '-shm');
    }
  } catch {
    return null;
  }

  let db;
  try {
    db = new Database(tmp, { readonly: true, fileMustExist: true });

    const rows = db.prepare(
      "SELECT name, value FROM moz_cookies WHERE host LIKE ? ORDER BY name"
    ).all(`%${DOMAIN}%`);

    if (rows.length === 0) return null;

    /* Find a session token cookie */
    for (const row of rows) {
      for (const cookieName of COOKIE_NAMES) {
        if (row.name === cookieName && row.value) {
          return row.name + '=' + row.value;
        }
      }
    }

    /* Return all cookies joined if no specific session token found */
    return rows.map(r => r.name + '=' + r.value).join('; ');
  } catch {
    return null;
  } finally {
    if (db) try { db.close(); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
    try { fs.unlinkSync(tmp + '-wal'); } catch {}
    try { fs.unlinkSync(tmp + '-shm'); } catch {}
  }
}

module.exports = { extractFirefoxCookies };
