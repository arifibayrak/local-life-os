# Architecture

local-life-os is a **fully on-device Personal Life OS**. You capture raw thoughts (text or
voice) into a local web UI; a local LLM turns each session into structured, validated records
in a git-versioned SQLite Vault; purpose-built views (Vault, Finance, …) let you read and act
on them. **Nothing leaves the machine** (the only planned exception is opt-in Google Calendar
sync, isolated and off by default).

## System diagram

```
  Browser (localhost web UI)
     │  text / voice (mic)
     ▼
  HTTP daemon (Node/TS, src/server)
     │
     ├─ voice ─▶ Scribe (whisper.cpp, local) ──▶ text
     │
     ▼
  Journal (append-only markdown)  ◀── source of truth
     │   session idle-close (default 15 min)
     ▼
  Extractor (Qwen3.5-9B via MLX, local OpenAI-compatible API)
     │   classify + extract → JSON
     ▼
  Zod validation (per-category schema)  ── repair pass on failure
     │
     ▼
  Operator validation (approve / edit / skip in the UI)
     │
     ▼
  Persister ─▶ records.db (SQLite) + journal links + git commit
                         │
                         ▼
           Read/act views: Vault dashboard · Finance · (more coming)
```

## Process model (two local processes)

| Process | What | Command | Port |
|---|---|---|---|
| **Model server** | Qwen3.5-9B served by MLX, OpenAI-compatible | `npm run model` | `:8088` |
| **App daemon** | HTTP API + serves the web UI + owns the Vault | `npm start` | `:3003` |

The daemon talks to the model over `http://127.0.0.1:8088/v1`. If the model is down, capture
and all read views still work; only extraction is unavailable.

## Component map

| Area | Path | Responsibility |
|---|---|---|
| Config | `src/config.ts` | Env-driven config (vault path, ports, model, whisper, idle) |
| Vault — DB | `src/vault/db.ts` | SQLite open + versioned migrations |
| Vault — paths | `src/vault/paths.ts` | Vault directory layout |
| Vault — git | `src/vault/git.ts` | Local git init + commit (no remote) |
| Vault — journal | `src/vault/journal.ts` | Append-only daily markdown |
| Vault — records | `src/vault/records.ts` | Read view + state changes for generic records |
| LLM client | `src/llm/client.ts` | Calls Qwen via MLX; thinking disabled for JSON |
| LLM json | `src/llm/json.ts` | Extract JSON from output + validate + 1 repair pass |
| Verticals | `src/verticals/categories.ts` | The 8 categories as Zod schemas + field guides |
| Extractor | `src/agents/extractor.ts` | Classify + extract records from session text |
| Persister | `src/agents/persister.ts` | Insert approved records + commit |
| Session | `src/session/manager.ts` | capture → idle-close → validate lifecycle |
| Scribe | `src/scribe/whisper.ts` | Local voice transcription (whisper.cpp) |
| Finance | `src/finance/{categories,store,import}.ts` | Payments, subscriptions, analytics, CSV/XLSX import |
| Server | `src/server/index.ts` | HTTP routes + static UI |
| UI | `public/*.html`, `public/app.css` | Capture, Vault, Finance views + shared design system |

## Design principles

1. **Local-first, zero-egress by default.** No cloud LLM, no cloud storage, no telemetry. The
   capture channel is a localhost web UI (Telegram was removed precisely because it is cloud).
2. **Journal is the source of truth.** Raw captures are appended verbatim and never mutated;
   structured records are *derived* and can always be re-derived.
3. **Operator-in-the-loop.** The model proposes; you approve. Nothing is persisted as a record
   without your confirmation.
4. **Deterministic where possible.** Validation, rendering, dates, and analytics are plain
   code (Zod/SQLite). The LLM is reserved for the genuinely generative steps.
5. **Git as history.** Every persist is a commit; the Vault is a local git repo with no remote.

See also: [DATA-MODEL.md](./DATA-MODEL.md), [EXTRACTION.md](./EXTRACTION.md),
[SECURITY.md](./SECURITY.md), [ROADMAP.md](./ROADMAP.md), [UI-UX.md](./UI-UX.md).
