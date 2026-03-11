const express = require('express');
const router = express.Router();
const tunnel = require('../tunnel');

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

module.exports = router;
