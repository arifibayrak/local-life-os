# local-life-os documentation

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System overview, process model, component map, design principles |
| [DATA-MODEL.md](./DATA-MODEL.md) | Vault layout, SQLite schema (all tables), the 8 verticals, finance taxonomy, relationships, migrations |
| [EXTRACTION.md](./EXTRACTION.md) | Data recognition — the Qwen extraction pipeline, the reasoning-model fix, validation/repair, voice |
| [SECURITY.md](./SECURITY.md) | Trust boundary, threat model, known risks, operational hygiene |
| [UI-UX.md](./UI-UX.md) | Shared design system: tokens, components, how to add a module's view |
| [ROADMAP.md](./ROADMAP.md) | Build status and the plan for remaining modules |

Start with ARCHITECTURE, then DATA-MODEL + EXTRACTION for how data flows, SECURITY for the
privacy guarantees, UI-UX for the frontend, ROADMAP for what's next.

The top-level [../README.md](../README.md) covers install & running.
