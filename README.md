# gamstory

Board-game play history tracker. Local-first, optionally shared in workspaces.

See `docs/superpowers/specs/2026-06-05-gamstory-design.md` for the design and
`docs/superpowers/plans/` for the implementation plans.

## Local setup

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

Requires Node 24 LTS, pnpm 9, Docker Desktop.
