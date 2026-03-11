const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
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
 * Returns the cookie value or null.
 */
function extractChromeCookie(domain, name) {
  const dbPath = findChromeCookiesDb();
  if (!dbPath) return null;

  return readCookieFromDb(dbPath, domain, name);
}

function readCookieFromDb(dbPath, domain, name) {
  const tmp = path.join(os.tmpdir(), `uva_chrome_${process.pid}.sqlite`);

  try {
    fs.copyFileSync(dbPath, tmp);
    const walSrc = dbPath + '-wal';
    if (fs.existsSync(walSrc)) {
      fs.copyFileSync(walSrc, tmp + '-wal');
    }
  } catch {
    return null;
  }

  try {
    /* Use sqlite3 CLI to get the encrypted_value as hex */
    const sql = `SELECT hex(encrypted_value), value FROM cookies WHERE host_key LIKE '%${domain}%' AND name = '${name}' ORDER BY last_access_utc DESC LIMIT 1;`;
    const output = execSync(`sqlite3 '${tmp}' "${sql}" 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();

    if (!output) return null;

    /* sqlite3 outputs: hex_encrypted|plaintext_value */
    const parts = output.split('|');
    const hexEnc = parts[0];
    const plainValue = parts[1] || '';

    /* Try encrypted value first */
    if (hexEnc && hexEnc.length > 6) {
      const key = deriveChromeKey();
      const encrypted = Buffer.from(hexEnc, 'hex');
      const decrypted = decryptV10(encrypted, key);
      if (decrypted) return decrypted;
    }

    /* Fall back to plaintext */
    if (plainValue) return plainValue;
    return null;
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
    try { fs.unlinkSync(tmp + '-wal'); } catch {}
  }
}

module.exports = { extractChromeCookie };
