/*
 * Return a fixed response (JSON body, status code, custom headers).
 */
function staticHandler(req, res, config) {
  const status = config.status_code || 200;
  const headers = config.headers || {};
  let body = config.body;

  for (const [key, val] of Object.entries(headers)) {
    res.set(key, val);
  }

  if (typeof body === 'object') {
    res.status(status).json(body);
  } else {
    res.status(status).send(body || '');
  }
}

module.exports = staticHandler;
