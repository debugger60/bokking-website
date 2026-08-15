'use strict';

/**
 * CineBook AI — database connection module
 *
 * Opens the SQLite database (better-sqlite3), enables WAL mode and
 * foreign keys, and applies schema.sql on startup. The schema is fully
 * idempotent (CREATE TABLE IF NOT EXISTS), so this is safe to run on
 * every server start.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Resolve the database file path.
 *  - DB_PATH env var wins (relative paths resolved from project root)
 *  - otherwise defaults to database/cinebook.db
 */
function resolveDbPath() {
  if (process.env.DB_PATH) {
    return path.isAbsolute(process.env.DB_PATH)
      ? process.env.DB_PATH
      : path.join(PROJECT_ROOT, process.env.DB_PATH);
  }
  return path.join(__dirname, 'cinebook.db');
}

const DB_PATH = resolveDbPath();

// Make sure the parent directory exists before opening the file.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL improves concurrent read performance and crash safety.
db.pragma('journal_mode = WAL');
// Enforce foreign key constraints (SQLite keeps them off by default).
db.pragma('foreign_keys = ON');

// Apply schema (idempotent).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

module.exports = db;
module.exports.DB_PATH = DB_PATH;
