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
