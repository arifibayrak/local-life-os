/**
 * Seed the Ideas/Problems notebook. Run: ./node_modules/.bin/tsx scripts/seed-ideas.ts
 */
import { openDb } from '../src/vault/db.js';
import { initVaultGit, commitVault } from '../src/vault/git.js';
import { addRecord } from '../src/vault/records.js';

interface I { title: string; kind: 'idea' | 'problem'; status: string; body: string; tags: string[] }

const IDEAS: I[] = [
  { title: 'Local-first life OS as a product', kind: 'idea', status: 'develop', body: 'Hermes/local-life-os could be a privacy-first product — on-device LLM, no cloud. Who pays?', tags: ['product', 'hermes'] },
  { title: 'Qwen extraction misses multi-item captures', kind: 'problem', status: 'brainstorm', body: 'When a note has 5+ items it sometimes merges them. Try per-category extractor + constrained decoding.', tags: ['llm', 'quality'] },
  { title: 'Spaced-repetition for case frameworks', kind: 'idea', status: 'brainstorm', body: 'Review MECE/profitability frameworks on a 1/3/7-day schedule before interviews.', tags: ['caseprep', 'learning'] },
  { title: 'London spend creeping up', kind: 'problem', status: 'develop', body: 'Eating out + transport dominate. Set a weekly cap and review every Sunday.', tags: ['finance', 'budget'] },
  { title: 'Narrow the dissertation question', kind: 'problem', status: 'brainstorm', body: 'AI in SME operations is too broad. Pick one vertical (retail? logistics?) and one decision.', tags: ['dissertation'] },
  { title: 'Newsletter on local AI tooling', kind: 'idea', status: 'shipped', body: 'Started a short weekly note on MLX / local models. Keep it 5 links + 1 takeaway.', tags: ['writing', 'ai'] },
  { title: 'Monthly subscription audit', kind: 'idea', status: 'develop', body: 'Auto-flag recurring payments I have not used; the Finance module already lists them.', tags: ['finance', 'automation'] },
  { title: 'Re-warm dormant BCG contacts', kind: 'problem', status: 'brainstorm', body: 'Several professional contacts are going cold. Schedule one coffee/call per week.', tags: ['network'] },
];

function main(): void {
  const db = openDb();
  void initVaultGit();
  const tx = db.transaction(() => {
    for (const i of IDEAS) addRecord(db, { category: 'ideas', headline: i.title, state: 'active', extras: { body: i.body, kind: i.kind, status: i.status, tags: i.tags } });
  });
  tx();
  const n = (db.prepare(`SELECT count(*) c FROM records WHERE category='ideas'`).get() as { c: number }).c;
  console.log(`seeded ${IDEAS.length} ideas/problems; total in db: ${n}`);
  void commitVault(`seed: ${IDEAS.length} ideas`);
}

main();
