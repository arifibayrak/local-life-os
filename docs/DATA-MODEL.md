# Data Model & Collection Structure

All structured data lives in one SQLite file: `~/local-life-os-vault/records.db` (override with
`VAULT_PATH`). Raw captures also land in append-only markdown under `journal/`. Schema is
applied by versioned migrations in `src/vault/db.ts` (`PRAGMA user_version`).

## Vault layout

```
~/local-life-os-vault/
├── records.db            # SQLite — all structured data
├── journal/YYYY/MM/YYYY-MM-DD.md   # append-only raw captures (source of truth)
├── audio/                # voice attachments
└── .git/                 # local history, no remote
```

## Schema version 1 — capture & generic records

```sql
sessions(
  id TEXT PK, device_id TEXT='local',
  opened_at TEXT, closed_at TEXT,
  status TEXT CHECK(status IN ('open','closed','validated','persisted'))
)

captures(
  id TEXT PK, session_id TEXT → sessions(id),
  received_at TEXT, text TEXT, journal_path TEXT,
  kind TEXT='text'            -- 'text' | 'voice'
  attachment_path TEXT, skip_extract INTEGER=0
)

records(                      -- hybrid: typed common columns + per-category JSON
  id TEXT PK, session_id TEXT → sessions(id),
  category TEXT,              -- one of the 8 verticals
  created_at TEXT,
  state TEXT='proposed'       -- proposed|active|doing|done|archived|snoozed|dismissed
  state_changed_at TEXT,
  headline TEXT, notes TEXT,
  extras TEXT='{}'            -- category-specific JSON (validated by Zod)
)
```

### The 8 verticals (categories)

Defined as Zod schemas in `src/verticals/categories.ts`. The `extras` JSON for each:

| Category | `extras` fields |
|---|---|
| `tasks` | title*, due_at, priority(low/med/high), context |
| `projects` | title*, kind, status(active/paused/done), started_at, target_done_at, summary, key_contacts[] |
| `calendar` | title*, start_at*, end_at, location, description |
| `events` | title*, kind, start_at, end_at, location, attended_with[] |
| `networks` | contact_name*, contact_role, company, topics_discussed, last_interaction_at |
| `finance` | amount*, currency, vendor, category_label, occurred_on |
| `learnings` | summary*, source_kind, source_name, topic_tags[] |
| `routines` | title*, cadence_rrule*, target_per_period, occurrence_category, adherence_window_days, motivation |

`*` = required. The full field guide injected into the model lives in `categoryFieldGuide`.

## Schema version 2 — finance (ported from `brain`)

```sql
payments(
  id TEXT PK,
  amount REAL,                -- always stored positive
  currency TEXT='GBP',
  date TEXT,                  -- YYYY-MM-DD
  direction TEXT='out'        -- 'out' (spend) | 'in' (income)
  type TEXT='one-time'        -- 'one-time' | 'recurring'
  category TEXT='other',      -- finance taxonomy (below)
  description TEXT, vendor TEXT,
  recurring_freq TEXT=''      -- '' | 'monthly' | 'yearly'
  bill_day INTEGER,           -- renewal day-of-month for subscriptions
  project_id TEXT='',         -- optional link to a project/event hub
  notes TEXT, created_at TEXT
)
```

**Subscriptions are not a separate table** — they are `payments WHERE type='recurring'`, with
`recurring_freq` + `bill_day` driving next-renewal computation (`src/finance/store.ts`).

### Finance taxonomy (`src/finance/categories.ts`)

`groceries, restaurants, transport, travel, education, housing, utilities, telecom, bills,
clothing, household, tech, subscription, streaming, ai_tools, credit_cards, entertainment,
health, gifts, investment, fees, income, other`

Subscription-leaning categories: `subscription, streaming, ai_tools, telecom, bills, utilities`.

## Relationships (current & planned)

- `captures.session_id → sessions.id` (live)
- `records.session_id → sessions.id` (live)
- `payments.project_id → records.id` where category=`projects` (column exists; UI link planned)
- **Hub pattern (planned, from brain):** `projects`/`events` become hubs with join tables
  linking their own todos, payments (budget), and people met. See [ROADMAP.md](./ROADMAP.md).

## Data lifecycle (states)

```
capture ─▶ (session open) ─▶ idle close ─▶ extract ─▶ PROPOSED
PROPOSED ─approve─▶ ACTIVE ─▶ DOING ─▶ DONE ─▶ ARCHIVED
PROPOSED ─skip─▶ (discarded, never persisted)
ACTIVE/… ─▶ SNOOZED | DISMISSED
```

Raw captures are immutable. Records can change `state` (Vault dashboard buttons) but their
extracted content is preserved; re-extraction always re-reads the journal.

## Migrations

Add a new SQL string to the `MIGRATIONS` array in `src/vault/db.ts`. The loop applies any
migration whose index ≥ current `user_version`, then bumps it. Migrations are additive and
idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN` guarded by `PRAGMA table_info`).
