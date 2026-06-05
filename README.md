# gamstory

Board-game play history tracker. Local-first; optionally shared in workspaces.

## Local setup

```bash
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev          # http://localhost:3000
pnpm storybook    # http://localhost:6006
```

Requirements: Node 24 LTS, pnpm 9, Docker Desktop.

## Test commands

| Command | What it does |
|---|---|
| `pnpm typecheck` | TypeScript project references check |
| `pnpm lint` | ESLint + i18n string lint |
| `pnpm test:unit` | Vitest unit tests (happy-dom) |
| `pnpm test:int` | Vitest integration with Testcontainers Postgres |
| `pnpm test:stories` | Storybook play-function tests via test-runner |
| `pnpm test:e2e` | Playwright end-to-end |

## Layout

See `docs/superpowers/specs/2026-06-05-gamstory-design.md` for the full design.
Implementation plans live under `docs/superpowers/plans/`. This repo is at the
foundation stage — see `2026-06-05-foundation.md`. Subsequent plans add features.
