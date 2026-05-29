# local-life-os

A fully **on-device** Personal Life OS. You dump raw thoughts (text or voice) into a
local web UI; a local LLM turns each session into structured, validated records in a
git-versioned Vault. **Nothing leaves your machine** — no Telegram, no cloud APIs.

```
Local web UI ──► whisper.cpp (voice→text) ──► Journal
                                                 │  session idle close
                                                 ▼
                         Qwen3.5-9B via MLX  (classify + extract)
                                                 │
                                        you approve / skip in the UI
                                                 ▼
                              Records DB (SQLite) + git commit
```

Stack: TypeScript daemon · `better-sqlite3` · `simple-git` · Node built-in HTTP UI ·
**Qwen3.5-9B (4-bit) through MLX** · **whisper.cpp** for voice.

## Documentation

Full docs live in [`docs/`](./docs): [architecture](./docs/ARCHITECTURE.md),
[data model](./docs/DATA-MODEL.md), [extraction/recognition](./docs/EXTRACTION.md),
[security & privacy](./docs/SECURITY.md), [UI/UX system](./docs/UI-UX.md),
[roadmap](./docs/ROADMAP.md).

## Prerequisites (one-time, all local)

1. **Node** 20+ (22/24 fine).
2. **Qwen via MLX** (Apple Silicon):
   ```bash
   pip install mlx-lm
   # weights (~5.5 GB) download on first run
   ```
3. **Voice (optional):** [`whisper.cpp`](https://github.com/ggerganov/whisper.cpp) +
   a model, and `ffmpeg` (for browser webm → wav). `brew install whisper-cpp ffmpeg`.

## Setup

```bash
cd local-life-os
npm install
cp .env.example .env        # defaults are fine; set WHISPER_BIN/MODEL if you want voice
```

## Run (two processes)

```bash
# 1. the model server (OpenAI-compatible, localhost:8080)
npm run model

# 2. the app daemon + web UI
npm start
```

Open **http://127.0.0.1:3003**. Type a thought and hit Capture. When you're done,
click **End session → review**; Qwen extracts records, you approve the good ones, and
they're committed to the Vault. (A session also auto-ends after `SESSION_IDLE_MINUTES`.)

Reach it from your phone on the same network: set `HOST=0.0.0.0` in `.env` (optionally
behind Tailscale). Your data still stays on this machine.

## Where your data lives

`~/local-life-os-vault/` (override with `VAULT_PATH`):
- `journal/YYYY/MM/YYYY-MM-DD.md` — append-only raw captures (source of truth)
- `records.db` — structured records (SQLite)
- `audio/` — voice attachments
- a local git history (no remote — intentionally nothing is pushed)

## The 8 categories

`tasks · projects · calendar · events · networks · finance · learnings · routines`
— defined as Zod schemas in `src/verticals/categories.ts`. Add/edit a category there;
that schema is the contract the extractor must satisfy.

## Layout

```
src/
  config.ts            env-driven config
  vault/               paths · db (schema + migrations) · git · journal
  llm/                 client (MLX/OpenAI-compatible) · json (extract+validate+repair)
  verticals/           categories.ts — the 8 category schemas
  agents/              extractor (classify+extract) · persister
  session/             manager.ts — capture→close→validate lifecycle
  scribe/              whisper.ts — local transcription
  server/              http API + serves the web UI
  index.ts             entry point
public/index.html      the local web UI
```

## Migrating data from the old vault

The schema mirrors the original Hermes vault. To bring your old records in, copy
`~/hermes-vault-backup/records.db` aside and import its `records` rows into this DB
(same hybrid `category` + `extras` shape).

## Notes / next steps

- **Harder JSON guarantees:** swap the prompt+repair loop in `src/llm/json.ts` for
  `outlines` (MLX backend) constrained decoding.
- **Prompts are starters** — tune the system prompt in `src/agents/extractor.ts`, or
  split into a Router + per-category Extractor for higher accuracy on the 9B.
- **Not yet wired** (tables/feature stubs from the original): nudges, weekly digests,
  Google Calendar sync. Add as needed.
- Pending proposals are held in memory between close and validate; restarting the
  daemon mid-review drops them (the journal + captures are already safely on disk).
