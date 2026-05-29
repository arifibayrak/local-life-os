/**
 * Seed the Finance module with a realistic ~5 weeks of spending + subscriptions.
 * Persona: Imperial MBA in London (mostly GBP), occasional TRY.
 * Run:  ./node_modules/.bin/tsx scripts/seed-finance.ts
 */
import { openDb } from '../src/vault/db.js';
import { initVaultGit, commitVault } from '../src/vault/git.js';
import { addPayment, type PaymentInput } from '../src/finance/store.js';

const BASE = new Date('2026-05-29T12:00:00+01:00');
function d(offset: number): string {
  const x = new Date(BASE);
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
}

const P: PaymentInput[] = [
  // --- subscriptions (recurring) ---
  { amount: 12.99, date: d(-20), category: 'streaming', vendor: 'Netflix', type: 'recurring', recurring_freq: 'monthly', bill_day: 9 },
  { amount: 11.99, date: d(-18), category: 'streaming', vendor: 'Spotify', type: 'recurring', recurring_freq: 'monthly', bill_day: 11 },
  { amount: 20, date: d(-15), category: 'ai_tools', vendor: 'ChatGPT Plus', type: 'recurring', recurring_freq: 'monthly', bill_day: 14 },
  { amount: 20, date: d(-15), category: 'ai_tools', vendor: 'Claude Pro', type: 'recurring', recurring_freq: 'monthly', bill_day: 14 },
  { amount: 15, date: d(-12), category: 'telecom', vendor: 'Giffgaff', type: 'recurring', recurring_freq: 'monthly', bill_day: 17 },
  { amount: 32, date: d(-10), category: 'health', vendor: 'Ethos Gym', type: 'recurring', recurring_freq: 'monthly', bill_day: 1 },
  { amount: 89, date: d(-25), category: 'subscription', vendor: 'Amazon Prime', type: 'recurring', recurring_freq: 'yearly' },
  { amount: 79.99, date: d(-30), category: 'education', vendor: 'RocketBlocks (case prep)', type: 'recurring', recurring_freq: 'yearly' },
  // --- groceries ---
  { amount: 38.7, date: d(-1), category: 'groceries', vendor: "Sainsbury's" },
  { amount: 22.4, date: d(-4), category: 'groceries', vendor: 'Tesco' },
  { amount: 41.15, date: d(-8), category: 'groceries', vendor: "Sainsbury's" },
  { amount: 18.9, date: d(-12), category: 'groceries', vendor: 'Lidl' },
  { amount: 250, date: d(-6), category: 'groceries', vendor: 'Migros', currency: 'TRY' },
  // --- restaurants ---
  { amount: 6.8, date: d(-5), category: 'restaurants', vendor: 'Caffe Nero' },
  { amount: 28.5, date: d(-2), category: 'restaurants', vendor: 'Franco Manca' },
  { amount: 14.2, date: d(-9), category: 'restaurants', vendor: 'Dishoom' },
  { amount: 9.5, date: d(-13), category: 'restaurants', vendor: 'Pret' },
  // --- transport ---
  { amount: 42.4, date: d(-7), category: 'transport', vendor: 'TfL', description: 'weekly travel' },
  { amount: 42.4, date: d(-14), category: 'transport', vendor: 'TfL', description: 'weekly travel' },
  { amount: 11.3, date: d(-3), category: 'transport', vendor: 'Uber' },
  // --- housing / utilities / bills ---
  { amount: 980, date: d(-26), category: 'housing', vendor: 'Landlord', description: 'rent' },
  { amount: 65, date: d(-24), category: 'utilities', vendor: 'British Gas' },
  { amount: 28, date: d(-24), category: 'bills', vendor: 'Thames Water' },
  // --- tech / clothing / misc ---
  { amount: 24.99, date: d(-11), category: 'tech', vendor: 'Amazon', description: 'USB-C hub' },
  { amount: 59.0, date: d(-16), category: 'clothing', vendor: 'Uniqlo' },
  { amount: 12.0, date: d(-17), category: 'entertainment', vendor: 'Cinema' },
  // --- travel ---
  { amount: 180, date: d(0), category: 'travel', vendor: 'Turkish Airlines', description: 'IST flight deposit' },
  // --- income ---
  { amount: 1200, date: d(-1), category: 'income', vendor: 'Tutoring', direction: 'in' },
  { amount: 850, date: d(-15), category: 'income', vendor: 'Scholarship stipend', direction: 'in' },
];

function main(): void {
  const db = openDb();
  void initVaultGit();
  const tx = db.transaction(() => P.forEach((p) => addPayment(db, p)));
  tx();
  const n = (db.prepare(`SELECT count(*) c FROM payments`).get() as { c: number }).c;
  const subs = (db.prepare(`SELECT count(*) c FROM payments WHERE type='recurring'`).get() as { c: number }).c;
  console.log(`seeded ${P.length} payments (${subs} subscriptions); total in db: ${n}`);
  void commitVault(`seed: ${P.length} finance payments`);
}

main();
