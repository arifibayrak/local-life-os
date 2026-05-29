/**
 * Finance taxonomy, ported from brain's finance model (derived from a real
 * Revolut statement Sep'25–May'26). Subscriptions live here too —
 * streaming / ai_tools / telecom / bills + recurring type.
 */
export const FINANCE_CATEGORIES = [
  'groceries',
  'restaurants',
  'transport',
  'travel',
  'education',
  'housing',
  'utilities',
  'telecom',
  'bills',
  'clothing',
  'household',
  'tech',
  'subscription',
  'streaming',
  'ai_tools',
  'credit_cards',
  'entertainment',
  'health',
  'gifts',
  'investment',
  'fees',
  'income',
  'other',
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

/** Categories that are typically recurring subscriptions. */
export const SUBSCRIPTION_CATEGORIES: ReadonlySet<string> = new Set([
  'subscription',
  'streaming',
  'ai_tools',
  'telecom',
  'bills',
  'utilities',
]);

export const PAYMENT_TYPES = ['one-time', 'recurring'] as const;
export const RECURRING_FREQS = ['', 'monthly', 'yearly'] as const;
export const DIRECTIONS = ['out', 'in'] as const;

export function isValidCategory(c: string): c is FinanceCategory {
  return (FINANCE_CATEGORIES as readonly string[]).includes(c);
}
