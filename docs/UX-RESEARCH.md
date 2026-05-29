# UX Research — patterns to adopt

Findings from a design-research pass over best-in-class products (Linear, Things 3, Todoist,
Notion, Superhuman, Copilot Money, Monarch, Clay/Folk). Web access was sandboxed during the
run, so these are well-established, publicly-known patterns (knowledge cutoff Jan 2026), not
freshly-cited pages — treat as "known pattern from X."

## Principles

- **One filled accent button per surface.** Verb+noun label ("Add todo"), top-right of the
  content area. Everything else neutral ghost/text. (Linear, Todoist, Monarch)
- **Cards default to zero visible action buttons** — reveal edit/delete on hover via an icon
  cluster (`visibility:hidden`→visible, no layout shift). One primary action per card. (Things 3, Linear, Notion)
- **Lists for throughput, grids for browsing, boards only when status is the axis** — and make
  view a toggle, not a forced default. Task lists are dense single-line rows (~44px). (Linear, Things, Todoist)
- **Card = scent, not record**: title + one metadata line + one status signal; detail on click/hover. (Notion, Linear)
- **Optimistic updates everywhere** — mutate the DOM instantly, reconcile async, roll back + toast on failure. Biggest perceived-quality lever. (Linear, Superhuman)
- **Undo-toast > confirm-dialog** for destructive actions. (Linear, Gmail/Superhuman)
- **Near-monochrome + one accent.** Color encodes data only: priority dots (4 steps), muted
  status pills, restrained money green/red. `tabular-nums` for all money. (Linear, Copilot, Monarch)
- **Transitions 120–200ms ease-out**, modal fade+scale 0.98→1, honor `prefers-reduced-motion`.
- **Cross-module relation chips** ("3 todos · £1,200 · 2 people") that link to scoped views —
  the differentiator for a connected life OS. (Notion relations, Folk, Clay)

## Prioritized punch-list (impact-to-effort)

1. Make every mutation optimistic; reconcile async; roll back + toast on error.
2. Add Undo to destructive toasts; drop confirm dialogs.
3. Demote card actions to hover-revealed icon cluster (no layout shift); one primary per card.
4. One accent button per page/modal, verb+noun, top-right; others neutral.
5. `font-variant-numeric: tabular-nums` on all Finance numbers; right-align amounts. ✅ (partly)
6. Semantic color system: priority dots, muted status pills, money in/out. ✅ (priority/state done)
7. Todos + Capture as dense single-line list rows (optional toggle vs board).
8. Count/overdue badges on nav pills (Capture, Todos).
9. Cross-module relation chips on Project detail, each linking to a scoped view. ✅ (rollups done; make clickable)
10. Breadcrumbs + working browser Back for drill-ins (e.g. Project → its todos). ✅ (projects has back)
11. Animated complete-todo (check draw + row fade/strike).
12. Tighten transitions; modal fade+scale; reduced-motion. ✅ (done)
13. Drag affordances: grab/grabbing cursor, lift shadow + slight scale, drop placeholder. ✅ (todos board)
14. Comfortable/compact density toggle via a `<body>` class + CSS variables.
15. Keyboard command palette (Cmd/Ctrl-K) + "go to" module jump (g+key).

## Status in this codebase

Done or partly done are ticked above. Highest-value remaining: **optimistic updates + undo
toasts (#1, #2)**, **hover-revealed card actions (#3)**, **nav count badges (#8)**, and a
**Cmd-K command palette (#15)**.
