import { chat, type ChatMessage } from './client.js';

/** Pull the first JSON value out of a model response (handles ```json fences and prose). */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]! : raw;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error('no JSON found in model output');
  // Walk to the matching closing bracket.
  const open = candidate[start]!;
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === open) depth++;
    else if (candidate[i] === close) {
      depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1));
    }
  }
  throw new Error('unterminated JSON in model output');
}

/**
 * Ask for JSON, parse it, validate with `parse`, and on failure send the error
 * back to the model for ONE repair pass. This is the "prompt + validate + repair"
 * approach from the spec — reliable enough for a 4-bit 9B on narrow schemas.
 * (Swap in `outlines` constrained decoding later for hard guarantees.)
 */
export async function chatJson<T>(
  messages: ChatMessage[],
  parse: (value: unknown) => T,
): Promise<T> {
  const first = await chat(messages);
  try {
    return parse(extractJson(first));
  } catch (err) {
    const repair = await chat([
      ...messages,
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: `That failed validation: ${String(err)}. Reply with ONLY corrected JSON, no prose, no code fences.`,
      },
    ]);
    return parse(extractJson(repair));
  }
}
