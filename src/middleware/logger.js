const db = require('../db');

/*
 * Log requests to user-defined endpoints.
 * Captures method, path, status, duration, and client IP.
 */
function requestLogger(endpointId) {
  return function(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const clientIp = req.ip || req.connection.remoteAddress || '';

      try {
        db.getDb().prepare(`
          INSERT INTO request_logs (endpoint_id, method, path, status_code, duration_ms, client_ip)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(endpointId, req.method, req.originalUrl, res.statusCode, duration, clientIp);
      } catch { /* ignore logging errors */ }
    });

    next();
  };
}

module.exports = requestLogger;
