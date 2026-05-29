# Security & Privacy

The whole point of local-life-os is that **your personal data stays on your machine**. This
document is the trust chain, the threat model, and the known risks.

## Data-flow trust boundary

```
┌───────────────────────────── YOUR MAC ──────────────────────────────┐
│  Browser (localhost) ─▶ Daemon :3003 ─▶ Qwen via MLX :8088           │
│         │                    │                                       │
│         │                    ├─▶ whisper.cpp (voice, local)          │
│         │                    └─▶ Vault: SQLite + journal + git       │
│                                                                      │
│  No outbound network calls in the core pipeline.                     │
└──────────────────────────────────────────────────────────────────────┘
   Opt-in, off by default (future): Google Calendar sync  ─▶ Google (cloud)
```

## What goes where

| Data | Destination | Leaves machine? |
|---|---|---|
| Captures (text) | Journal + SQLite | **No** |
| Voice audio | whisper.cpp locally → text, audio stored in Vault | **No** |
| Extraction (capture text → records) | Qwen3.5-9B via local MLX server | **No** |
| Records, finance, all modules | Local SQLite (`records.db`) | **No** |
| Vault history | Local git repo, **no remote configured** | **No** |
| Bank/finance imports (CSV/XLSX) | Parsed locally, written to SQLite | **No** |
| Model weights | Downloaded once from Hugging Face, then cached | Download only |
| Google Calendar (future, opt-in) | Google API | **Yes — that module only** |

There is **no `.env` secret that is sent anywhere**. The only secret-like value would be a
future Google OAuth token, which would live in the Vault and be used solely against Google.

## Threat model

| Threat | Mitigation |
|---|---|
| **Cloud LLM leaking your notes** | No cloud LLM. Extraction runs on-device via MLX. |
| **Capture channel storing your messages** (the original Telegram problem) | Removed. Capture is a localhost web UI; messages never touch a third party. |
| **Daemon exposed to the network** | Binds `127.0.0.1` by default. LAN/phone access (`HOST=0.0.0.0`) is explicit opt-in; put it behind Tailscale, never the open internet. |
| **No auth on the local API** | Acceptable for a single-user localhost tool. If you bind to `0.0.0.0`, anyone on your LAN can reach it — only do so on a trusted network / Tailscale. |
| **Secrets committed to git** | Vault git holds only your data (journal, db); `.env` is gitignored. No remote = nothing pushed. |
| **Malicious file in bulk import** | Imports are parsed, not executed. See the `xlsx` advisory below. |
| **Prompt injection via captured text** | The model only *extracts to a fixed schema*; output is Zod-validated and never executed. Worst case is a malformed record you can reject in review. |

## Known risks & honest gaps

- **`xlsx@0.18.5` (SheetJS) has a published prototype-pollution advisory.** It parses your own
  local bank files only, so exposure is low, but it is flagged. Mitigation options: switch to
  the maintained fork `@e965/xlsx`, or restrict imports to CSV (parsed by our own dependency-free
  parser in `src/finance/import.ts`).
- **No encryption at rest.** The Vault is plaintext SQLite + markdown on your disk. Rely on
  macOS FileVault for disk encryption. (A future option: git-crypt for the Vault.)
- **No local API authentication.** Fine on `127.0.0.1`; a real risk if bound to `0.0.0.0`.
- **base64 voice uploads** are held in memory then written to `audio/`; large recordings are
  bounded only by available RAM. Keep clips short.
- **Model download is over the network** from Hugging Face (one-time). Verify you are pulling
  `mlx-community/Qwen3.5-9B-MLX-4bit`.

## Operational hygiene

- Keep `HOST=127.0.0.1` unless you deliberately need phone/LAN access.
- Back up the Vault by copying the directory or pushing its git repo to a **private** remote
  *you* control (none is configured by default — adding one re-introduces an egress point).
- The model server holds ~5–6 GB RAM while loaded; stop it with `pkill -f mlx_lm.server` when
  not in use on a 16 GB machine.
