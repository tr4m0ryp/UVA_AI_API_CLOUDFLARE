const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');
const { findChromeCookiesDb } = require('./cookie-paths');

const CHROME_SALT = 'saltysalt';
const CHROME_KEY_LEN = 16;
const CHROME_IV_LEN = 16;
const CHROME_ITER = 1;

/*
 * Derive Chrome decryption key via PBKDF2.
 * Tries gnome-keyring first, falls back to "peanuts".
 */
function deriveChromeKey() {
  let password = 'peanuts';

  try {
    const result = execSync(
      'secret-tool lookup application chrome 2>/dev/null',
      { encoding: 'utf8', timeout: 3000 }
    ).trim();
    if (result) password = result;
  } catch { /* fallback to peanuts */ }

  return crypto.pbkdf2Sync(
    password, CHROME_SALT, CHROME_ITER, CHROME_KEY_LEN, 'sha1'
  );
}

/*
 * Decrypt a Chrome v10-encrypted cookie value.
 * Format: "v10" (3 bytes) + IV (16 bytes) + ciphertext
 */
function decryptV10(encrypted, key) {
  if (encrypted.length < 3 + CHROME_IV_LEN + 1) return null;
  if (encrypted.slice(0, 3).toString() !== 'v10') return null;

  const iv = encrypted.slice(3, 3 + CHROME_IV_LEN);
  const ciphertext = encrypted.slice(3 + CHROME_IV_LEN);

  try {
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let plain = decipher.update(ciphertext);
    plain = Buffer.concat([plain, decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

/*
 * Extract a specific cookie from Chrome/Chromium for a given domain.
 * Uses better-sqlite3 (no sqlite3 CLI dependency).
 * Returns the cookie value or null.
 */
function extractChromeCookie(domain, name) {
  const dbPath = findChromeCookiesDb();
  if (!dbPath) return null;

  const tmp = path.join(os.tmpdir(), `uva_chrome_${process.pid}.sqlite`);

  try {
    fs.copyFileSync(dbPath, tmp);
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

    const row = db.prepare(
      'SELECT encrypted_value, value FROM cookies WHERE host_key LIKE ? AND name = ? ORDER BY last_access_utc DESC LIMIT 1'
    ).get(`%${domain}%`, name);

    if (!row) return null;

    /* Try encrypted value first */
    if (row.encrypted_value && row.encrypted_value.length > 3) {
      const key = deriveChromeKey();
      const decrypted = decryptV10(row.encrypted_value, key);
      if (decrypted) return decrypted;
    }

    /* Fall back to plaintext */
    if (row.value) return row.value;
    return null;
  } catch {
    return null;
  } finally {
    if (db) try { db.close(); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
    try { fs.unlinkSync(tmp + '-wal'); } catch {}
    try { fs.unlinkSync(tmp + '-shm'); } catch {}
  }
}

module.exports = { extractChromeCookie };
