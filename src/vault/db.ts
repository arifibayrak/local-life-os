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
  // v2: finance — payments + subscriptions (ported from brain's finance model).
  // Subscriptions are payments with type='recurring' (recurring_freq + bill_day).
  // project_id optionally links a payment to a project/event hub (added later).
  `
  CREATE TABLE IF NOT EXISTS payments (
    id             TEXT PRIMARY KEY,
    amount         REAL NOT NULL,
    currency       TEXT NOT NULL DEFAULT 'GBP',
    date           TEXT NOT NULL,                 -- YYYY-MM-DD
    direction      TEXT NOT NULL DEFAULT 'out'    -- 'out' (spend) | 'in' (income)
                     CHECK(direction IN ('out','in')),
    type           TEXT NOT NULL DEFAULT 'one-time'
                     CHECK(type IN ('one-time','recurring')),
    category       TEXT NOT NULL DEFAULT 'other',
    description    TEXT NOT NULL DEFAULT '',
    vendor         TEXT NOT NULL DEFAULT '',
    recurring_freq TEXT NOT NULL DEFAULT ''        -- '' | 'monthly' | 'yearly'
                     CHECK(recurring_freq IN ('','monthly','yearly')),
    bill_day       INTEGER,                        -- day of month a subscription renews
    project_id     TEXT NOT NULL DEFAULT '',
    notes          TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_payments_date     ON payments(date DESC);
  CREATE INDEX IF NOT EXISTS idx_payments_category ON payments(category);
  CREATE INDEX IF NOT EXISTS idx_payments_type     ON payments(type);
  `,
  // v3: network — contacts + interactions (ported from brain-cli).
  // Relationship strength is computed from last_interaction_date unless overridden.
  `
  CREATE TABLE IF NOT EXISTS contacts (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    role                  TEXT NOT NULL DEFAULT '',
    company               TEXT NOT NULL DEFAULT '',
    email                 TEXT NOT NULL DEFAULT '',
    phone                 TEXT NOT NULL DEFAULT '',
    linkedin              TEXT NOT NULL DEFAULT '',
    met_where             TEXT NOT NULL DEFAULT '',
    met_date              TEXT NOT NULL DEFAULT '',
    birthday              TEXT NOT NULL DEFAULT '',
    contact_freq          TEXT NOT NULL DEFAULT '',   -- daily|weekly|monthly|quarterly|yearly
    contact_group         TEXT NOT NULL DEFAULT '',   -- freeform cohort (e.g. "Imperial MBA")
    circle                TEXT NOT NULL DEFAULT 'other', -- family|friends|professional|other
    tags                  TEXT NOT NULL DEFAULT '[]', -- JSON array
    notes                 TEXT NOT NULL DEFAULT '',
    strength_override     TEXT NOT NULL DEFAULT '',   -- ''|active|warm|cold|dormant
    last_interaction_date TEXT NOT NULL DEFAULT '',
    last_interaction_note TEXT NOT NULL DEFAULT '',
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_circle ON contacts(circle);

  CREATE TABLE IF NOT EXISTS contact_interactions (
    id          TEXT PRIMARY KEY,
    contact_id  TEXT NOT NULL REFERENCES contacts(id),
    date        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'other', -- coffee|call|message|meeting|event|other
    note        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_interactions_contact ON contact_interactions(contact_id);
  `,
  // v4: project hub — link any entity (task / payment / contact / event) to a project.
  // project_id and ref_id both reference rows by id across tables; kind disambiguates.
  `
  CREATE TABLE IF NOT EXISTS project_links (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK(kind IN ('task','payment','contact','event')),
    ref_id     TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_link ON project_links(project_id, kind, ref_id);
  CREATE INDEX IF NOT EXISTS idx_project_links_project ON project_links(project_id);
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
