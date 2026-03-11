const vm = require('vm');

const TIMEOUT_MS = 10000;

/*
 * Execute user-provided JS code in a sandboxed vm context.
 * The script has access to: req (method, path, query, headers, body)
 * and must call response.json() or response.send() to reply.
 */
function scriptHandler(req, res, config) {
  const code = config.code;
  if (!code) {
    return res.status(500).json({ error: 'No script code configured' });
  }

  /* Build a safe request object (no access to Express internals) */
  const safeReq = {
    method: req.method,
    path: req.path,
    query: { ...req.query },
    headers: { ...req.headers },
    body: req.body,
    ip: req.ip,
  };

  let responded = false;
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) {
      if (responded) return;
      responded = true;
      res.status(this.statusCode).json(data);
    },
    send(data) {
      if (responded) return;
      responded = true;
      res.status(this.statusCode).send(data);
    },
    set(key, val) {
      res.set(key, val);
      return this;
    },
  };

  const sandbox = {
    request: safeReq,
    response,
    console: { log: () => {}, error: () => {}, warn: () => {} },
    JSON,
    Math,
    Date,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
  };

  try {
    const script = new vm.Script(code, { timeout: TIMEOUT_MS });
    const context = vm.createContext(sandbox);
    script.runInContext(context, { timeout: TIMEOUT_MS });

    /* If script didn't respond, send a default */
    if (!responded) {
      res.status(200).json({ ok: true });
    }
  } catch (err) {
    if (!responded) {
      res.status(500).json({ error: 'Script execution failed: ' + err.message });
    }
  }
}

module.exports = scriptHandler;
