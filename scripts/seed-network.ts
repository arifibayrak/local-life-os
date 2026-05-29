/**
 * Seed the Network module with the persona's contacts + interactions.
 * Run:  ./node_modules/.bin/tsx scripts/seed-network.ts
 */
import { openDb } from '../src/vault/db.js';
import { initVaultGit, commitVault } from '../src/vault/git.js';
import { addContact, logInteraction, type ContactInput } from '../src/network/store.js';

const BASE = new Date('2026-05-29T12:00:00+01:00');
const d = (off: number) => { const x = new Date(BASE); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };

interface Seed { c: ContactInput; touches: Array<{ off: number; type: string; note: string }> }

const SEEDS: Seed[] = [
  { c: { name: 'Kerem', role: 'Founder', company: 'early-stage startup', circle: 'professional', contact_group: 'Hermes', tags: ['founder', 'investor-intro', 'ai'] },
    touches: [{ off: -6, type: 'meeting', note: 'Hermes project chat' }, { off: 0, type: 'coffee', note: 'investor intro pending' }] },
  { c: { name: 'Sven', role: 'Professor', company: 'Imperial College', circle: 'professional', tags: ['supervisor', 'strategy'] },
    touches: [{ off: -3, type: 'meeting', note: 'dissertation scope + reference' }] },
  { c: { name: 'Daniel', role: 'Consultant', company: 'BCG', circle: 'professional', contact_group: 'recruiting', tags: ['mentor', 'mbb'] },
    touches: [{ off: -5, type: 'coffee', note: 'recruiting timeline + case tips' }] },
  { c: { name: 'Lena', role: 'Classmate', company: 'Imperial MBA', circle: 'friends', contact_group: 'Imperial MBA', tags: ['study-group'] },
    touches: [{ off: -1, type: 'message', note: 'study group scheduling' }] },
  { c: { name: 'Tom', role: 'Classmate', company: 'Imperial MBA', circle: 'friends', contact_group: 'Imperial MBA', tags: ['project'] },
    touches: [{ off: -2, type: 'meeting', note: 'strategy project split' }] },
  { c: { name: 'Priya', role: 'Careers advisor', company: 'Imperial', circle: 'professional', tags: ['careers'] },
    touches: [{ off: -3, type: 'meeting', note: 'CV review + mock interview' }] },
  { c: { name: 'Sarah', role: 'Recruiter', company: 'Bain & Company', circle: 'professional', contact_group: 'recruiting', tags: ['recruiter'] },
    touches: [{ off: 0, type: 'email', note: 'first-round logistics' }, { off: -2, type: 'message', note: 'scheduling' }] },
  { c: { name: 'Aisha', role: 'Classmate', company: 'Imperial MBA', circle: 'friends', contact_group: 'Imperial MBA', tags: ['project'] },
    touches: [{ off: -1, type: 'message', note: 'birthday + project deck' }] },
  { c: { name: 'Emre', role: 'Angel investor', company: 'private', circle: 'professional', tags: ['investor', 'via-kerem'] },
    touches: [] },
  { c: { name: 'Mr. Hughes', role: 'Landlord', circle: 'other', tags: ['housing'] },
    touches: [{ off: -1, type: 'call', note: 'move-out date + deposit' }] },
  { c: { name: 'Muhammed', role: 'Friend', circle: 'friends', tags: ['football', 'travel'] },
    touches: [{ off: -2, type: 'event', note: 'five-a-side football' }] },
  { c: { name: 'Mum', circle: 'family', contact_freq: 'weekly', tags: ['family'] },
    touches: [{ off: -7, type: 'call', note: 'weekly catch-up' }] },
];

function main(): void {
  const db = openDb();
  void initVaultGit();
  const tx = db.transaction(() => {
    for (const s of SEEDS) {
      const c = addContact(db, s.c);
      for (const t of s.touches) logInteraction(db, c.id, t.type, t.note, d(t.off));
    }
  });
  tx();
  const n = (db.prepare(`SELECT count(*) c FROM contacts`).get() as { c: number }).c;
  const ints = (db.prepare(`SELECT count(*) c FROM contact_interactions`).get() as { c: number }).c;
  console.log(`seeded ${SEEDS.length} contacts + ${ints} interactions; total contacts: ${n}`);
  void commitVault(`seed: ${SEEDS.length} contacts`);
}

main();
