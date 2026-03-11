const http = require('http');
const https = require('https');
const { Readable } = require('stream');

const SKIP_REQ_HEADERS = new Set([
  'host', 'connection', 'transfer-encoding', 'keep-alive',
  'upgrade', 'http2-settings',
]);
const SKIP_RES_HEADERS = new Set([
  'transfer-encoding', 'connection', 'keep-alive',
]);

/*
 * Forward incoming request to the configured target URL.
 * Supports streaming/SSE responses for AI API proxying (tool use, etc.).
 *
 * Config options:
 *   target_url       - base URL to proxy to (required)
 *   strip_prefix     - path prefix to strip before forwarding (optional)
 *   forward_auth     - if true, forward the Authorization header as-is (optional)
 *   inject_auth      - Authorization header value to inject upstream (optional)
 */
async function proxyHandler(req, res, config) {
  const targetUrl = config.target_url;
  if (!targetUrl) {
    return res.status(502).json({ error: 'No target URL configured' });
  }

  /* Build upstream URL. If strip_prefix is set, replace it with the target path. */
  const target = new URL(targetUrl);
  let upstreamPath = req.originalUrl;

  if (config.strip_prefix) {
    const prefix = config.strip_prefix.replace(/\/$/, '');
    if (upstreamPath.startsWith(prefix)) {
      upstreamPath = upstreamPath.slice(prefix.length) || '/';
    }
  }

  /* Combine target's base path with the remaining request path */
  const basePath = target.pathname.replace(/\/$/, '');
  const fullPath = basePath + upstreamPath;

  /* Forward headers */
  const headers = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (SKIP_REQ_HEADERS.has(key.toLowerCase())) continue;
    /* Strip authorization unless forwarding is enabled */
    if (key.toLowerCase() === 'authorization' && !config.forward_auth) continue;
    headers[key] = val;
  }

  /* Inject upstream auth if configured */
  if (config.inject_auth) {
    headers['authorization'] = config.inject_auth;
  }

  /* Set host for upstream */
  headers['host'] = target.host;

  const isHttps = target.protocol === 'https:';
  const transport = isHttps ? https : http;
  const port = target.port || (isHttps ? 443 : 80);

  const options = {
    hostname: target.hostname,
    port,
    path: fullPath,
    method: req.method,
    headers,
  };

  /* Use native http/https for true streaming (no buffering) */
  const upstream = transport.request(options, (upstreamRes) => {
    res.status(upstreamRes.statusCode);

    /* Forward response headers */
    for (const [key, val] of Object.entries(upstreamRes.headers)) {
      if (SKIP_RES_HEADERS.has(key.toLowerCase())) continue;
      res.set(key, val);
    }

    /* Disable response buffering for SSE */
    const contentType = (upstreamRes.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('text/event-stream')) {
      res.flushHeaders();
    }

    /* Pipe the upstream response directly to the client */
    upstreamRes.pipe(res);
  });

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream request failed: ' + err.message });
    }
  });

  /* Forward request body */
  if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
    /* Use raw body if available, otherwise JSON-serialize */
    if (req.rawBody) {
      upstream.write(req.rawBody);
    } else {
      upstream.write(JSON.stringify(req.body));
    }
  }

  upstream.end();
}

module.exports = proxyHandler;
