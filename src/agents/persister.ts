import { randomUUID } from 'node:crypto';
import type { DB } from '../vault/db.js';
import { commitVault } from '../vault/git.js';
import type { ProposedRecord } from './extractor.js';

/** Insert approved records as 'active' and commit the Vault. Local-only; no push. */
export async function persistRecords(db: DB, sessionId: string, records: ProposedRecord[]): Promise<number> {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO records (id, session_id, category, created_at, state, state_changed_at, headline, notes, extras)
     VALUES (@id, @session_id, @category, @created_at, 'active', @state_changed_at, @headline, @notes, @extras)`,
  );

  const tx = db.transaction((rows: ProposedRecord[]) => {
    for (const r of rows) {
      insert.run({
        id: randomUUID(),
        session_id: sessionId,
        category: r.category,
        created_at: now,
        state_changed_at: now,
        headline: r.headline,
        notes: r.notes,
        extras: JSON.stringify(r.extras),
      });
    }
    db.prepare(`UPDATE sessions SET status = 'persisted' WHERE id = ?`).run(sessionId);
  });
  tx(records);

  await commitVault(`session ${sessionId.slice(0, 8)}: persist ${records.length} record(s)`);
  return records.length;
}
