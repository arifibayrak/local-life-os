import { randomUUID } from 'node:crypto';
import type { DB } from '../vault/db.js';

export const CIRCLES = ['family', 'friends', 'professional', 'other'] as const;
export const INTERACTION_TYPES = ['coffee', 'call', 'message', 'meeting', 'event', 'other'] as const;
export type Strength = 'active' | 'warm' | 'cold' | 'dormant';

export interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  linkedin: string;
  met_where: string;
  met_date: string;
  birthday: string;
  contact_freq: string;
  contact_group: string;
  circle: string;
  tags: string[];
  notes: string;
  priority: number;            // 1 = important relationship to keep warm
  strength_override: string;
  last_interaction_date: string;
  last_interaction_note: string;
  created_at: string;
  updated_at: string;
}

export interface ContactView extends Contact {
  strength: Strength;
  interactions: number;
}

export type ContactInput = Partial<Omit<Contact, 'tags'>> & { name: string; tags?: string[] };

/** Relationship strength from days since last contact (brain-cli rule), override wins. */
export function computeStrength(lastDate: string, override: string): Strength {
  if (override) return override as Strength;
  if (!lastDate) return 'dormant';
  const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000);
  if (days <= 30) return 'active';
  if (days <= 90) return 'warm';
  if (days <= 180) return 'cold';
  return 'dormant';
}

function rowToContact(r: Record<string, unknown>): Contact {
  let tags: string[] = [];
  try { tags = JSON.parse(String(r['tags'] ?? '[]')); } catch { /* ignore */ }
  return { ...(r as unknown as Contact), tags, priority: Number(r['priority'] ?? 0) };
}

export function addContact(db: DB, input: ContactInput): Contact {
  const now = new Date().toISOString();
  const row: Contact = {
    id: randomUUID(),
    name: input.name,
    role: input.role ?? '', company: input.company ?? '', email: input.email ?? '',
    phone: input.phone ?? '', linkedin: input.linkedin ?? '', met_where: input.met_where ?? '',
    met_date: input.met_date ?? '', birthday: input.birthday ?? '', contact_freq: input.contact_freq ?? '',
    contact_group: input.contact_group ?? '', circle: input.circle ?? 'other',
    tags: input.tags ?? [], notes: input.notes ?? '', priority: Number(input.priority ?? 0) ? 1 : 0,
    strength_override: input.strength_override ?? '',
    last_interaction_date: input.last_interaction_date ?? '', last_interaction_note: input.last_interaction_note ?? '',
    created_at: now, updated_at: now,
  };
  db.prepare(
    `INSERT INTO contacts (id,name,role,company,email,phone,linkedin,met_where,met_date,birthday,contact_freq,contact_group,circle,tags,notes,priority,strength_override,last_interaction_date,last_interaction_note,created_at,updated_at)
     VALUES (@id,@name,@role,@company,@email,@phone,@linkedin,@met_where,@met_date,@birthday,@contact_freq,@contact_group,@circle,@tags,@notes,@priority,@strength_override,@last_interaction_date,@last_interaction_note,@created_at,@updated_at)`,
  ).run({ ...row, tags: JSON.stringify(row.tags) });
  return row;
}

