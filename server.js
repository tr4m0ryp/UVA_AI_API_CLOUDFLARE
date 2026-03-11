const express = require('express');
const path = require('path');
const config = require('./src/config');
const db = require('./src/db');
const errorHandler = require('./src/middleware/error-handler');

const app = express();

/* CORS for external tool access (Claude Code, Codex, etc.) */
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/* Parse JSON body and keep raw buffer for proxy forwarding */
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

/* Serve dashboard static files */
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

/* Health check */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/* Admin API routes */
const authMiddleware = require('./src/middleware/auth');
const adminAuth = require('./src/routes/admin-auth');
const adminEndpoints = require('./src/routes/admin-endpoints');
const adminLogs = require('./src/routes/admin-logs');
const adminOverview = require('./src/routes/admin-overview');
const adminTunnel = require('./src/routes/admin-tunnel');
const adminAi = require('./src/routes/admin-ai');
const adminSettings = require('./src/routes/admin-settings');
const responsesRouter = require('./src/responses');

app.use('/api/admin/auth', adminAuth);
app.use('/api/admin/endpoints', authMiddleware, adminEndpoints);
app.use('/api/admin/logs', authMiddleware, adminLogs);
app.use('/api/admin/overview', authMiddleware, adminOverview);
app.use('/api/admin/tunnel', authMiddleware, adminTunnel);
app.use('/api/admin/ai', authMiddleware, adminAi);
app.use('/api/admin/settings', authMiddleware, adminSettings);

/* Responses API (mounted before dynamic router) */
app.use('/v1/responses', responsesRouter);

/* Redirect root to dashboard */
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

/* Dynamic user endpoints (must be last) */
const dynamicRouter = require('./src/dynamic-router');
app.use(dynamicRouter.middleware());

app.use(errorHandler);

/* Init DB and start */
db.init();
app.listen(config.port, () => {
  console.log(`API Gateway running on http://localhost:${config.port}`);
  console.log(`Dashboard: http://localhost:${config.port}/dashboard`);
});

/* Graceful shutdown */
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
