const express = require('express');
const db = require('./db');
const requestLogger = require('./middleware/logger');
const proxyHandler = require('./handlers/proxy-handler');
const staticHandler = require('./handlers/static-handler');
const scriptHandler = require('./handlers/script-handler');

let currentRouter = null;

/*
 * Build an Express router from all enabled endpoints in the DB.
 * Supports wildcard paths: "/v1/*" matches all sub-paths under /v1/.
 * For wildcard proxy endpoints, strip_prefix is auto-set to the base path.
 */
function buildRouter() {
  const router = express.Router();
  const endpoints = db.getDb().prepare(
    'SELECT * FROM endpoints WHERE enabled = 1'
  ).all();

  for (const ep of endpoints) {
    const config = JSON.parse(ep.config || '{}');
    const handler = getHandler(ep.handler_type);
    const isWildcard = ep.path.endsWith('/*');

    /* For wildcard proxy routes, auto-set strip_prefix so the sub-path is forwarded */
    if (isWildcard && ep.handler_type === 'proxy' && !config.strip_prefix) {
      config.strip_prefix = ep.path.replace(/\/\*$/, '');
    }

    /* Convert /v1/* to Express route pattern /v1/* (Express handles this) */
    const routePath = isWildcard ? ep.path.replace(/\/\*$/, '/*') : ep.path;

    /* For wildcard endpoints, use router.all or router.use to match any sub-path.
     * For "ALL" method, match any HTTP method on this path. */
    if (ep.method === 'ALL') {
      router.all(routePath, requestLogger(ep.id), makeHandler(handler, config));
    } else {
      const method = ep.method.toLowerCase();
      if (!router[method]) continue;
      router[method](routePath, requestLogger(ep.id), makeHandler(handler, config));
    }
  }

  return router;
}

function makeHandler(handler, config) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, config);
      if (result && typeof result.catch === 'function') {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

function getHandler(type) {
  switch (type) {
    case 'proxy': return proxyHandler;
    case 'static': return staticHandler;
    case 'script': return scriptHandler;
    default: return (req, res) => res.status(500).json({ error: 'Unknown handler' });
  }
}

/*
 * Rebuild the router (called after endpoint CRUD).
 */
function rebuild() {
  currentRouter = buildRouter();
}

/*
 * Express middleware that delegates to the current dynamic router.
 */
function middleware() {
  /* Build on first use */
  currentRouter = buildRouter();

  return (req, res, next) => {
    currentRouter(req, res, next);
  };
}

module.exports = { middleware, rebuild };