export function updateContact(db: DB, id: string, patch: ContactInput): Contact | null {
  const existing = db.prepare(`SELECT * FROM contacts WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;
  const cur = rowToContact(existing);
  const next: Contact = { ...cur, ...patch, tags: patch.tags ?? cur.tags, priority: Number(patch.priority ?? cur.priority) ? 1 : 0, id, updated_at: new Date().toISOString() };
  db.prepare(
    `UPDATE contacts SET name=@name,role=@role,company=@company,email=@email,phone=@phone,linkedin=@linkedin,
       met_where=@met_where,met_date=@met_date,birthday=@birthday,contact_freq=@contact_freq,contact_group=@contact_group,
       circle=@circle,tags=@tags,notes=@notes,priority=@priority,strength_override=@strength_override,
       last_interaction_date=@last_interaction_date,last_interaction_note=@last_interaction_note,updated_at=@updated_at WHERE id=@id`,
  ).run({ ...next, tags: JSON.stringify(next.tags) });
  return next;
}

export function deleteContact(db: DB, id: string): boolean {
  db.prepare(`DELETE FROM contact_interactions WHERE contact_id=?`).run(id);
  return db.prepare(`DELETE FROM contacts WHERE id=?`).run(id).changes > 0;
}

/** Log a touchpoint and roll it up onto the contact's last_interaction_*. */
export function logInteraction(db: DB, contactId: string, type: string, note: string, date?: string): boolean {
  const d = (date ?? new Date().toISOString()).slice(0, 10);
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO contact_interactions (id,contact_id,date,type,note,created_at) VALUES (?,?,?,?,?,?)`,
    ).run(randomUUID(), contactId, d, type || 'other', note ?? '', new Date().toISOString());
    db.prepare(`UPDATE contacts SET last_interaction_date=?, last_interaction_note=?, updated_at=? WHERE id=?`)
      .run(d, note ?? '', new Date().toISOString(), contactId);
  });
  try { tx(); return true; } catch { return false; }
}

export interface CircleGroup { circle: string; count: number; contacts: ContactView[] }

/** Contacts grouped by circle, each with computed strength + interaction count. */
export function listContacts(db: DB): CircleGroup[] {
  const counts = new Map<string, number>();
  for (const r of db.prepare(`SELECT contact_id, count(*) c FROM contact_interactions GROUP BY contact_id`).all() as Array<{ contact_id: string; c: number }>) {
    counts.set(r.contact_id, r.c);
  }
  const rows = db.prepare(`SELECT * FROM contacts ORDER BY name`).all() as Record<string, unknown>[];
  const order = ['professional', 'friends', 'family', 'other'];
  const groups = new Map<string, CircleGroup>();
  for (const raw of rows) {
    const c = rowToContact(raw);
    const view: ContactView = {
      ...c,
      strength: computeStrength(c.last_interaction_date, c.strength_override),
      interactions: counts.get(c.id) ?? 0,
    };
    const g = groups.get(c.circle) ?? { circle: c.circle, count: 0, contacts: [] };
    g.contacts.push(view); g.count++;
    groups.set(c.circle, g);
  }
  return [...groups.values()].sort((a, b) => order.indexOf(a.circle) - order.indexOf(b.circle));
}

export function getInteractions(db: DB, contactId: string): Array<{ date: string; type: string; note: string }> {
  return db.prepare(`SELECT date,type,note FROM contact_interactions WHERE contact_id=? ORDER BY date DESC LIMIT 50`)
    .all(contactId) as Array<{ date: string; type: string; note: string }>;
}

/** Days since the last logged interaction (Infinity if never). */
export function daysSince(lastDate: string): number {
  if (!lastDate) return Infinity;
  return Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000);
}

export interface ReconnectItem extends ContactView { days_since: number }

/**
 * "Who to reconnect with": priority contacts whose relationship has slipped out of
 * `active` (warm/cold/dormant), staleest first. These are the relationships worth a
 * deliberate nudge — see follow-up automation in `network/followups.ts`.
 */
export function reconnectList(db: DB): ReconnectItem[] {
  const counts = new Map<string, number>();
  for (const r of db.prepare(`SELECT contact_id, count(*) c FROM contact_interactions GROUP BY contact_id`).all() as Array<{ contact_id: string; c: number }>) {
    counts.set(r.contact_id, r.c);
  }
  const rows = db.prepare(`SELECT * FROM contacts WHERE priority = 1`).all() as Record<string, unknown>[];
  return rows
    .map((raw) => {
      const c = rowToContact(raw);
      const strength = computeStrength(c.last_interaction_date, c.strength_override);
      return { ...c, strength, interactions: counts.get(c.id) ?? 0, days_since: daysSince(c.last_interaction_date) } as ReconnectItem;
    })
    .filter((c) => c.strength !== 'active')
    .sort((a, b) => b.days_since - a.days_since);
}
