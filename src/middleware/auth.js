const { verifyToken } = require('../auth/jwt');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: { message: 'Invalid or expired token' } });
  }

  req.user = payload;
  next();
}

module.exports = authMiddleware;
