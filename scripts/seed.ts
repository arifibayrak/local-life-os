/**
 * Seed the Vault with fictional data — ~a week of life, 10 records per category.
 * Persona: Turkish MBA student at Imperial College Business School (London),
 * side-project "Hermes", recruiting for consulting, family/trips back home.
 *
 * Run:  npx tsx scripts/seed.ts
 * Inserts directly into records.db (no LLM), then commits the Vault.
 */
import { randomUUID } from 'node:crypto';
import { openDb } from '../src/vault/db.js';
import { initVaultGit, commitVault } from '../src/vault/git.js';
import { CATEGORY_NAMES, schemaFor, type CategoryName } from '../src/verticals/categories.js';

// Anchor the "week" to a fixed Monday..Sunday so the data is stable.
const BASE = new Date('2026-05-29T12:00:00+01:00'); // Fri
function day(offset: number, hh = 9, mm = 0): string {
  const d = new Date(BASE);
  d.setDate(d.getDate() + offset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

type State = 'active' | 'doing' | 'done' | 'archived' | 'snoozed';
interface Seed {
  category: CategoryName;
  headline: string;
  notes?: string | null;
  state?: State;
  created: string;
  extras: Record<string, unknown>;
}

const SEEDS: Seed[] = [
  // ---------- tasks ----------
  { category: 'tasks', headline: 'Submit Strategy group case', state: 'done', created: day(-6, 23),
    extras: { title: 'Submit Strategy group case', due_at: day(-5, 17), priority: 'high', context: 'BCG matrix deliverable for the corporate simulation' } },
  { category: 'tasks', headline: 'Finish McKinsey online assessment', state: 'done', created: day(-5, 20),
    extras: { title: 'Finish McKinsey online assessment', due_at: day(-4, 23), priority: 'high', context: 'Solve game; 60 min' } },
  { category: 'tasks', headline: 'Book flights to Istanbul for summer', state: 'doing', created: day(-4, 10),
    extras: { title: 'Book flights to Istanbul for summer', due_at: day(2, 20), priority: 'med', context: 'Check Pegasus vs THY prices' } },
  { category: 'tasks', headline: 'Review Hermes extractor prompts', state: 'doing', created: day(-3, 14),
    extras: { title: 'Review Hermes extractor prompts', due_at: day(1, 18), priority: 'med', context: 'Tune the routines/projects categories' } },
  { category: 'tasks', headline: 'Email Prof. Sven about reference', state: 'active', created: day(-2, 9),
    extras: { title: 'Email Prof. Sven about reference', due_at: day(1, 12), priority: 'high', context: 'For Bain application' } },
  { category: 'tasks', headline: 'Renew BRP / visa documents', state: 'active', created: day(-2, 16),
    extras: { title: 'Renew BRP / visa documents', due_at: day(9, 17), priority: 'med', context: null } },
  { category: 'tasks', headline: 'Prep slides for term project pitch', state: 'active', created: day(-1, 11),
    extras: { title: 'Prep slides for term project pitch', due_at: day(3, 9), priority: 'high', context: '10 min + Q&A' } },
  { category: 'tasks', headline: 'Return library books', state: 'active', created: day(-1, 19),
    extras: { title: 'Return library books', due_at: day(2, 17), priority: 'low', context: null } },
  { category: 'tasks', headline: 'Top up Oyster card', state: 'done', created: day(-1, 8),
    extras: { title: 'Top up Oyster card', due_at: day(-1, 9), priority: 'low', context: null } },
  { category: 'tasks', headline: 'Call mum back', state: 'active', created: day(0, 13),
    extras: { title: 'Call mum back', due_at: day(0, 21), priority: 'med', context: null } },

  // ---------- projects ----------
  { category: 'projects', headline: 'Hermes / local-life-os', state: 'active', created: day(-6, 21),
    extras: { title: 'Hermes Life OS (local rebuild)', kind: 'side', status: 'active', started_at: day(-6), target_done_at: day(20), summary: 'On-device personal life OS with Qwen3.5 + MLX', key_contacts: ['Kerem'] } },
  { category: 'projects', headline: 'MBA term strategy project', state: 'doing', created: day(-6, 18),
    extras: { title: 'Corporate strategy simulation', kind: 'coursework', status: 'active', started_at: day(-13), target_done_at: day(6), summary: 'Team of 5, BCG-matrix-driven portfolio decisions', key_contacts: ['Aisha', 'Tom'] } },
  { category: 'projects', headline: 'Consulting recruiting pipeline', state: 'active', created: day(-5, 9),
    extras: { title: 'Summer associate recruiting', kind: 'career', status: 'active', started_at: day(-25), target_done_at: day(30), summary: 'MBB + Tier-2 applications and case prep', key_contacts: ['Career office'] } },
  { category: 'projects', headline: 'Personal finance tracker', state: 'snoozed', created: day(-4, 22),
    extras: { title: 'GBP/TRY budget spreadsheet', kind: 'side', status: 'paused', started_at: day(-40), target_done_at: null, summary: 'Superseded by the finance category in Hermes', key_contacts: [] } },
  { category: 'projects', headline: 'Case prep study group', state: 'active', created: day(-4, 12),
    extras: { title: 'Case interview study group', kind: 'study', status: 'active', started_at: day(-20), target_done_at: day(25), summary: '3x/week mock cases with classmates', key_contacts: ['Kerem', 'Lena'] } },
  { category: 'projects', headline: 'Dissertation scoping', state: 'active', created: day(-3, 17),
    extras: { title: 'Dissertation: AI in SME operations', kind: 'academic', status: 'active', started_at: day(-3), target_done_at: day(90), summary: 'Scoping research question + supervisor', key_contacts: ['Prof. Sven'] } },
  { category: 'projects', headline: 'Apartment move-out', state: 'active', created: day(-2, 20),
    extras: { title: 'End-of-tenancy move', kind: 'life', status: 'active', started_at: day(-2), target_done_at: day(35), summary: 'Inventory, deposit, find next place', key_contacts: ['Landlord'] } },
  { category: 'projects', headline: 'Family business advisory', state: 'snoozed', created: day(-2, 15),
    extras: { title: 'Help with family business in Istanbul', kind: 'family', status: 'paused', started_at: day(-60), target_done_at: null, summary: 'Pricing + ops advice; resume over summer', key_contacts: ['Dad'] } },
  { category: 'projects', headline: 'Marathon training plan', state: 'active', created: day(-1, 7),
    extras: { title: 'Autumn half-marathon', kind: 'fitness', status: 'active', started_at: day(-1), target_done_at: day(120), summary: '16-week plan starting now', key_contacts: [] } },
  { category: 'projects', headline: 'Side income: tutoring', state: 'done', created: day(0, 16),
    extras: { title: 'Quant tutoring gig', kind: 'income', status: 'done', started_at: day(-30), target_done_at: day(0), summary: 'Wrapped up two students before exams', key_contacts: [] } },

  // ---------- calendar ----------
  { category: 'calendar', headline: 'Strategy lecture', state: 'done', created: day(-6, 8),
    extras: { title: 'Competitive Strategy lecture', start_at: day(-6, 10), end_at: day(-6, 12), location: 'LT2, Business School', description: null } },
  { category: 'calendar', headline: 'BCG coffee chat', state: 'done', created: day(-5, 8),
    extras: { title: 'BCG coffee chat', start_at: day(-5, 15), end_at: day(-5, 16), location: 'Caffe Nero, South Ken', description: 'Informational with alum' } },
  { category: 'calendar', headline: 'Study group mock case', state: 'done', created: day(-4, 8),
    extras: { title: 'Mock case with study group', start_at: day(-4, 18), end_at: day(-4, 20), location: 'Library group room 4', description: null } },
  { category: 'calendar', headline: 'Supervisor meeting', state: 'done', created: day(-3, 8),
    extras: { title: 'Dissertation supervisor meeting', start_at: day(-3, 14), end_at: day(-3, 15), location: "Prof. Sven's office", description: 'Scope the research question' } },
  { category: 'calendar', headline: 'Dentist appointment', state: 'active', created: day(-1, 9),
    extras: { title: 'Dentist appointment', start_at: day(1, 20), end_at: day(1, 21), location: 'Kensington Dental', description: 'Check-up' } },
  { category: 'calendar', headline: 'Term project pitch', state: 'active', created: day(-1, 10),
    extras: { title: 'Term project pitch', start_at: day(3, 9), end_at: day(3, 11), location: 'LT1', description: '10 min + Q&A' } },
  { category: 'calendar', headline: 'Bain first round', state: 'active', created: day(0, 9),
    extras: { title: 'Bain first-round interview', start_at: day(5, 13), end_at: day(5, 15), location: 'Bain London office', description: 'Two case interviews' } },
  { category: 'calendar', headline: 'Gym induction', state: 'active', created: day(0, 10),
    extras: { title: 'Ethos gym induction', start_at: day(2, 8), end_at: day(2, 9), location: 'Ethos, Imperial', description: null } },
  { category: 'calendar', headline: 'Dinner with Kerem', state: 'active', created: day(0, 11),
    extras: { title: 'Dinner with Kerem', start_at: day(4, 19, 30), end_at: day(4, 22), location: 'Tas, Borough', description: 'Catch up + investor intro' } },
  { category: 'calendar', headline: 'Flight to Istanbul', state: 'active', created: day(0, 12),
    extras: { title: 'Flight LHR -> IST', start_at: day(14, 7), end_at: day(14, 12), location: 'Heathrow T3', description: 'THY TK1980' } },

  // ---------- events ----------
  { category: 'events', headline: 'Spain trip', state: 'done', created: day(-6, 22),
    extras: { title: 'Spain trip', kind: 'trip', start_at: day(-40), end_at: day(-35), location: 'Barcelona', attended_with: ['Muhammed', 'Yusuf'] } },
  { category: 'events', headline: 'MBA cohort networking night', state: 'done', created: day(-5, 22),
    extras: { title: 'Cohort networking night', kind: 'social', start_at: day(-5, 19), end_at: day(-5, 23), location: 'Business School atrium', attended_with: ['Lena', 'Tom'] } },
  { category: 'events', headline: 'Hackathon weekend', state: 'done', created: day(-4, 21),
    extras: { title: 'AI hackathon', kind: 'competition', start_at: day(-11), end_at: day(-10), location: 'Imperial White City', attended_with: ['Kerem'] } },
  { category: 'events', headline: 'Eid lunch with friends', state: 'done', created: day(-3, 15),
    extras: { title: 'Eid lunch', kind: 'celebration', start_at: day(-3, 13), end_at: day(-3, 16), location: 'Green Lanes', attended_with: ['Muhammed', 'Ali'] } },
  { category: 'events', headline: 'Guest lecture: ex-CEO', state: 'done', created: day(-2, 18),
    extras: { title: 'Guest lecture', kind: 'talk', start_at: day(-2, 17), end_at: day(-2, 18, 30), location: 'LT1', attended_with: [] } },
  { category: 'events', headline: 'Football with the lads', state: 'done', created: day(-2, 21),
    extras: { title: 'Five-a-side football', kind: 'sport', start_at: day(-2, 20), end_at: day(-2, 21), location: 'Powerleague Shoreditch', attended_with: ['Yusuf', 'Ali'] } },
  { category: 'events', headline: 'Museum afternoon', state: 'archived', created: day(-1, 17),
    extras: { title: 'V&A visit', kind: 'culture', start_at: day(-1, 14), end_at: day(-1, 17), location: 'V&A Museum', attended_with: ['Lena'] } },
  { category: 'events', headline: 'Birthday dinner (Aisha)', state: 'active', created: day(0, 18),
    extras: { title: "Aisha's birthday dinner", kind: 'celebration', start_at: day(6, 19), end_at: day(6, 23), location: 'Dishoom, Carnaby', attended_with: ['Tom', 'Lena', 'Kerem'] } },
  { category: 'events', headline: 'Career fair', state: 'active', created: day(0, 19),
    extras: { title: 'Consulting career fair', kind: 'career', start_at: day(8, 10), end_at: day(8, 16), location: 'Business School', attended_with: [] } },
  { category: 'events', headline: 'Weekend trip to Oxford', state: 'active', created: day(0, 20),
    extras: { title: 'Day trip to Oxford', kind: 'trip', start_at: day(9, 9), end_at: day(9, 20), location: 'Oxford', attended_with: ['Muhammed'] } },

  // ---------- networks ----------
  { category: 'networks', headline: 'Kerem', state: 'active', created: day(-6, 20),
    extras: { contact_name: 'Kerem', contact_role: 'Founder', company: 'early-stage startup', topics_discussed: 'Hermes project; he will intro me to an investor', last_interaction_at: day(0, 12) } },
  { category: 'networks', headline: 'Prof. Sven', state: 'active', created: day(-5, 20),
    extras: { contact_name: 'Sven', contact_role: 'Professor', company: 'Imperial College Business School', topics_discussed: 'Dissertation scope; reference letter', last_interaction_at: day(-3, 14) } },
  { category: 'networks', headline: 'BCG alum (Daniel)', state: 'active', created: day(-5, 16),
    extras: { contact_name: 'Daniel', contact_role: 'Consultant', company: 'BCG', topics_discussed: 'Recruiting timeline; case tips', last_interaction_at: day(-5, 15) } },
  { category: 'networks', headline: 'Lena', state: 'active', created: day(-4, 19),
    extras: { contact_name: 'Lena', contact_role: 'Classmate', company: 'Imperial MBA', topics_discussed: 'Study group scheduling', last_interaction_at: day(-1, 16) } },
  { category: 'networks', headline: 'Tom', state: 'active', created: day(-4, 18),
    extras: { contact_name: 'Tom', contact_role: 'Classmate', company: 'Imperial MBA', topics_discussed: 'Strategy project workload split', last_interaction_at: day(-2, 12) } },
  { category: 'networks', headline: 'Career office (Priya)', state: 'active', created: day(-3, 11),
    extras: { contact_name: 'Priya', contact_role: 'Careers advisor', company: 'Imperial', topics_discussed: 'CV review; mock interview booking', last_interaction_at: day(-3, 11) } },
  { category: 'networks', headline: 'Bain recruiter', state: 'active', created: day(-2, 10),
    extras: { contact_name: 'Sarah', contact_role: 'Recruiter', company: 'Bain & Company', topics_discussed: 'First-round logistics', last_interaction_at: day(0, 9) } },
  { category: 'networks', headline: 'Aisha', state: 'active', created: day(-2, 19),
    extras: { contact_name: 'Aisha', contact_role: 'Classmate', company: 'Imperial MBA', topics_discussed: 'Birthday plans; project deck', last_interaction_at: day(-1, 20) } },
  { category: 'networks', headline: 'Landlord', state: 'active', created: day(-1, 13),
    extras: { contact_name: 'Mr. Hughes', contact_role: 'Landlord', company: null, topics_discussed: 'Move-out date and deposit', last_interaction_at: day(-1, 13) } },
  { category: 'networks', headline: 'Angel investor (via Kerem)', state: 'active', created: day(0, 17),
    extras: { contact_name: 'Emre', contact_role: 'Angel investor', company: 'private', topics_discussed: 'Intro pending; interested in life-OS tools', last_interaction_at: null } },

  // ---------- finance ----------
  { category: 'finance', headline: 'Groceries at Migros', state: 'active', created: day(-6, 19),
    extras: { amount: 250, currency: 'TRY', vendor: 'Migros', category_label: 'groceries', occurred_on: day(-6) } },
  { category: 'finance', headline: 'Weekly Tube travel', state: 'active', created: day(-6, 8),
    extras: { amount: 42.4, currency: 'GBP', vendor: 'TfL', category_label: 'transport', occurred_on: day(-6) } },
  { category: 'finance', headline: 'Sainsbury\'s shop', state: 'active', created: day(-5, 18),
    extras: { amount: 38.7, currency: 'GBP', vendor: "Sainsbury's", category_label: 'groceries', occurred_on: day(-5) } },
  { category: 'finance', headline: 'Coffee chat (Nero)', state: 'active', created: day(-5, 15),
    extras: { amount: 6.8, currency: 'GBP', vendor: 'Caffe Nero', category_label: 'eating out', occurred_on: day(-5) } },
  { category: 'finance', headline: 'Case interview book', state: 'archived', created: day(-4, 11),
    extras: { amount: 24.99, currency: 'GBP', vendor: 'Amazon', category_label: 'books', occurred_on: day(-4) } },
  { category: 'finance', headline: 'Phone bill', state: 'active', created: day(-3, 9),
    extras: { amount: 15, currency: 'GBP', vendor: 'Giffgaff', category_label: 'bills', occurred_on: day(-3) } },
  { category: 'finance', headline: 'Gym membership', state: 'active', created: day(-2, 8),
    extras: { amount: 32, currency: 'GBP', vendor: 'Ethos', category_label: 'fitness', occurred_on: day(-2) } },
  { category: 'finance', headline: 'Dinner with classmates', state: 'active', created: day(-1, 22),
    extras: { amount: 28.5, currency: 'GBP', vendor: 'Franco Manca', category_label: 'eating out', occurred_on: day(-1) } },
  { category: 'finance', headline: 'Stipend received', state: 'done', created: day(-1, 6),
    extras: { amount: 1200, currency: 'GBP', vendor: 'Tutoring income', category_label: 'income', occurred_on: day(-1) } },
  { category: 'finance', headline: 'Flight deposit (IST)', state: 'active', created: day(0, 12),
    extras: { amount: 180, currency: 'GBP', vendor: 'Turkish Airlines', category_label: 'travel', occurred_on: day(0) } },

  // ---------- learnings ----------
  { category: 'learnings', headline: 'Reading the BCG matrix', state: 'active', created: day(-6, 23),
    extras: { summary: 'How to position/read the BCG Matrix (Stars, Cash Cows, Dogs, Question Marks) in strategy', source_kind: 'person', source_name: 'Prof. Sven (Imperial)', topic_tags: ['bcg_matrix', 'strategy', 'corporate_simulation'] } },
  { category: 'learnings', headline: 'Case math shortcuts', state: 'active', created: day(-5, 21),
    extras: { summary: 'Round aggressively and sanity-check magnitudes before precision in case math', source_kind: 'book', source_name: 'Case In Point', topic_tags: ['case_interview', 'mental_math'] } },
  { category: 'learnings', headline: 'MECE structuring', state: 'active', created: day(-4, 20),
    extras: { summary: 'Build issue trees that are Mutually Exclusive, Collectively Exhaustive', source_kind: 'person', source_name: 'Daniel (BCG)', topic_tags: ['mece', 'frameworks'] } },
  { category: 'learnings', headline: 'Porter Five Forces nuance', state: 'active', created: day(-4, 12),
    extras: { summary: "Supplier power is often understated in platform businesses", source_kind: 'lecture', source_name: 'Competitive Strategy', topic_tags: ['porter', 'strategy'] } },
  { category: 'learnings', headline: 'MLX vs llama.cpp', state: 'active', created: day(-3, 23),
    extras: { summary: 'On Apple Silicon, MLX runs Qwen natively on the GPU; thinking mode must be disabled for clean JSON', source_kind: 'self', source_name: 'Hermes build', topic_tags: ['mlx', 'qwen', 'local_llm'] } },
  { category: 'learnings', headline: 'Constrained decoding', state: 'active', created: day(-3, 14),
    extras: { summary: 'JSON-schema/grammar constrained decoding removes most output-parsing pain for small models', source_kind: 'article', source_name: 'outlines docs', topic_tags: ['llm', 'json', 'outlines'] } },
  { category: 'learnings', headline: 'Negotiation: anchoring', state: 'archived', created: day(-2, 18),
    extras: { summary: 'First credible number anchors the range; prepare your anchor before the conversation', source_kind: 'lecture', source_name: 'Negotiations elective', topic_tags: ['negotiation', 'anchoring'] } },
  { category: 'learnings', headline: 'Cohort effect in retention', state: 'active', created: day(-2, 10),
    extras: { summary: 'Retention should be read by signup cohort, not blended, to avoid Simpson-paradox traps', source_kind: 'person', source_name: 'Kerem', topic_tags: ['analytics', 'retention'] } },
  { category: 'learnings', headline: 'Spaced repetition', state: 'active', created: day(-1, 7),
    extras: { summary: 'Review case frameworks on an expanding schedule (1d, 3d, 7d) for durable recall', source_kind: 'podcast', source_name: 'Huberman', topic_tags: ['learning', 'memory'] } },
  { category: 'learnings', headline: 'Git: amend author', state: 'active', created: day(0, 20),
    extras: { summary: 'git commit --amend --reset-author rewrites the author after fixing user.email', source_kind: 'self', source_name: 'Hermes build', topic_tags: ['git', 'tooling'] } },

  // ---------- routines ----------
  { category: 'routines', headline: 'Daily prayers (Isha & Fajr)', state: 'active', created: day(-6, 5),
    extras: { title: 'Daily Islamic prayers', cadence_rrule: 'FREQ=DAILY', target_per_period: 5, occurrence_category: 'tasks', adherence_window_days: 1, motivation: 'Religious obligation and spiritual practice' } },
  { category: 'routines', headline: 'Morning run', state: 'active', created: day(-6, 6),
    extras: { title: 'Morning run', cadence_rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', target_per_period: 3, occurrence_category: 'events', adherence_window_days: 1, motivation: 'Half-marathon training' } },
  { category: 'routines', headline: 'Case prep block', state: 'active', created: day(-6, 7),
    extras: { title: 'Case interview practice', cadence_rrule: 'FREQ=WEEKLY;BYDAY=TU,TH,SA', target_per_period: 3, occurrence_category: 'tasks', adherence_window_days: 0, motivation: 'Land a consulting offer' } },
  { category: 'routines', headline: 'Read 20 pages', state: 'active', created: day(-5, 23),
    extras: { title: 'Read 20 pages before bed', cadence_rrule: 'FREQ=DAILY', target_per_period: 1, occurrence_category: 'tasks', adherence_window_days: 1, motivation: 'Keep learning outside coursework' } },
  { category: 'routines', headline: 'Weekly review', state: 'active', created: day(-5, 18),
    extras: { title: 'Sunday weekly review', cadence_rrule: 'FREQ=WEEKLY;BYDAY=SU', target_per_period: 1, occurrence_category: 'tasks', adherence_window_days: 1, motivation: 'Plan the week, clear the inbox' } },
  { category: 'routines', headline: 'Call family', state: 'active', created: day(-4, 21),
    extras: { title: 'Call family back home', cadence_rrule: 'FREQ=WEEKLY;BYDAY=SU', target_per_period: 1, occurrence_category: 'networks', adherence_window_days: 2, motivation: 'Stay close while abroad' } },
  { category: 'routines', headline: 'Gym strength', state: 'active', created: day(-4, 8),
    extras: { title: 'Strength training', cadence_rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', target_per_period: 2, occurrence_category: 'events', adherence_window_days: 1, motivation: 'General fitness' } },
  { category: 'routines', headline: 'No screens after 23:00', state: 'snoozed', created: day(-3, 23),
    extras: { title: 'Digital sundown', cadence_rrule: 'FREQ=DAILY', target_per_period: 1, occurrence_category: 'tasks', adherence_window_days: 0, motivation: 'Better sleep' } },
  { category: 'routines', headline: 'Track expenses', state: 'active', created: day(-2, 22),
    extras: { title: 'Log the day\'s spending', cadence_rrule: 'FREQ=DAILY', target_per_period: 1, occurrence_category: 'finance', adherence_window_days: 1, motivation: 'Stay on budget in two currencies' } },
  { category: 'routines', headline: 'Meal prep Sunday', state: 'active', created: day(-1, 16),
    extras: { title: 'Sunday meal prep', cadence_rrule: 'FREQ=WEEKLY;BYDAY=SU', target_per_period: 1, occurrence_category: 'tasks', adherence_window_days: 1, motivation: 'Save money and time on weekdays' } },
];

function main(): void {
  const db = openDb();
  void initVaultGit();

  // one synthetic session to satisfy the FK
  const sessionId = randomUUID();
  db.prepare(`INSERT INTO sessions (id, opened_at, closed_at, status) VALUES (?, ?, ?, 'persisted')`)
    .run(sessionId, day(-6, 5), day(0, 23));

  const insert = db.prepare(
    `INSERT INTO records (id, session_id, category, created_at, state, state_changed_at, headline, notes, extras)
     VALUES (@id, @session_id, @category, @created_at, @state, @state_changed_at, @headline, @notes, @extras)`,
  );

  let ok = 0;
  const skipped: string[] = [];
  const tx = db.transaction(() => {
    for (const s of SEEDS) {
      const schema = schemaFor(s.category);
      const parsed = schema.safeParse(s.extras);
      if (!parsed.success) { skipped.push(`${s.category}/${s.headline}: ${parsed.error.issues[0]?.message}`); continue; }
      insert.run({
        id: randomUUID(), session_id: sessionId, category: s.category,
        created_at: s.created, state: s.state ?? 'active', state_changed_at: s.created,
        headline: s.headline, notes: s.notes ?? null, extras: JSON.stringify(parsed.data),
      });
      ok++;
    }
  });
  tx();

  const counts = db.prepare(`SELECT category, count(*) c FROM records GROUP BY category ORDER BY category`).all();
  console.log(`seeded ${ok}/${SEEDS.length} records across ${CATEGORY_NAMES.length} categories`);
  console.table(counts);
  if (skipped.length) { console.log('skipped (schema):'); skipped.forEach((s) => console.log('  - ' + s)); }

  void commitVault(`seed: ${ok} fictional records (one week)`);
}

main();
