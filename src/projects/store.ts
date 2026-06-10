import { randomUUID } from 'node:crypto';
import type { DB } from '../vault/db.js';
import { listByCategory, getRecord, addRecord, type RecordRow } from '../vault/records.js';
import { addContact, logInteraction } from '../network/store.js';

export type LinkKind = 'task' | 'payment' | 'contact' | 'event';

export interface ProjectCard extends RecordRow {
  todos: { total: number; open: number };
  budget: Record<string, number>; // currency -> total spent
  people: number;
}

export function linkEntity(db: DB, projectId: string, kind: LinkKind, refId: string): boolean {
  try {
    db.prepare(`INSERT OR IGNORE INTO project_links (id, project_id, kind, ref_id, created_at) VALUES (?,?,?,?,?)`)
      .run(randomUUID(), projectId, kind, refId, new Date().toISOString());
    return true;
  } catch { return false; }
}

export function unlinkEntity(db: DB, projectId: string, kind: LinkKind, refId: string): boolean {
  return db.prepare(`DELETE FROM project_links WHERE project_id=? AND kind=? AND ref_id=?`).run(projectId, kind, refId).changes > 0;
}

function linkedIds(db: DB, projectId: string, kind: LinkKind): string[] {
  return (db.prepare(`SELECT ref_id FROM project_links WHERE project_id=? AND kind=?`).all(projectId, kind) as Array<{ ref_id: string }>).map((r) => r.ref_id);
}

