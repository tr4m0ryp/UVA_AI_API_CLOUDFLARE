const express = require('express');
const router = express.Router();
const browserLogin = require('../auth/browser-login');
const authMiddleware = require('../middleware/auth');
const db = require('../db');

/* POST /api/admin/auth/browser-login -- start browser login flow */
router.post('/browser-login', async (req, res) => {
  const result = await browserLogin.startLogin();
  if (!result.ok) {
    return res.status(409).json({ error: { message: result.message } });
  }
  /* If existing cookies were found, login completed instantly */
  const status = browserLogin.getStatus();
  res.json(status);
});

/* GET /api/admin/auth/browser-status -- poll login status */
router.get('/browser-status', (req, res) => {
  res.json(browserLogin.getStatus());
});

/* POST /api/admin/auth/browser-cancel -- cancel login */
router.post('/browser-cancel', (req, res) => {
  browserLogin.cancelLogin();
  res.json({ status: 'cancelled' });
});

/* GET /api/admin/auth/me -- get current user (requires auth) */
router.get('/me', authMiddleware, (req, res) => {
  res.json({ email: req.user.email, name: req.user.name || '' });
});

/* POST /api/admin/auth/logout -- invalidate session */
router.post('/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization.slice(7);
  try {
    db.getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  } catch { /* ignore */ }
  res.json({ status: 'ok' });
});

module.exports = router;
