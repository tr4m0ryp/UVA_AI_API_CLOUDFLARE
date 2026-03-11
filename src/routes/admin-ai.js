const express = require('express');
const router = express.Router();
const db = require('../db');

const VALID_KEYS = ['uva_cookie', 'default_model'];

/* GET / -- return all AI settings */
router.get('/', (req, res) => {
  const rows = db.getDb().prepare(
    'SELECT key, value FROM ai_settings'
  ).all();

  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

/* PUT / -- update AI settings */
router.put('/', (req, res) => {
  const upsert = db.getDb().prepare(
    'INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)'
  );

  const transaction = db.getDb().transaction((data) => {
    for (const [key, value] of Object.entries(data)) {
      if (!VALID_KEYS.includes(key)) continue;
      upsert.run(key, String(value));
    }
  });

  transaction(req.body);
  res.json({ ok: true });
});

module.exports = router;
