# Data Recognition & Extraction

How raw input becomes structured records — the "recognition" pipeline. All of it runs locally
on Qwen3.5-9B via MLX; no text leaves the machine.

## Pipeline

```
capture text ──▶ Extractor prompt (system + user) ──▶ Qwen3.5-9B (MLX)
                                                          │  JSON array
                                                          ▼
                              extractJson()  ── strip fences/prose, balance brackets
                                                          │
                                                          ▼
                              Zod parse per category  ──fail──▶ 1 repair pass
                                                          │
                                                          ▼
                              validated records (invalid ones dropped)
                                                          │
                                                          ▼
                              operator approves/edits/skips ──▶ persisted
```

Source: `src/agents/extractor.ts`, `src/llm/json.ts`, `src/llm/client.ts`.

## 1. Classify + extract (fused)

For a small model, one **narrow, schema-bound** call beats a sprawling one. The system prompt
lists the 8 categories with a one-line hint and the **exact `extras` fields each expects**
(from `categoryFieldGuide`), and asks for a JSON array of
`{category, headline, notes, extras}`. Rules enforced in the prompt:

- Output **only** a JSON array — no prose, no code fences.
- One object per distinct item; empty array if nothing is worth recording.
- `extras` must include every required field for the chosen category, by exact key name.
- Never invent facts not in the text; omit unknown optional fields.
- Resolve relative dates ("tomorrow afternoon") against a provided `now` ISO timestamp.

## 2. The reasoning-model gotcha (critical)

Qwen3.5 is a **thinking model**. Left alone it spends the entire token budget inside
`<think>…</think>` and returns **empty `content`**. The client disables this per request:

```jsonc
// src/llm/client.ts → body
"chat_template_kwargs": { "enable_thinking": false }
```

With thinking off, the model returns the JSON array directly in `content`,
`finish_reason: "stop"`. This single flag is what makes local extraction usable.

## 3. JSON recovery

`extractJson()` (`src/llm/json.ts`) is defensive: it strips ```` ```json ```` fences, finds the
first `[`/`{`, and walks to the balanced closing bracket — so stray prose or trailing tokens
don't break parsing.

## 4. Validation + repair (instead of an LLM "auditor")

Each record's `extras` is validated against its category's Zod schema. Deterministic validation
is cheaper and far more reliable than asking the model to self-audit. If the whole array fails
to parse, `chatJson()` sends the validation error back for **one repair pass**; individual
records that don't fit their schema are dropped rather than persisted as garbage.

> Hardening path: swap the prompt+repair loop for **constrained decoding** via `outlines`
> (MLX backend) or a GBNF grammar, making invalid JSON structurally impossible. See ROADMAP.

## 5. Operator validation

Proposed records render in the Capture UI; you approve, edit, or skip per record (calendar
mutations get a per-event gate in the original design — planned here). Only approved records are
written to `records.db` and committed.

## Voice recognition (Scribe)

Voice notes are recorded in-browser, POSTed as base64 to `/api/voice`, written to the Vault's
`audio/`, and transcribed **locally** by whisper.cpp (`src/scribe/whisper.ts`). If `ffmpeg` is
present the audio is converted to 16 kHz mono WAV first. Requires `WHISPER_BIN` + `WHISPER_MODEL`
in `.env`; otherwise voice is cleanly disabled. The transcript then enters the same pipeline as
typed text.

## Quality & tuning

- **Prompts are starters.** Tune the system prompt in `src/agents/extractor.ts` and the
  per-category field guide in `src/verticals/categories.ts`.
- **Per-category extractors.** For higher accuracy, split into a Router (pick category) then a
  category-specific Extractor with only that schema in context.
- **Determinism.** `temperature: 0` by default for repeatable extraction.
- **Cost/latency.** ~22 tok/s on an M4; keep `LLM_MAX_TOKENS` modest (default 1024) since
  thinking-off JSON for a session is small.

## Observability

The `records` table can carry provenance columns (capture id, prompt hashes, schema version) —
present in the original Hermes schema and a planned addition here for "which prompt produced
this record" auditing.
