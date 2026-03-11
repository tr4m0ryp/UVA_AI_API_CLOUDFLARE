const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

/* Keys the user can configure via the dashboard */
const EDITABLE_KEYS = ['PORT', 'CLOUDFLARED_CONFIG'];

/* Parse .env file into key-value object */
function readEnv() {
  const result = {};
  try {
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      result[key] = value;
    }
  } catch { /* file may not exist yet */ }
  return result;
}

/* Write key-value object back to .env, preserving non-editable keys */
function writeEnv(updates) {
  const current = readEnv();
  for (const [key, value] of Object.entries(updates)) {
    if (!EDITABLE_KEYS.includes(key)) continue;
    current[key] = value;
  }

  const lines = [];
  for (const [key, value] of Object.entries(current)) {
    lines.push(key + '=' + value);
  }
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n');
}

/* GET / -- return editable settings */
router.get('/', (req, res) => {
  const env = readEnv();
  const settings = {};
  for (const key of EDITABLE_KEYS) {
    settings[key] = env[key] || '';
  }
  res.json(settings);
});

/* PUT / -- update settings */
router.put('/', (req, res) => {
  writeEnv(req.body);
  res.json({ ok: true });
});

module.exports = router;
