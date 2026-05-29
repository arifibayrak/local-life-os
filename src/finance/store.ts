import { randomUUID } from 'node:crypto';
import type { DB } from '../vault/db.js';
import { isValidCategory } from './categories.js';

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  date: string; // YYYY-MM-DD
  direction: 'out' | 'in';
  type: 'one-time' | 'recurring';
  category: string;
  description: string;
  vendor: string;
  recurring_freq: '' | 'monthly' | 'yearly';
  bill_day: number | null;
  project_id: string;
  notes: string;
  created_at: string;
}

export type PaymentInput = Partial<Payment> & { amount: number; date: string };

function normalize(p: PaymentInput): Omit<Payment, 'id' | 'created_at'> {
  const recurring = p.type === 'recurring' || !!p.recurring_freq;
  return {
    amount: Math.abs(Number(p.amount)),
    currency: (p.currency || 'GBP').toUpperCase(),
    date: p.date.slice(0, 10),
    direction: p.direction === 'in' ? 'in' : 'out',
    type: recurring ? 'recurring' : 'one-time',
    category: p.category && isValidCategory(p.category) ? p.category : 'other',
    description: p.description ?? '',
    vendor: p.vendor ?? '',
    recurring_freq: recurring ? (p.recurring_freq || 'monthly') : '',
    bill_day: p.bill_day ?? (recurring ? Number(p.date.slice(8, 10)) : null),
    project_id: p.project_id ?? '',
    notes: p.notes ?? '',
  };
}

export function addPayment(db: DB, input: PaymentInput): Payment {
  const row = { id: randomUUID(), created_at: new Date().toISOString(), ...normalize(input) };
  db.prepare(
    `INSERT INTO payments (id, amount, currency, date, direction, type, category, description, vendor, recurring_freq, bill_day, project_id, notes, created_at)
     VALUES (@id,@amount,@currency,@date,@direction,@type,@category,@description,@vendor,@recurring_freq,@bill_day,@project_id,@notes,@created_at)`,
  ).run(row);
  return row;
}

export function addPaymentsBulk(db: DB, inputs: PaymentInput[]): number {
  const tx = db.transaction((rows: PaymentInput[]) => {
    for (const r of rows) addPayment(db, r);
  });
  tx(inputs);
  return inputs.length;
}

export function listPayments(db: DB, opts: { month?: string; category?: string; limit?: number } = {}): Payment[] {
  const where: string[] = [];
  const args: Record<string, unknown> = {};
  if (opts.month) { where.push(`substr(date,1,7) = @month`); args['month'] = opts.month; }
  if (opts.category) { where.push(`category = @category`); args['category'] = opts.category; }
  const sql = `SELECT * FROM payments ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY date DESC, created_at DESC LIMIT @limit`;
  args['limit'] = opts.limit ?? 500;
  return db.prepare(sql).all(args) as Payment[];
}

export function deletePayment(db: DB, id: string): boolean {
  return db.prepare(`DELETE FROM payments WHERE id = ?`).run(id).changes > 0;
}

function bucketExpr(period: 'day' | 'week' | 'month'): string {
  if (period === 'day') return `substr(date,1,10)`;
  if (period === 'week') return `strftime('%Y-W%W', date)`;
  return `substr(date,1,7)`;
}

export interface Analytics {
  period: 'day' | 'week' | 'month';
  currency: string;
  series: Array<{ bucket: string; out: number; in: number }>;
  current: { bucket: string; total: number; byCategory: Array<{ category: string; amount: number; pct: number }> };
}

/** Spending analytics: a recent series of buckets + category breakdown for the latest bucket. */
export function analytics(db: DB, period: 'day' | 'week' | 'month', currency = 'GBP'): Analytics {
  const bkt = bucketExpr(period);
  const limit = period === 'day' ? 14 : period === 'week' ? 12 : 12;
  const series = (
    db
      .prepare(
        `SELECT ${bkt} AS bucket,
                SUM(CASE WHEN direction='out' THEN amount ELSE 0 END) AS out,
                SUM(CASE WHEN direction='in'  THEN amount ELSE 0 END) AS "in"
         FROM payments WHERE currency = @currency
         GROUP BY bucket ORDER BY bucket DESC LIMIT @limit`,
      )
      .all({ currency, limit }) as Array<{ bucket: string; out: number; in: number }>
  ).reverse();

  const latest = series.length ? series[series.length - 1]!.bucket : '';
  const cats = db
    .prepare(
      `SELECT category, SUM(amount) AS amount
       FROM payments
       WHERE currency=@currency AND direction='out' AND ${bkt} = @latest
       GROUP BY category ORDER BY amount DESC`,
    )
    .all({ currency, latest }) as Array<{ category: string; amount: number }>;
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const byCategory = cats.map((c) => ({ ...c, pct: total ? Math.round((c.amount / total) * 100) : 0 }));

  return { period, currency, series, current: { bucket: latest, total, byCategory } };
}

export interface Subscription extends Payment {
  monthlyEquiv: number;
  nextRenewal: string;
}

function nextRenewal(p: Payment, today: Date): string {
  const d = new Date(today);
  if (p.recurring_freq === 'yearly') {
    const base = new Date(p.date);
    const next = new Date(today.getFullYear(), base.getMonth(), base.getDate());
    if (next < today) next.setFullYear(next.getFullYear() + 1);
    return next.toISOString().slice(0, 10);
  }
  const day = p.bill_day ?? 1;
  const next = new Date(d.getFullYear(), d.getMonth(), day);
  if (next < today) next.setMonth(next.getMonth() + 1);
  return next.toISOString().slice(0, 10);
}

/** Active subscriptions with normalized monthly cost + next renewal, plus totals per currency. */
export function listSubscriptions(db: DB): { items: Subscription[]; totals: Record<string, { monthly: number; yearly: number }> } {
  const today = new Date();
  const rows = db
    .prepare(`SELECT * FROM payments WHERE type='recurring' ORDER BY category, vendor`)
    .all() as Payment[];
  const items = rows.map((p) => {
    const monthlyEquiv = p.recurring_freq === 'yearly' ? p.amount / 12 : p.amount;
    return { ...p, monthlyEquiv, nextRenewal: nextRenewal(p, today) };
  });
  items.sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal));
  const totals: Record<string, { monthly: number; yearly: number }> = {};
  for (const s of items) {
    const t = (totals[s.currency] ??= { monthly: 0, yearly: 0 });
    t.monthly += s.monthlyEquiv;
    t.yearly += s.monthlyEquiv * 12;
  }
  return { items, totals };
}
