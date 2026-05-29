/**
 * Wire seeded tasks / payments / contacts to seeded projects so the hub shows
 * real connections. Idempotent (links are INSERT OR IGNORE).
 * Run: ./node_modules/.bin/tsx scripts/seed-project-links.ts
 */
import { openDb } from '../src/vault/db.js';
import { initVaultGit, commitVault } from '../src/vault/git.js';
import { linkEntity } from '../src/projects/store.js';

interface Wire { project: string; tasks?: string[]; contacts?: string[]; payments?: string[] }

const WIRES: Wire[] = [
  { project: 'Hermes / local-life-os', tasks: ['Review Hermes extractor prompts'], contacts: ['Kerem', 'Emre'], payments: ['ChatGPT Plus', 'Claude Pro'] },
  { project: 'MBA term strategy project', tasks: ['Submit Strategy group case', 'Prep slides for term project pitch'], contacts: ['Tom', 'Aisha', 'Lena'] },
  { project: 'Consulting recruiting pipeline', tasks: ['Finish McKinsey online assessment', 'Email Prof. Sven about reference'], contacts: ['Daniel', 'Sarah', 'Priya'], payments: ['RocketBlocks (case prep)'] },
  { project: 'Dissertation scoping', contacts: ['Sven'] },
  { project: 'Apartment move-out', tasks: ['Renew BRP / visa documents'], contacts: ['Mr. Hughes'] },
];

function main(): void {
  const db = openDb();
  void initVaultGit();
  const recId = (cat: string, h: string) => (db.prepare(`SELECT id FROM records WHERE category=? AND headline=?`).get(cat, h) as { id: string } | undefined)?.id;
  const payId = (v: string) => (db.prepare(`SELECT id FROM payments WHERE vendor=?`).get(v) as { id: string } | undefined)?.id;
  const conId = (n: string) => (db.prepare(`SELECT id FROM contacts WHERE name=?`).get(n) as { id: string } | undefined)?.id;

  let links = 0;
  const tx = db.transaction(() => {
    for (const w of WIRES) {
      const pid = recId('projects', w.project);
      if (!pid) { console.log('  (project not found:', w.project, ')'); continue; }
      for (const t of w.tasks ?? []) { const id = recId('tasks', t); if (id && linkEntity(db, pid, 'task', id)) links++; }
      for (const c of w.contacts ?? []) { const id = conId(c); if (id && linkEntity(db, pid, 'contact', id)) links++; }
      for (const p of w.payments ?? []) { const id = payId(p); if (id && linkEntity(db, pid, 'payment', id)) links++; }
    }
  });
  tx();
  const total = (db.prepare(`SELECT count(*) c FROM project_links`).get() as { c: number }).c;
  console.log(`created ${links} new links; total project_links: ${total}`);
  void commitVault(`seed: ${links} project links`);
}

main();
