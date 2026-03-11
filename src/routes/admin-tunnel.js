const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const tunnel = require('../tunnel');
const db = require('../db');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

/* GET /status -- tunnel status */
router.get('/status', (req, res) => {
  res.json(tunnel.getStatus());
});

/* POST /start -- start tunnel */
router.post('/start', (req, res) => {
  const result = tunnel.start();
  if (!result.ok) {
    return res.status(400).json({ error: { message: result.message } });
  }
  res.json({ status: 'starting' });
});

/* POST /stop -- stop tunnel */
router.post('/stop', (req, res) => {
  tunnel.stop();
  res.json({ status: 'stopped' });
});

/* GET /token -- check if a cloudflare tunnel token is configured */
router.get('/token', (req, res) => {
  const row = db.getDb().prepare(
    "SELECT value FROM ai_settings WHERE key = 'cloudflare_token'"
  ).get();
  const hasToken = !!(row && row.value);
  res.json({ configured: hasToken });
});

/* PUT /token -- save cloudflare tunnel token */
router.put('/token', (req, res) => {
  const token = (req.body.token || '').trim();

  /* Save to ai_settings table */
  db.getDb().prepare(
    'INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)'
  ).run('cloudflare_token', token);

  /* Also persist to .env so it survives server restarts */
  try {
    let content = '';
    if (fs.existsSync(ENV_PATH)) {
      content = fs.readFileSync(ENV_PATH, 'utf8');
    }
    if (content.includes('CLOUDFLARE_TOKEN=')) {
      content = content.replace(/CLOUDFLARE_TOKEN=.*/, 'CLOUDFLARE_TOKEN=' + token);
    } else {
      content = content.trimEnd() + '\nCLOUDFLARE_TOKEN=' + token + '\n';
    }
    fs.writeFileSync(ENV_PATH, content);
    process.env.CLOUDFLARE_TOKEN = token;
  } catch (err) {
    console.error('Failed to write CLOUDFLARE_TOKEN to .env:', err.message);
  }

  res.json({ ok: true });
});

module.exports = router;
