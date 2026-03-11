const db = require('../db');

const TTL_MS = 2 * 3600 * 1000; /* 2 hours */

function initSchema() {
  db.getDb().exec(`
    CREATE TABLE IF NOT EXISTS response_state (
      response_id TEXT PRIMARY KEY,
      messages_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function save(responseId, messagesJson) {
  db.getDb().prepare(
    'INSERT OR REPLACE INTO response_state (response_id, messages_json) VALUES (?, ?)'
  ).run(responseId, messagesJson);
}

function load(responseId) {
  const row = db.getDb().prepare(
    'SELECT messages_json, created_at FROM response_state WHERE response_id = ?'
  ).get(responseId);
  if (!row) return null;

  const created = new Date(row.created_at + 'Z');
  if (Date.now() - created.getTime() > TTL_MS) {
    remove(responseId);
    return null;
  }
  return row.messages_json;
}

function remove(responseId) {
  db.getDb().prepare(
    'DELETE FROM response_state WHERE response_id = ?'
  ).run(responseId);
}

module.exports = { initSchema, save, load, remove };
