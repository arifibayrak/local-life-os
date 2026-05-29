import { randomUUID } from 'node:crypto';
import type { DB } from '../vault/db.js';
import { listByCategory, type RecordRow } from '../vault/records.js';

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

/** Projects with rolled-up todo/budget/people counts. */
export function listProjects(db: DB, opts?: { includeArchived?: boolean }): ProjectCard[] {
  const projects = listByCategory(db, 'projects', opts);
  return projects.map((p) => {
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

export interface ProjectDetail {
  project: RecordRow | null;
  todos: RecordRow[];
  payments: Array<{ id: string; amount: number; currency: string; date: string; vendor: string; category: string; direction: string }>;
  contacts: Array<{ id: string; name: string; role: string; company: string; circle: string }>;
  budget: Record<string, number>;
}

export function projectDetail(db: DB, projectId: string): ProjectDetail {
  const project = (listByCategory(db, 'projects', { includeArchived: true }).find((p) => p.id === projectId)) ?? null;
  const taskIds = linkedIds(db, projectId, 'task');
  const payIds = linkedIds(db, projectId, 'payment');
  const peopleIds = linkedIds(db, projectId, 'contact');

  const todos = taskIds.length
    ? (db.prepare(`SELECT id,category,headline,notes,extras,state,created_at FROM records WHERE id IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds) as Array<Omit<RecordRow, 'extras'> & { extras: string }>)
        .map((r) => { let e = {}; try { e = JSON.parse(r.extras); } catch { /* */ } return { ...r, extras: e }; })
    : [];
  const payments = payIds.length
    ? db.prepare(`SELECT id,amount,currency,date,vendor,category,direction FROM payments WHERE id IN (${payIds.map(() => '?').join(',')}) ORDER BY date DESC`).all(...payIds) as ProjectDetail['payments']
    : [];
  const contacts = peopleIds.length
    ? db.prepare(`SELECT id,name,role,company,circle FROM contacts WHERE id IN (${peopleIds.map(() => '?').join(',')})`).all(...peopleIds) as ProjectDetail['contacts']
    : [];

  const budget: Record<string, number> = {};
  for (const p of payments) budget[p.currency] = (budget[p.currency] ?? 0) + p.amount;
  return { project, todos, payments, contacts, budget };
}
