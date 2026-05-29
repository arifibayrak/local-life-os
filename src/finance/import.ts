import * as XLSX from 'xlsx';
import type { PaymentInput } from './store.js';
import { isValidCategory } from './categories.js';

/** A row parsed from an uploaded statement, ready for the preview table. */
export interface ImportedRow extends PaymentInput {
  amount: number;
  date: string;
  raw: Record<string, string>;
}

/** Minimal CSV parser handling quoted fields and commas inside quotes. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function rowsFromBytes(bytes: Buffer, filename: string): Record<string, string>[] {
  if (/\.csv$|\.tsv$|\.txt$/i.test(filename)) return parseCsv(bytes.toString('utf8'));
  const wb = XLSX.read(bytes, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' }) as Record<string, string>[];
}

const find = (keys: string[], cands: string[]): string | null =>
  keys.find((k) => cands.some((c) => k.toLowerCase().includes(c))) ?? null;

function toIsoDate(v: string): string | null {
  if (!v) return null;
  // dd/mm/yyyy or dd-mm-yyyy
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const [, d, mo, y] = m;
    const yr = y!.length === 2 ? '20' + y : y;
    return `${yr}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const GUESS: Array<[RegExp, string]> = [
  [/netflix|spotify|disney|youtube premium|hbo|prime video/i, 'streaming'],
  [/openai|anthropic|claude|chatgpt|cursor|midjourney|copilot/i, 'ai_tools'],
  [/vodafone|giffgaff|o2|ee |three|turkcell|telekom/i, 'telecom'],
  [/tesco|sainsbury|migros|lidl|aldi|waitrose|asda|grocer/i, 'groceries'],
  [/uber|bolt|tfl|oyster|train|rail|metro|taxi/i, 'transport'],
  [/restaurant|cafe|nero|costa|starbucks|dishoom|deliveroo|just eat/i, 'restaurants'],
  [/rent|landlord|mortgage/i, 'housing'],
  [/electric|gas|water|council tax|utility/i, 'utilities'],
  [/amazon|apple|google/i, 'tech'],
  [/gym|ethos|pure gym/i, 'health'],
  [/salary|stipend|payroll|income|refund/i, 'income'],
];

function guessCategory(text: string): string {
  for (const [re, cat] of GUESS) if (re.test(text)) return cat;
  return 'other';
}

/** Parse an uploaded statement (CSV/XLSX) into preview rows. Generic adapter. */
export function parseStatement(bytes: Buffer, filename: string): { rows: ImportedRow[]; detected: Record<string, string | null> } {
  const raw = rowsFromBytes(bytes, filename);
  if (!raw.length) return { rows: [], detected: {} };
  const keys = Object.keys(raw[0]!);

  const dateCol = find(keys, ['date', 'time']);
  const descCol = find(keys, ['description', 'reference', 'detail', 'narrative', 'merchant', 'name', 'memo']);
  const vendorCol = find(keys, ['vendor', 'payee', 'merchant']) ?? descCol;
  const amountCol = find(keys, ['amount', 'value']);
  const outCol = find(keys, ['paid out', 'money out', 'debit', 'withdrawal']);
  const inCol = find(keys, ['paid in', 'money in', 'credit', 'deposit']);
  const ccyCol = find(keys, ['currency', 'ccy']);

  const rows: ImportedRow[] = [];
  for (const r of raw) {
    const date = toIsoDate(dateCol ? r[dateCol] ?? '' : '');
    if (!date) continue;
    let amount = 0;
    let direction: 'out' | 'in' = 'out';
    if (amountCol && r[amountCol]) {
      const n = Number(String(r[amountCol]).replace(/[^0-9.-]/g, ''));
      amount = Math.abs(n);
      direction = n < 0 ? 'out' : 'in';
    } else if (outCol && r[outCol] && Number(String(r[outCol]).replace(/[^0-9.-]/g, ''))) {
      amount = Math.abs(Number(String(r[outCol]).replace(/[^0-9.-]/g, ''))); direction = 'out';
    } else if (inCol && r[inCol]) {
      amount = Math.abs(Number(String(r[inCol]).replace(/[^0-9.-]/g, ''))); direction = 'in';
    }
    if (!amount) continue;
    const desc = descCol ? r[descCol] ?? '' : '';
    const vendor = vendorCol ? r[vendorCol] ?? '' : '';
    rows.push({
      date, amount, direction,
      description: desc, vendor,
      currency: (ccyCol && r[ccyCol]) || 'GBP',
      category: guessCategory(`${vendor} ${desc}`),
      raw: r,
    });
  }
  return { rows, detected: { dateCol, amountCol, outCol, inCol, descCol, vendorCol, ccyCol } };
}

export function sanitizeCategory(c: string | undefined): string {
  return c && isValidCategory(c) ? c : 'other';
}
