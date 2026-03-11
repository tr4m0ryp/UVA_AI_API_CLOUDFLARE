const Database = require('better-sqlite3');
const config = require('./config');

let db;

function init() {
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS endpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL DEFAULT 'GET',
      path TEXT NOT NULL,
      handler_type TEXT NOT NULL CHECK(handler_type IN ('proxy', 'static', 'script')),
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(method, path)
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id INTEGER,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      client_ip TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL UNIQUE,
      uva_cookie TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_endpoint ON request_logs(endpoint_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

    CREATE TABLE IF NOT EXISTS response_state (
      response_id TEXT PRIMARY KEY,
      messages_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

function getDb() {
  if (!db) init();
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { init, getDb, close };
