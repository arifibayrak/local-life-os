import { z } from 'zod';
import { chatJson } from '../llm/json.js';
import { CATEGORY_NAMES, categoryHints, categoryFieldGuide, schemaFor, type CategoryName } from '../verticals/categories.js';

export interface ProposedRecord {
  category: CategoryName;
  headline: string;
  notes: string | null;
  extras: Record<string, unknown>;
}

const rawRecord = z.object({
  category: z.enum(CATEGORY_NAMES as [CategoryName, ...CategoryName[]]),
  headline: z.string(),
  notes: z.string().nullable().default(null),
  extras: z.record(z.unknown()).default({}),
});

const SYSTEM = `You are the extraction engine of a personal life OS. The operator dictates raw notes; you turn them into structured records.

Categories and the exact "extras" fields each one expects:
${CATEGORY_NAMES.map((c) => `- ${c} (${categoryHints[c]})\n    extras: ${categoryFieldGuide[c]}`).join('\n')}

Rules:
- Output ONLY a JSON array, no prose, no code fences.
- One object per distinct item. If the text holds nothing worth recording, output [].
- Each object: { "category", "headline" (short title), "notes" (optional context or null), "extras" (the fields listed for that category) }.
- "extras" MUST include every field marked (req) for the chosen category, using those exact key names.
- Never invent facts that are not in the text. Omit optional fields you cannot fill.
- Resolve relative dates against the provided "now" timestamp; output ISO 8601.`;

/**
 * Classify + extract in one call (the Router/Extractor pair from the spec, fused
 * for a small model). Returns only records whose extras validate against their
 * category schema; invalid ones are dropped rather than persisted as garbage.
 */
export async function extractRecords(sessionText: string, now: Date): Promise<ProposedRecord[]> {
  if (!sessionText.trim()) return [];

  const candidates = await chatJson(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `now: ${now.toISOString()}\n\nNotes:\n${sessionText}` },
    ],
    (value) => z.array(rawRecord).parse(value),
  );

  const out: ProposedRecord[] = [];
  for (const c of candidates) {
    const schema = schemaFor(c.category);
    if (!schema) continue;
    const validated = schema.safeParse(c.extras);
    if (!validated.success) continue; // skip records that don't fit their category contract
    out.push({ category: c.category, headline: c.headline, notes: c.notes, extras: validated.data });
  }
  return out;
}
