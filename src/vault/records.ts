import { randomUUID } from 'node:crypto';
import type { DB } from './db.js';

export interface RecordRow {
  id: string;
  category: string;
  headline: string | null;
  notes: string | null;
  extras: Record<string, unknown>;
  state: string;
  created_at: string;
}

export interface CategoryGroup {
  category: string;
  count: number;
  records: RecordRow[];
}

/** Read view of the Vault: persisted records grouped by category, newest first. */
export function listRecords(db: DB, opts?: { includeArchived?: boolean }): CategoryGroup[] {
  const where = opts?.includeArchived ? '' : `WHERE state NOT IN ('archived','dismissed')`;
  const rows = db
    .prepare(
      `SELECT id, category, headline, notes, extras, state, created_at
       FROM records ${where}
       ORDER BY category, created_at DESC`,
    )
    .all() as Array<Omit<RecordRow, 'extras'> & { extras: string }>;

  const groups = new Map<string, CategoryGroup>();
  for (const r of rows) {
    let extras: Record<string, unknown> = {};
    try {
      extras = JSON.parse(r.extras) as Record<string, unknown>;
    } catch {
      /* leave empty on malformed JSON */
    }
    const g = groups.get(r.category) ?? { category: r.category, count: 0, records: [] };
    g.records.push({ ...r, extras });
    g.count++;
    groups.set(r.category, g);
  }
  return [...groups.values()];
}

/** Change a record's state (mark done, archive, etc.). */
export function setRecordState(db: DB, id: string, state: string): boolean {
  const res = db
    .prepare(`UPDATE records SET state = ?, state_changed_at = ? WHERE id = ?`)
    .run(state, new Date().toISOString(), id);
  return res.changes > 0;
}

/** Ensure a synthetic session exists for records created directly in a module (not via capture). */
function ensureManualSession(db: DB): string {
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO sessions (id, opened_at, closed_at, status) VALUES ('manual', ?, ?, 'persisted')`).run(now, now);
  return 'manual';
}

export interface NewRecord { category: string; headline: string; notes?: string | null; extras?: Record<string, unknown>; state?: string }

/** Create a record directly (module add forms). Returns its id. */
export function addRecord(db: DB, r: NewRecord): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO records (id, session_id, category, created_at, state, state_changed_at, headline, notes, extras)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, ensureManualSession(db), r.category, now, r.state ?? 'active', now, r.headline, r.notes ?? null, JSON.stringify(r.extras ?? {}));
  return id;
}

/** Fetch a single record by id (extras parsed), or null. Category-agnostic. */
export function getRecord(db: DB, id: string): RecordRow | null {
  const r = db
    .prepare(`SELECT id, category, headline, notes, extras, state, created_at FROM records WHERE id = ?`)
    .get(id) as (Omit<RecordRow, 'extras'> & { extras: string }) | undefined;
  if (!r) return null;
  let extras: Record<string, unknown> = {};
  try { extras = JSON.parse(r.extras) as Record<string, unknown>; } catch { /* ignore */ }
  return { ...r, extras };
}

/** Records of one category, newest first (archived/dismissed hidden unless asked). */
export function listByCategory(db: DB, category: string, opts?: { includeArchived?: boolean }): RecordRow[] {
  const filter = opts?.includeArchived ? '' : `AND state NOT IN ('archived','dismissed')`;
  const rows = db
    .prepare(`SELECT id, category, headline, notes, extras, state, created_at FROM records WHERE category = ? ${filter} ORDER BY created_at DESC`)
    .all(category) as Array<Omit<RecordRow, 'extras'> & { extras: string }>;
  return rows.map((r) => {
    let extras: Record<string, unknown> = {};
    try { extras = JSON.parse(r.extras) as Record<string, unknown>; } catch { /* ignore */ }
    return { ...r, extras };
  });
}

/** Permanently delete a record (and any project links pointing at it). */
export function deleteRecord(db: DB, id: string): boolean {
  db.prepare(`DELETE FROM project_links WHERE ref_id = ? OR project_id = ?`).run(id, id);
  return db.prepare(`DELETE FROM records WHERE id = ?`).run(id).changes > 0;
}

/** Patch a record's headline/notes/extras/state. */
export function updateRecord(db: DB, id: string, patch: { headline?: string; notes?: string | null; extras?: Record<string, unknown>; state?: string }): boolean {
  const sets: string[] = [];
  const args: Record<string, unknown> = { id, now: new Date().toISOString() };
  if (patch.headline !== undefined) { sets.push('headline=@headline'); args['headline'] = patch.headline; }
  if (patch.notes !== undefined) { sets.push('notes=@notes'); args['notes'] = patch.notes; }
  if (patch.extras !== undefined) { sets.push('extras=@extras'); args['extras'] = JSON.stringify(patch.extras); }
  if (patch.state !== undefined) { sets.push('state=@state'); sets.push('state_changed_at=@now'); args['state'] = patch.state; }
  if (!sets.length) return false;
  return db.prepare(`UPDATE records SET ${sets.join(', ')} WHERE id=@id`).run(args).changes > 0;
}
