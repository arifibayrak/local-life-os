/** Seed Feed + Read Later. Run: ./node_modules/.bin/tsx scripts/seed-feed.ts */
import { openDb } from '../src/vault/db.js';
import { initVaultGit, commitVault } from '../src/vault/git.js';
import { addRecord } from '../src/vault/records.js';

const by = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);

const ITEMS = [
  { headline: 'Scaling laws for transfer (arXiv)', extras: { url: 'https://arxiv.org/abs/2102.01293', kind: 'readlater', category: 'Research', visit_freq: '', status: 'queued', research_by: by } },
  { headline: '2026 consulting recruiting trends', extras: { url: 'https://www.consulting.com', kind: 'readlater', category: 'Jobs', visit_freq: '', status: 'queued', research_by: by } },
  { headline: 'Hacker News', extras: { url: 'https://news.ycombinator.com', kind: 'feed', category: 'Tech', visit_freq: 'daily', status: 'queued' } },
  { headline: 'FT Markets', extras: { url: 'https://www.ft.com/markets', kind: 'feed', category: 'Economy', visit_freq: 'daily', status: 'queued' } },
  { headline: 'Stratechery', extras: { url: 'https://stratechery.com', kind: 'feed', category: 'Tech', visit_freq: 'weekly', status: 'queued' } },
  { headline: 'Imperial careers board', extras: { url: 'https://www.imperial.ac.uk/careers', kind: 'feed', category: 'Jobs', visit_freq: 'weekly', status: 'queued' } },
];

function main(): void {
  const db = openDb();
  void initVaultGit();
  const tx = db.transaction(() => { for (const i of ITEMS) addRecord(db, { category: 'feed', headline: i.headline, state: 'active', extras: i.extras }); });
  tx();
  const n = (db.prepare(`SELECT count(*) c FROM records WHERE category='feed'`).get() as { c: number }).c;
  console.log(`seeded ${ITEMS.length} feed items; total: ${n}`);
  void commitVault(`seed: ${ITEMS.length} feed items`);
}
main();
