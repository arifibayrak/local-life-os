import { randomUUID } from 'node:crypto';
import type { DB } from '../vault/db.js';
import { commitVault } from '../vault/git.js';
import { addPayment } from '../finance/store.js';
import { sanitizeCategory } from '../finance/import.js';
import type { ProposedRecord } from './extractor.js';

/** Insert approved records as 'active' and commit the Vault. Finance items go to
 *  the payments table (single source of money); everything else to records. */
export async function persistRecords(db: DB, sessionId: string, records: ProposedRecord[]): Promise<number> {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO records (id, session_id, category, created_at, state, state_changed_at, headline, notes, extras)
     VALUES (@id, @session_id, @category, @created_at, 'active', @state_changed_at, @headline, @notes, @extras)`,
  );

  const tx = db.transaction((rows: ProposedRecord[]) => {
    for (const r of rows) {
      if (r.category === 'finance') {
        const e = r.extras as { amount?: number; currency?: string; vendor?: string; category_label?: string; occurred_on?: string };
        if (e.amount) {
          addPayment(db, {
            amount: e.amount,
            currency: (e.currency as string) || 'GBP',
            date: (e.occurred_on as string)?.slice(0, 10) || now.slice(0, 10),
            direction: 'out',
            vendor: (e.vendor as string) || '',
            category: sanitizeCategory(e.category_label),
            description: r.headline,
          });
          continue;
        }
      }
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
