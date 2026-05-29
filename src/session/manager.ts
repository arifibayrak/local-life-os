import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type { DB } from '../vault/db.js';
import { appendToJournal } from '../vault/journal.js';
import { extractRecords, type ProposedRecord } from '../agents/extractor.js';
import { persistRecords } from '../agents/persister.js';
import { log } from '../logger.js';

interface OpenSession { id: string; openedAt: Date }
interface Pending { sessionId: string; records: ProposedRecord[] }

/**
 * Owns the capture -> session -> close -> validate lifecycle.
 * A session auto-closes after SESSION_IDLE_MINUTES of silence; closing runs
 * extraction and parks the proposals for operator validation via the UI.
 */
export class SessionManager {
  private open: OpenSession | null = null;
  private pending: Pending | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private closing = false;

  constructor(private db: DB) {}

  state() {
    return {
      session: this.open ? { id: this.open.id, openedAt: this.open.openedAt.toISOString() } : null,
      pending: this.pending,
    };
  }

  /** Record one capture (text already transcribed if it was voice). */
  capture(text: string, kind: 'text' | 'voice', attachmentPath: string | null = null): void {
    const now = new Date();
    if (!this.open) {
      const id = randomUUID();
      this.db
        .prepare(`INSERT INTO sessions (id, opened_at, status) VALUES (?, ?, 'open')`)
        .run(id, now.toISOString());
      this.open = { id, openedAt: now };
      log.info(`session opened ${id.slice(0, 8)}`);
    }
    const journalPath = appendToJournal(text, now, kind);
    this.db
      .prepare(
        `INSERT INTO captures (id, session_id, received_at, text, journal_path, kind, attachment_path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), this.open.id, now.toISOString(), text, journalPath, kind, attachmentPath);
    this.resetIdle();
  }

  private resetIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.close(), config.sessionIdleMinutes * 60_000);
  }

  /** Close the open session, run extraction, park proposals for validation. */
  async close(): Promise<Pending | null> {
    if (!this.open || this.closing) return this.pending;
    this.closing = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const session = this.open;
    this.open = null;

    this.db.prepare(`UPDATE sessions SET status = 'closed', closed_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), session.id);

    const rows = this.db
      .prepare(`SELECT text FROM captures WHERE session_id = ? AND skip_extract = 0 ORDER BY received_at`)
      .all(session.id) as Array<{ text: string }>;
    const text = rows.map((r) => r.text).join('\n');

    try {
      const records = await extractRecords(text, new Date());
      this.pending = { sessionId: session.id, records };
      log.info(`session ${session.id.slice(0, 8)} closed -> ${records.length} proposed record(s)`);
    } catch (err) {
      this.pending = { sessionId: session.id, records: [] };
      log.error(`extraction failed for ${session.id.slice(0, 8)}: ${String(err)}`);
      throw err;
    } finally {
      this.closing = false;
    }
    return this.pending;
  }

  /** Operator validation: persist the approved subset (by index), discard the rest. */
  async validate(approveIndexes: number[]): Promise<number> {
    if (!this.pending) return 0;
    const approved = this.pending.records.filter((_, i) => approveIndexes.includes(i));
    const sessionId = this.pending.sessionId;
    this.pending = null;
    if (approved.length === 0) {
      this.db.prepare(`UPDATE sessions SET status = 'validated' WHERE id = ?`).run(sessionId);
      return 0;
    }
    return persistRecords(this.db, sessionId, approved);
  }
}
