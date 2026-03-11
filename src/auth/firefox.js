const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
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
 * Returns "name=value" string or null.
 */
function extractFirefoxCookies() {
  const dbPath = findCookiesDb();
  if (!dbPath) return null;

  const tmp = path.join(os.tmpdir(), `uva_ff_cookies_${process.pid}.sqlite`);
  try {
    fs.copyFileSync(dbPath, tmp);
    /* Copy WAL if present */
    const walSrc = dbPath + '-wal';
    if (fs.existsSync(walSrc)) {
      fs.copyFileSync(walSrc, tmp + '-wal');
    }
  } catch {
    return null;
  }

  try {
    /* Query via sqlite3 CLI */
    const sql = `SELECT name || '=' || value FROM moz_cookies WHERE host LIKE '%${DOMAIN}%' ORDER BY name;`;
    const output = execSync(`sqlite3 '${tmp}' "${sql}" 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();

    if (!output) return null;

    /* Find a session token cookie */
    const lines = output.split('\n');
    for (const line of lines) {
      for (const name of COOKIE_NAMES) {
        if (line.startsWith(name + '=')) {
          return line;
        }
      }
    }
    /* Return all cookies joined if no specific session token found */
    return lines.join('; ');
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
    try { fs.unlinkSync(tmp + '-wal'); } catch {}
  }
}

module.exports = { extractFirefoxCookies };
