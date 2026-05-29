# Roadmap

Direction (locked with the owner): **local-life-os supersedes `brain`** — port brain's proven
model in, add local-Qwen capture + purpose-built UIs, migrate brain's data. SQLite-only.
Calendar stays local for now; Google sync is a later opt-in.

## Status

| Module | State |
|---|---|
| Local capture (text + voice) | ✅ built |
| Qwen3.5-9B extraction (8 categories) | ✅ built, verified |
| Vault dashboard (read + state actions) | ✅ built |
| **Finance + Subscriptions** | ✅ built (entry, CSV/XLSX import, day/week/month analytics) |
| Shared UI design system | ✅ built (`public/app.css` + `public/ui.js`: modal, toasts, motion) |
| Docs | ✅ this set |
| **Network / People** | ✅ built (contacts by circle, strength, interaction log, editable) |
| Editable finance (subscriptions + transactions) | ✅ built (shared modal) |
| Todos + Projects/Events hub | ⏳ planned |
| Books · Learnings · Ideas · Feed | ⏳ planned |
| Calendar (local grid) | ⏳ planned |
| Google Calendar sync | ⏳ later, opt-in |

## Near-term

1. **Unify capture → finance.** Route Qwen's `finance` extractions into the `payments` table
   instead of the generic `records` table, so the Finance module is the single source of money.
2. **Network module** (port brain-cli `contacts` + `contact_interactions`): categories/circles,
   tags, auto relationship strength (active/warm/cold/dormant), interaction log.
3. **Todos + Projects/Events hub** (brain's event-as-hub): projects/events own their todos,
   budget (link `payments.project_id`), and people met (join table). Trello/Notion-style board.
4. **Knowledge cluster**: Books (with `recommended_by` contacts + reading sessions), Learnings
   (topics/tags/links/dated entries), Ideas/problems notebook, Feed (readlater: category +
   visit frequency).

## Module backlog (data shapes ready to port from brain)

- **Books**: title, author, status(queue/reading/finished), pages, `recommended_by[contacts]`,
  `topics[]`, reading `sessions(date, minutes, pages)`.
- **Feed**: url, title, summary, tags, status(unread/reading/done), category(News/Tech/Finance…),
  `visit_freq`(daily/weekly).
- **Ideas**: title, description, status(brainstorm/develop/shipped/archived), tags, project.
- **Calendar**: local grid over `events`/`calendar` records; later add Google OAuth read/write
  as an isolated, opt-in egress (documented in SECURITY.md).

## Platform hardening

- **Constrained decoding** for extraction (`outlines` MLX backend / GBNF) → guaranteed JSON.
- **Provenance columns** on records (capture id, prompt hash, schema version) for auditing.
- **`xlsx` advisory**: move to `@e965/xlsx` or CSV-only (see SECURITY.md).
- **Vault backup**: optional encrypted backup to a private remote you control (none by default).
- **Per-event calendar mutation gate** during validation (from the original Hermes UX).
- **Local API auth** if/when binding beyond `127.0.0.1`.

## Data migration from brain

brain stores SQLite (events, books, payments, todos) + markdown sidecars (contacts, learnings).
Migration approach per module: read brain's tables/sidecars → map to local-life-os schema →
bulk insert → commit. Finance taxonomy already matches (it was ported from brain), so brain's
`payments` rows import directly into the new `payments` table.

## Sequencing principle

Build one module **end-to-end** (schema → store → API → UI → seed → verify) before starting the
next, so every step ships something usable. Finance set the template; Network or the Todos/
Projects hub is the next vertical slice.
