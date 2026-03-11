const { exec } = require('child_process');
const { extractFirefoxCookies } = require('./firefox');
const { extractChromeCookie } = require('./chrome');
const { validateSession } = require('./session-validator');
const { signToken } = require('./jwt');
const db = require('../db');

const COOKIE_NAMES = [
  'next-auth.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
];

const DOMAIN = 'aichat.uva.nl';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

/* Global login state (single-user system) */
let loginState = { status: 'idle' };
let pollTimer = null;

function getStatus() {
  return { ...loginState };
}

/*
 * Start the browser login flow:
 * 1. Open aichat.uva.nl in the default browser
 * 2. Poll browser cookie databases for a valid session
 */
function startLogin() {
  if (loginState.status === 'pending') {
    return { ok: false, message: 'Login already in progress' };
  }

  loginState = { status: 'pending' };

  /* Open browser */
  exec('xdg-open https://aichat.uva.nl 2>/dev/null');

  /* Start polling cookies */
  const startTime = Date.now();
  pollTimer = setInterval(async () => {
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      cancelLogin();
      loginState = { status: 'error', message: 'Login timed out' };
      return;
    }

    const cookie = tryExtractCookie();
    if (!cookie) return;

    const session = await validateSession(cookie);
    if (!session.valid) return;

    clearInterval(pollTimer);
    pollTimer = null;

    /* Issue JWT and store session */
    const token = signToken({ email: session.email, name: session.name });

    const d = db.getDb();
    d.prepare(`
      INSERT INTO sessions (email, name, token, uva_cookie)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        uva_cookie = excluded.uva_cookie,
        updated_at = datetime('now')
    `).run(session.email, session.name, token, cookie);

    loginState = {
      status: 'success',
      token,
      email: session.email,
      name: session.name,
    };
  }, POLL_INTERVAL_MS);

  return { ok: true };
}

function cancelLogin() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  loginState = { status: 'idle' };
}

/*
 * Try all browsers for a valid session cookie.
 */
function tryExtractCookie() {
  /* Firefox first */
  const ffCookie = extractFirefoxCookies();
  if (ffCookie) {
    for (const name of COOKIE_NAMES) {
      if (ffCookie.includes(name + '=')) return ffCookie;
    }
  }

  /* Chrome/Chromium */
  for (const name of COOKIE_NAMES) {
    const value = extractChromeCookie(DOMAIN, name);
    if (value) return `${name}=${value}`;
  }

  return null;
}

module.exports = { startLogin, cancelLogin, getStatus };
