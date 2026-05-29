import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { vaultPaths } from './paths.js';

/**
 * SQLite Records DB. Schema is adapted from the original Hermes vault
 * (hybrid records table: common typed columns + per-category `extras` JSON).
 * Local device id replaces the old Telegram chat_id.
 */
export type DB = Database.Database;

const MIGRATIONS: string[] = [
  // v1: core capture + session + record model
  `
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL DEFAULT 'local',
    opened_at   TEXT NOT NULL,
    closed_at   TEXT,
    status      TEXT NOT NULL CHECK(status IN ('open','closed','validated','persisted'))
  );

  CREATE TABLE IF NOT EXISTS captures (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id),
    received_at   TEXT NOT NULL,
    text          TEXT NOT NULL,
    journal_path  TEXT NOT NULL,
    kind          TEXT NOT NULL DEFAULT 'text',   -- 'text' | 'voice'
    attachment_path TEXT,
    skip_extract  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_captures_session ON captures(session_id);

  CREATE TABLE IF NOT EXISTS records (
    id               TEXT PRIMARY KEY,
    session_id       TEXT NOT NULL REFERENCES sessions(id),
    category         TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    state            TEXT NOT NULL DEFAULT 'proposed'
      CHECK(state IN ('proposed','active','doing','done','archived','snoozed','dismissed')),
    state_changed_at TEXT NOT NULL,
    headline         TEXT,
    notes            TEXT,
    extras           TEXT NOT NULL DEFAULT '{}'    -- category-specific JSON
  );
  CREATE INDEX IF NOT EXISTS idx_records_session  ON records(session_id);
  CREATE INDEX IF NOT EXISTS idx_records_category ON records(category);
  CREATE INDEX IF NOT EXISTS idx_records_state    ON records(state);

  CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
  `,
];

export function openDb(): DB {
  mkdirSync(vaultPaths.root, { recursive: true });
  const db = new Database(vaultPaths.dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec(MIGRATIONS[v]!);
    db.pragma(`user_version = ${v + 1}`);
  }
  return db;
}
