import { config } from '../config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Calls Qwen3.5-9B through the local MLX server's OpenAI-compatible endpoint
 * (`mlx_lm.server`). Nothing leaves the machine.
 */
export async function chat(messages: ChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      max_tokens: opts?.maxTokens ?? config.llm.maxTokens,
      temperature: opts?.temperature ?? config.llm.temperature,
      stream: false,
      // Qwen3.5 is a reasoning model: with thinking ON it spends the whole
      // token budget in <think> and never emits the answer. Turn it off so we
      // get the JSON directly in `content`.
      chat_template_kwargs: { enable_thinking: false },
    }),
  }).catch((e) => {
    throw new LlmUnavailableError(`cannot reach MLX server at ${config.llm.baseUrl} (is \`npm run model\` running?): ${String(e)}`);
  });

  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('LLM returned no content');
  return content;
}

export class LlmUnavailableError extends Error {}

/** Quick reachability check used on startup / by the UI. */
export async function llmHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${config.llm.baseUrl}/models`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
