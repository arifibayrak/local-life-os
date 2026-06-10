import type { DB } from '../vault/db.js';
import { addRecord, listByCategory } from '../vault/records.js';
import { reconnectList, type ReconnectItem } from './store.js';

/**
 * Cadence-based follow-up automation. Surfaces priority relationships that have
 * gone stale (see `reconnectList`) and proposes a reconnect task for each one that
 * doesn't already have an open follow-up. Proposed tasks land in `proposed` state so
 * they flow through the same approve/skip loop as extracted records — nothing is
 * silently committed.
 */

const OPEN_STATES = new Set(['proposed', 'active', 'doing', 'snoozed']);

/** Contact ids that already have an open reconnect follow-up task (dedup key). */
function pendingReconnectIds(db: DB): Set<string> {
  const ids = new Set<string>();
  for (const t of listByCategory(db, 'tasks', { includeArchived: true })) {
    const cid = t.extras?.['reconnect_contact_id'];
    if (typeof cid === 'string' && OPEN_STATES.has(t.state)) ids.add(cid);
  }
  return ids;
}

export interface ProposeResult { proposed: number; skipped: number; candidates: number }

/**
 * Create a `proposed` reconnect task for each stale priority contact that lacks one.
 * Returns counts. Pass `state: 'active'` to create them ready-to-go instead of proposed.
 */
export function proposeReconnects(db: DB, opts?: { state?: string }): ProposeResult {
  const state = opts?.state ?? 'proposed';
  const candidates: ReconnectItem[] = reconnectList(db);
  const pending = pendingReconnectIds(db);
  let proposed = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (const c of candidates) {
      if (pending.has(c.id)) { skipped++; continue; }
      const stale = Number.isFinite(c.days_since) ? `${c.days_since}d since last contact` : 'no contact logged yet';
      const title = `Reconnect with ${c.name}`;
      addRecord(db, {
        category: 'tasks',
        headline: title,
        notes: `Priority contact going ${c.strength} (${stale}).${c.last_interaction_note ? ' Last: ' + c.last_interaction_note : ''}`,
        extras: { title, due_at: null, priority: 'med', context: 'Reconnect', reconnect_contact_id: c.id },
        state,
      });
      proposed++;
    }
  });
  tx();
  return { proposed, skipped, candidates: candidates.length };
}
