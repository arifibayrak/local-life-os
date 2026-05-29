# UI / UX Structure

All views share one design system so the app feels cohesive and every future module inherits
the same look without copy-pasting CSS.

## Structure

- **`public/app.css`** — the single source of truth: design tokens + component classes.
  Served by the daemon at `/app.css`; every page links it.
- **Pages** (`public/*.html`) hold only their markup + page-specific JS. No `<style>` blocks.
- **Shell** — every page opens with the same `.topbar` (brand + status dot + `.nav` tabs)
  inside an `.app` container. Adding a module = add a `.nav` link and a new page that links
  `app.css`.

## Design tokens (CSS variables)

Defined in `:root` with a `prefers-color-scheme: dark` override — light/dark is automatic.

| Token | Purpose |
|---|---|
| `--bg`, `--surface` | page background, card background |
| `--text`, `--muted` | primary / secondary text |
| `--line`, `--soft` | borders, subtle fills |
| `--accent`, `--accent-weak` | brand actions, focus rings |
| `--success`, `--danger` | income/done, spend/delete |
| `--radius`, `--radius-sm`, `--shadow` | shape & depth |
| `--maxw`, `--font` | layout width, typeface |

## Component vocabulary

| Class | Use |
|---|---|
| `.app`, `.topbar`, `.brand`, `.nav a(.active)`, `.dot(.ok)` | the shell + model-status dot |
| `.card`, `.card > h2` / `.section-title` | content blocks with uppercase section headers |
| `.cards` + `.stat` (`.k`/`.v`, `.v.out`/`.v.in`) | KPI tiles |
| `.grid-2` | two-column responsive layout (stacks < 720px) |
| `.btn`(`.ghost`), `button.primary`, `button.mini` | actions |
| `input/select/textarea`, `.formrow` | forms (consistent focus ring) |
| `.toggle button.on` | segmented control (e.g. day/week/month) |
| `.bars .b`, `.catrow` + `.catbar` | CSS-only charts (no JS chart lib) |
| `.pill`, `.badge`(`.done`/`.doing`) | category tags & state badges |
| `table`, `.num` | data tables, right-aligned numerics |
| `.rec`, `.cap`, `.sub`, `.empty` | record cards, capture chips, subscription rows, empty states |

## Principles

1. **One stylesheet, token-driven.** Restyle the whole app by editing tokens, not pages.
2. **Charts are CSS, not libraries.** Keeps the bundle dependency-free and fast (the spending
   trend and category bars are super-lightweight `div`s).
3. **Dark mode for free** via `color-scheme` + token overrides.
4. **Accessible by default**: visible focus rings, tabular-numerics for money, semantic tables.
5. **Mobile-aware**: the shell and grids collapse for phone/LAN access.

## Adding a new module's view

1. Create `public/<module>.html`, link `/app.css`, copy the `.topbar` shell.
2. Add an `<a href="/<module>">` to the `.nav` in every page (and the new one marks itself
   `.active`).
3. Add a `GET /<module>` route in `src/server/index.ts` that serves the file.
4. Build with the existing components — only add new CSS to `app.css` if a genuinely new
   pattern is needed, and make it token-based.