/** Hubs of one category (projects OR events) with rolled-up todo/budget/people counts. */
export function listHubs(db: DB, category: string, opts?: { includeArchived?: boolean }): ProjectCard[] {
  const hubs = listByCategory(db, category, opts);
  return hubs.map((p) => {
    const taskIds = linkedIds(db, p.id, 'task');
    const payIds = linkedIds(db, p.id, 'payment');
    const peopleIds = linkedIds(db, p.id, 'contact');

    let total = 0, open = 0;
    if (taskIds.length) {
      const rows = db.prepare(`SELECT state FROM records WHERE id IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds) as Array<{ state: string }>;
      total = rows.length;
      open = rows.filter((r) => r.state !== 'done' && r.state !== 'archived').length;
    }
    const budget: Record<string, number> = {};
    if (payIds.length) {
      const rows = db.prepare(`SELECT amount, currency FROM payments WHERE id IN (${payIds.map(() => '?').join(',')})`).all(...payIds) as Array<{ amount: number; currency: string }>;
      for (const r of rows) budget[r.currency] = (budget[r.currency] ?? 0) + r.amount;
    }
    return { ...p, todos: { total, open }, budget, people: peopleIds.length };
  });
}

/** Projects with rolled-up todo/budget/people counts. */
export function listProjects(db: DB, opts?: { includeArchived?: boolean }): ProjectCard[] {
  return listHubs(db, 'projects', opts);
}

export interface HubDetail {
  hub: RecordRow | null;
  todos: RecordRow[];
  payments: Array<{ id: string; amount: number; currency: string; date: string; vendor: string; category: string; direction: string }>;
  contacts: Array<{ id: string; name: string; role: string; company: string; circle: string; priority: number; last_interaction_date: string; tags: string[] }>;
  budget: Record<string, number>;
}

/** Full detail for any hub record (project OR event): linked todos, payments, people, budget. */
export function hubDetail(db: DB, hubId: string): HubDetail {
  const hub = getRecord(db, hubId);
  const taskIds = linkedIds(db, hubId, 'task');
  const payIds = linkedIds(db, hubId, 'payment');
  const peopleIds = linkedIds(db, hubId, 'contact');

  const todos = taskIds.length
    ? (db.prepare(`SELECT id,category,headline,notes,extras,state,created_at FROM records WHERE id IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds) as Array<Omit<RecordRow, 'extras'> & { extras: string }>)
        .map((r) => { let e = {}; try { e = JSON.parse(r.extras); } catch { /* */ } return { ...r, extras: e }; })
    : [];
  const payments = payIds.length
    ? db.prepare(`SELECT id,amount,currency,date,vendor,category,direction FROM payments WHERE id IN (${payIds.map(() => '?').join(',')}) ORDER BY date DESC`).all(...payIds) as HubDetail['payments']
    : [];
  const contacts = peopleIds.length
    ? (db.prepare(`SELECT id,name,role,company,circle,priority,last_interaction_date,tags FROM contacts WHERE id IN (${peopleIds.map(() => '?').join(',')})`).all(...peopleIds) as Array<Record<string, unknown>>)
        .map((c) => { let tags: string[] = []; try { tags = JSON.parse(String(c['tags'] ?? '[]')); } catch { /* */ } return { ...(c as unknown as HubDetail['contacts'][number]), tags, priority: Number(c['priority'] ?? 0) }; })
    : [];

  const budget: Record<string, number> = {};
  for (const p of payments) budget[p.currency] = (budget[p.currency] ?? 0) + p.amount;
  return { hub, todos, payments, contacts, budget };
}

/** Back-compat: the Projects UI still expects `{ project, ... }`. */
export interface ProjectDetail extends Omit<HubDetail, 'hub'> { project: RecordRow | null }
export function projectDetail(db: DB, projectId: string): ProjectDetail {
  const { hub, ...rest } = hubDetail(db, projectId);
  return { project: hub, ...rest };
}

export interface BulkPerson {
  name: string;
  role?: string;
  company?: string;
  note?: string;
  attended?: 'yes' | 'no' | 'unsure';
  priority?: boolean;
  followup?: string;          // when set, a proposed-or-active follow-up task is created + linked
}

export interface BulkResult { contacts: number; tasks: number; eventId: string }

/**
 * Bulk-add the people met at an event hub: create a contact for each, link it to the
 * hub, log an interaction (so relationship strength reflects the meeting), and
 * optionally create a follow-up task linked to the same hub. This is the
 * "log an event + the people I met" workflow, as a first-class operation.
 */
export function addPeopleToHub(db: DB, eventId: string, people: BulkPerson[], opts?: { metWhere?: string; metDate?: string; taskState?: string }): BulkResult {
  const metWhere = opts?.metWhere ?? '';
  const metDate = opts?.metDate ?? new Date().toISOString().slice(0, 10);
  const taskState = opts?.taskState ?? 'active';
  let contacts = 0, tasks = 0;
  const tx = db.transaction(() => {
    for (const p of people) {
      if (!p.name?.trim()) continue;
      const c = addContact(db, {
        name: p.name.trim(),
        role: p.role ?? '',
        company: p.company ?? '',
        circle: 'professional',
        contact_group: metWhere,
        met_where: metWhere,
        met_date: metDate,
        notes: p.note ?? '',
        priority: p.priority ? 1 : 0,
        strength_override: p.priority ? 'warm' : '',
      });
      contacts++;
      linkEntity(db, eventId, 'contact', c.id);
      const attended = p.attended ?? 'yes';
      const type = attended === 'yes' ? 'event' : 'other';
      const prefix = attended === 'yes' ? `Met at ${metWhere || 'event'}.` : `${metWhere || 'event'} (${attended}).`;
      logInteraction(db, c.id, type, `${prefix}${p.note ? ' ' + p.note : ''}`.trim(), metDate);
      if (p.followup?.trim()) {
        const taskId = addRecord(db, {
          category: 'tasks',
          headline: p.followup.trim(),
          notes: `From ${metWhere || 'event'} (${metDate}). Contact: ${p.name.trim()}.`,
          extras: { title: p.followup.trim(), due_at: null, priority: p.priority ? 'high' : 'med', context: metWhere || null },
          state: taskState,
        });
        linkEntity(db, eventId, 'task', taskId);
        tasks++;
      }
    }
  });
  tx();
  return { contacts, tasks, eventId };
}
