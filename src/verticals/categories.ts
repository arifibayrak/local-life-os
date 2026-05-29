import { z } from 'zod';

/**
 * The 8 categories recovered from the original vault. Each "vertical" is a
 * category with its own `extras` schema — the contract the Extractor must emit.
 * Verticals map 1:1 to categories (as they did in the original data).
 *
 * These schemas are deliberately lenient (most fields nullable) so a 9B model's
 * output validates often; tighten them as you tune prompts.
 */

const isoDate = z.string().describe('ISO 8601 date or datetime');

export const categorySchemas = {
  tasks: z.object({
    title: z.string(),
    due_at: isoDate.nullable().default(null),
    priority: z.enum(['low', 'med', 'high']).nullable().default(null),
    context: z.string().nullable().default(null),
  }),

  projects: z.object({
    title: z.string(),
    kind: z.string().nullable().default(null),
    status: z.enum(['active', 'paused', 'done']).default('active'),
    started_at: isoDate.nullable().default(null),
    target_done_at: isoDate.nullable().default(null),
    summary: z.string().nullable().default(null),
    key_contacts: z.array(z.string()).default([]),
  }),

  calendar: z.object({
    title: z.string(),
    start_at: isoDate,
    end_at: isoDate.nullable().default(null),
    location: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
  }),

  events: z.object({
    title: z.string(),
    kind: z.string().nullable().default(null),
    start_at: isoDate.nullable().default(null),
    end_at: isoDate.nullable().default(null),
    location: z.string().nullable().default(null),
    attended_with: z.array(z.string()).default([]),
  }),

  networks: z.object({
    contact_name: z.string(),
    contact_role: z.string().nullable().default(null),
    company: z.string().nullable().default(null),
    topics_discussed: z.string().nullable().default(null),
    last_interaction_at: isoDate.nullable().default(null),
  }),

  finance: z.object({
    amount: z.number(),
    currency: z.string().default('USD'),
    vendor: z.string().nullable().default(null),
    category_label: z.string().nullable().default(null),
    occurred_on: isoDate.nullable().default(null),
  }),

  learnings: z.object({
    summary: z.string(),
    source_kind: z.string().nullable().default(null),
    source_name: z.string().nullable().default(null),
    topic_tags: z.array(z.string()).default([]),
  }),

  routines: z.object({
    title: z.string(),
    cadence_rrule: z.string().describe('RRULE string, e.g. FREQ=DAILY'),
    target_per_period: z.number().nullable().default(null),
    occurrence_category: z.string().nullable().default(null),
    adherence_window_days: z.number().nullable().default(null),
    motivation: z.string().nullable().default(null),
  }),

  ideas: z.object({
    body: z.string().nullable().default(null),
    kind: z.enum(['idea', 'problem']).default('idea'),
    status: z.enum(['brainstorm', 'develop', 'shipped', 'archived']).default('brainstorm'),
    tags: z.array(z.string()).default([]),
  }),

  feed: z.object({
    url: z.string().nullable().default(null),
    kind: z.enum(['feed', 'readlater']).default('readlater'),
    category: z.string().nullable().default(null),
    visit_freq: z.enum(['', 'daily', 'weekly', 'occasional']).default(''),
    status: z.enum(['queued', 'reading', 'done', 'archived']).default('queued'),
    topic: z.string().nullable().default(null),
    research_by: z.string().nullable().default(null),
  }),
} as const;

export type CategoryName = keyof typeof categorySchemas;

export const CATEGORY_NAMES = Object.keys(categorySchemas) as CategoryName[];

/** One-line hints used in the router/extractor prompts. Tune freely. */
export const categoryHints: Record<CategoryName, string> = {
  tasks: 'a to-do / action item the operator must do',
  projects: 'a longer-lived effort with a goal',
  calendar: 'a time-bound appointment to put on the calendar',
  events: 'something that happened or will happen (trip, dinner, milestone)',
  networks: 'a person and an interaction with them',
  finance: 'money spent or received',
  learnings: 'something the operator learned or wants to remember',
  routines: 'a recurring habit or practice',
  ideas: 'a raw idea or a problem to think through',
  feed: 'a link/article — to read regularly (feed) or save to research later',
};

export function schemaFor(category: string) {
  return (categorySchemas as Record<string, z.ZodTypeAny>)[category];
}

/**
 * Compact per-category field spec injected into the extractor prompt so the
 * model fills the exact `extras` keys each Zod schema requires. (req) = required.
 * Keep this in sync with `categorySchemas` above.
 */
export const categoryFieldGuide: Record<CategoryName, string> = {
  tasks: 'title (req), due_at (ISO|null), priority (low|med|high|null), context (string|null)',
  projects: 'title (req), kind, status (active|paused|done), started_at, target_done_at, summary, key_contacts (string[])',
  calendar: 'title (req), start_at (ISO, req), end_at (ISO|null), location, description',
  events: 'title (req), kind, start_at, end_at, location, attended_with (string[])',
  networks: 'contact_name (req), contact_role, company, topics_discussed, last_interaction_at (ISO)',
  finance: 'amount (number, req), currency (default USD), vendor, category_label, occurred_on (ISO)',
  learnings: 'summary (req), source_kind, source_name, topic_tags (string[])',
  routines: 'title (req), cadence_rrule (RRULE, req), target_per_period (number), occurrence_category, adherence_window_days (number), motivation',
  ideas: 'body (the idea/problem text), kind (idea|problem), status (brainstorm|develop|shipped), tags (string[])',
  feed: 'url, kind (feed|readlater), category (News|Tech|Finance|Jobs|Tools), visit_freq (daily|weekly), topic',
};
