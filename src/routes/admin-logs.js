const express = require('express');
const router = express.Router();
const db = require('../db');

/* GET / -- paginated log queries */
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const endpointId = req.query.endpoint_id;
  const method = req.query.method;

  let where = [];
  let params = [];

  if (endpointId) {
    where.push('endpoint_id = ?');
    params.push(endpointId);
  }
  if (method) {
    where.push('method = ?');
    params.push(method.toUpperCase());
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const rows = db.getDb().prepare(`
    SELECT * FROM request_logs ${whereClause}
    ORDER BY timestamp DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.getDb().prepare(
    `SELECT COUNT(*) as count FROM request_logs ${whereClause}`
  ).get(...params);

  res.json({ logs: rows, total: total.count, limit, offset });
});

/* GET /stats -- aggregate stats */
router.get('/stats', (req, res) => {
  const d = db.getDb();

  const totalRequests = d.prepare(
    'SELECT COUNT(*) as count FROM request_logs'
  ).get().count;

  const today = d.prepare(
    "SELECT COUNT(*) as count FROM request_logs WHERE timestamp >= date('now')"
  ).get().count;

  const avgDuration = d.prepare(
    'SELECT AVG(duration_ms) as avg FROM request_logs'
  ).get().avg || 0;

  const errorCount = d.prepare(
    'SELECT COUNT(*) as count FROM request_logs WHERE status_code >= 400'
  ).get().count;

  const topEndpoints = d.prepare(`
    SELECT path, method, COUNT(*) as hits
    FROM request_logs
    GROUP BY path, method
    ORDER BY hits DESC
    LIMIT 5
  `).all();

  res.json({
    total_requests: totalRequests,
    today,
    avg_duration_ms: Math.round(avgDuration),
    error_count: errorCount,
    top_endpoints: topEndpoints,
  });
});

module.exports = router;
