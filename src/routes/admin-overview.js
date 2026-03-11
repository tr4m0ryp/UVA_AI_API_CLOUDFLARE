const express = require('express');
const router = express.Router();
const db = require('../db');
const tunnel = require('../tunnel');

/* GET / -- dashboard summary stats */
router.get('/', (req, res) => {
  const d = db.getDb();

  const endpointCount = d.prepare(
    'SELECT COUNT(*) as count FROM endpoints'
  ).get().count;

  const activeEndpoints = d.prepare(
    'SELECT COUNT(*) as count FROM endpoints WHERE enabled = 1'
  ).get().count;

  const totalRequests = d.prepare(
    'SELECT COUNT(*) as count FROM request_logs'
  ).get().count;

  const todayRequests = d.prepare(
    "SELECT COUNT(*) as count FROM request_logs WHERE timestamp >= date('now')"
  ).get().count;

  const tunnelStatus = tunnel.getStatus();

  res.json({
    endpoints: { total: endpointCount, active: activeEndpoints },
    requests: { total: totalRequests, today: todayRequests },
    tunnel: tunnelStatus,
  });
});

module.exports = router;
