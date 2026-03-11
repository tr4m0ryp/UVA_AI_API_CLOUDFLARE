const express = require('express');
const router = express.Router();
const db = require('../db');

/* Reserved path prefixes that user endpoints cannot use */
const RESERVED = ['/dashboard', '/api/admin', '/health', '/favicon.ico'];

function isReserved(p) {
  const normalized = p.startsWith('/') ? p : '/' + p;
  return RESERVED.some(r => normalized === r || normalized.startsWith(r + '/'));
}

function validateEndpoint(body) {
  const { method, path, handler_type, config } = body;
  if (!method || !path || !handler_type) {
    return 'method, path, and handler_type are required';
  }
  if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL'].includes(method.toUpperCase())) {
    return 'Invalid HTTP method';
  }
  if (!['proxy', 'static', 'script'].includes(handler_type)) {
    return 'handler_type must be proxy, static, or script';
  }
  if (isReserved(path)) {
    return 'Path is reserved and cannot be used';
  }
  if (!path.startsWith('/')) {
    return 'Path must start with /';
  }

  /* Validate config per handler type */
  if (handler_type === 'proxy' && config) {
    if (!config.target_url) return 'proxy handler requires config.target_url';
  }
  if (handler_type === 'static' && config) {
    if (config.body === undefined) return 'static handler requires config.body';
  }
  if (handler_type === 'script' && config) {
    if (!config.code) return 'script handler requires config.code';
  }

  return null;
}

/* GET / -- list all endpoints */
router.get('/', (req, res) => {
  const rows = db.getDb().prepare(
    'SELECT * FROM endpoints ORDER BY created_at DESC'
  ).all();
  res.json(rows);
});

/* GET /:id -- get single endpoint */
router.get('/:id', (req, res) => {
  const row = db.getDb().prepare('SELECT * FROM endpoints WHERE id = ?')
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: { message: 'Not found' } });
  res.json(row);
});

/* POST / -- create endpoint */
router.post('/', (req, res) => {
  const err = validateEndpoint(req.body);
  if (err) return res.status(400).json({ error: { message: err } });

  const { method, path, handler_type, config, description } = req.body;
  try {
    const result = db.getDb().prepare(`
      INSERT INTO endpoints (method, path, handler_type, config, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      method.toUpperCase(),
      path,
      handler_type,
      JSON.stringify(config || {}),
      description || ''
    );

    /* Rebuild dynamic router */
    const dynamicRouter = require('../dynamic-router');
    dynamicRouter.rebuild();

    const created = db.getDb().prepare('SELECT * FROM endpoints WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({
        error: { message: 'An endpoint with this method and path already exists' }
      });
    }
    throw e;
  }
});

/* PUT /:id -- update endpoint */
router.put('/:id', (req, res) => {
  const existing = db.getDb().prepare('SELECT * FROM endpoints WHERE id = ?')
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: { message: 'Not found' } });

  const merged = { ...existing, ...req.body };
  /* Parse existing config if it's a string */
  if (typeof merged.config === 'string') {
    try { merged.config = JSON.parse(merged.config); } catch {}
  }

  const err = validateEndpoint(merged);
  if (err) return res.status(400).json({ error: { message: err } });

  try {
    db.getDb().prepare(`
      UPDATE endpoints SET method = ?, path = ?, handler_type = ?,
        config = ?, enabled = ?, description = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      merged.method.toUpperCase(),
      merged.path,
      merged.handler_type,
      JSON.stringify(merged.config || {}),
      merged.enabled !== undefined ? merged.enabled : 1,
      merged.description || '',
      req.params.id
    );

    const dynamicRouter = require('../dynamic-router');
    dynamicRouter.rebuild();

    const updated = db.getDb().prepare('SELECT * FROM endpoints WHERE id = ?')
      .get(req.params.id);
    res.json(updated);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({
        error: { message: 'An endpoint with this method and path already exists' }
      });
    }
    throw e;
  }
});

/* DELETE /:id -- delete endpoint */
router.delete('/:id', (req, res) => {
  const result = db.getDb().prepare('DELETE FROM endpoints WHERE id = ?')
    .run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: { message: 'Not found' } });
  }

  const dynamicRouter = require('../dynamic-router');
  dynamicRouter.rebuild();

  res.json({ status: 'deleted' });
});

module.exports = router;
