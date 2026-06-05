# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the gamstory project foundation — a TanStack Start app that boots, with Postgres in Docker, Drizzle + Better Auth tables, i18n, CSP, the AppError contract, full test toolchain (Vitest unit + integration, Storybook with test-runner, Playwright), and CI — so that all later plans can land features on a stable base.

**Architecture:** Greenfield. TanStack Start (Vite + Nitro) on the front and Vercel-bound Node runtime on the back. Postgres in Docker for local dev (Neon in prod, wired by later plans). Better Auth is scaffolded with no OAuth providers wired yet — providers come in Plan 3. The AppError discriminated union and Zod-validated env config become contracts that subsequent plans depend on.

**Tech Stack:** TanStack Start, TanStack Router, TanStack Query, React 19, TypeScript, Vite, Tailwind, shadcn/ui, Dexie (installed but not exercised until Plan 2), Better Auth, Drizzle ORM, drizzle-kit, Postgres 16, Docker Compose, Vitest, Testcontainers, Storybook 9 + test-runner + MSW, Playwright, GitHub Actions, pnpm.

This plan is the first of six. Plans that depend on this:
- Plan 2 — Anonymous local-first (Dexie tables + UI)
- Plan 3 — Workspaces + invites (OAuth providers, workspace tables)
- Plan 4 — Upload + sync (play tables, photo chain)
- Plan 5 — Reactions + comments (social tables)
- Plan 6 — Hardening (rate limits, e2e)

Spec reference: `docs/superpowers/specs/2026-06-05-gamstory-design.md`.

---

## Pre-flight (one-time, before Task 1)

Confirm host has:
- Node.js 24 LTS (`node --version` → v24.x)
- pnpm 9+ (`pnpm --version`)
- Docker Desktop running (`docker info` succeeds)
- Git (`git --version`)

If any are missing, install before starting Task 1.

---

## Task 1: Initialise the project repository

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.npmrc`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `README.md`

- [ ] **Step 1: Initialise git**

Run from `/Users/zerokoo/Projects/zerokoo/gamstory`:

```bash
git init -b main
```

Expected: `Initialized empty Git repository in .../gamstory/.git/`.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "gamstory",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=24.0.0" },
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test:unit": "vitest run --project unit",
    "test:int": "vitest run --project integration",
    "test:watch": "vitest --project unit",
    "test:stories": "test-storybook",
    "test:e2e": "playwright test",
    "storybook": "storybook dev -p 6006",
    "storybook:build": "storybook build",
    "db:up": "docker compose up -d postgres redis",
    "db:down": "docker compose down",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`** (empty workspace declaration, future-proofing for monorepo split if ever needed)

```yaml
packages: []
```

- [ ] **Step 4: Create `.nvmrc`**

```
24
```

- [ ] **Step 5: Create `.npmrc`**

```
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=false
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules
dist
.output
.vinxi
.tanstack
.cache
coverage
playwright-report
test-results
storybook-static
.DS_Store
*.log
.env
.env.local
.env.*.local
.vercel
```

- [ ] **Step 7: Create root `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "~/*": ["src/*"]
    },
    "types": ["vite/client"]
  },
  "include": ["src/**/*", "tests/**/*", "vite.config.ts", "vitest.config.ts", "drizzle.config.ts"],
  "exclude": ["node_modules", "dist", ".output"]
}
```

- [ ] **Step 8: Create `README.md`**

```markdown
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
```

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: initialise project skeleton"
```

---

## Task 2: Scaffold TanStack Start app

**Files:**
- Create: `vite.config.ts`
- Create: `app.config.ts`
- Create: `index.html`
- Create: `src/router.tsx`
- Create: `src/client.tsx`
- Create: `src/ssr.tsx`
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/styles/globals.css`

- [ ] **Step 1: Install TanStack Start + React 19 + Vite**

```bash
pnpm add react react-dom
pnpm add @tanstack/react-router @tanstack/react-start @tanstack/react-query @tanstack/react-router-devtools
pnpm add -D @tanstack/router-plugin @types/react @types/react-dom @vitejs/plugin-react vite typescript
```

- [ ] **Step 2: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '~': path.resolve(__dirname, 'src') },
  },
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: 'src/routes',
      generatedRouteTree: 'src/routeTree.gen.ts',
    }),
    react(),
  ],
});
```

- [ ] **Step 3: Create `app.config.ts`** (TanStack Start config)

```ts
import { defineConfig } from '@tanstack/react-start/config';

export default defineConfig({
  server: {
    preset: 'vercel',
    routeRules: {
      '/**': {
        headers: {
          'Content-Security-Policy':
            "default-src 'self'; img-src 'self' data: https://*.public.blob.vercel-storage.com; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.vercel-storage.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Require-Trusted-Types-For': "'script'",
        },
      },
    },
  },
  vite: { plugins: [] },
});
```

- [ ] **Step 4: Create `src/router.tsx`**

```ts
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';

export function createRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: (count, err: any) => {
        const code = err?.code;
        if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'VALIDATION' || code === 'CONFLICT') return false;
        return count < 3;
      } },
    },
  });
  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
```

- [ ] **Step 5: Create `src/client.tsx` and `src/ssr.tsx`**

`src/client.tsx`:
```tsx
import { StartClient } from '@tanstack/react-start';
import { hydrateRoot } from 'react-dom/client';
import { createRouter } from './router';

const router = createRouter();
hydrateRoot(document, <StartClient router={router} />);
```

`src/ssr.tsx`:
```ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server';
import { createRouter } from './router';

export default createStartHandler({ createRouter })(defaultStreamHandler);
```

- [ ] **Step 6: Create `src/routes/__root.tsx`**

```tsx
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { Meta, Scripts } from '@tanstack/react-start';
import type { QueryClient } from '@tanstack/react-query';
import '../styles/globals.css';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'gamstory' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="ko-KR">
      <head>
        <Meta />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Create `src/routes/index.tsx`** (smoke route — replaced in Plan 2)

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <main data-testid="home-root" className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">gamstory</h1>
      <p>Foundation booted.</p>
    </main>
  );
}
```

- [ ] **Step 8: Create `src/styles/globals.css`** (Tailwind layers added in Task 4)

```css
/* base global resets — Tailwind directives added in Task 4 */
:root { color-scheme: light dark; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
```

- [ ] **Step 9: Run dev server smoke**

```bash
pnpm dev
```

Expected: dev server boots on http://localhost:3000 with no errors; visiting the URL shows "gamstory" + "Foundation booted." Stop with `Ctrl+C`.

- [ ] **Step 10: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "feat: scaffold TanStack Start app with CSP headers"
```

---

## Task 3: Vitest unit setup + first smoke test

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/smoke.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
pnpm add -D vitest @vitest/ui happy-dom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '~': path.resolve(__dirname, 'src') } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'happy-dom',
          include: ['tests/unit/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['tests/integration/**', 'tests/e2e/**'],
          setupFiles: ['./tests/setup/unit.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.{test,spec}.ts'],
          setupFiles: ['./tests/setup/integration.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
```

- [ ] **Step 3: Create `tests/setup/unit.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Create `tests/setup/integration.ts`** (placeholder; Task 9 fills it)

```ts
// Filled in by Task 9 (Testcontainers harness)
export {};
```

- [ ] **Step 5: Write failing smoke test**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain smoke', () => {
  it('runs vitest', () => {
    expect(2 + 2).toBe(4);
  });
});
```

- [ ] **Step 6: Run it**

```bash
pnpm test:unit
```

Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: vitest unit harness with happy-dom"
```

---

## Task 4: Tailwind + shadcn/ui

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `components.json`
- Modify: `src/styles/globals.css`
- Create: `src/components/ui/button.tsx`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Install Tailwind + shadcn deps**

```bash
pnpm add -D tailwindcss @tailwindcss/vite postcss autoprefixer
pnpm add tailwind-variants tailwind-merge class-variance-authority clsx lucide-react
```

- [ ] **Step 2: Add Tailwind v4 vite plugin to `vite.config.ts`**

Modify the plugins array in `vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // ... existing ...
  plugins: [
    TanStackRouterVite({ /* ... */ }),
    tailwindcss(),
    react(),
  ],
});
```

- [ ] **Step 3: Replace `src/styles/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-background: #ffffff;
  --color-foreground: #0a0a0a;
  --color-primary: #18181b;
  --color-primary-foreground: #fafafa;
  --color-muted: #f4f4f5;
  --color-muted-foreground: #71717a;
  --color-border: #e4e4e7;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-background: #0a0a0a;
    --color-foreground: #fafafa;
    --color-primary: #fafafa;
    --color-primary-foreground: #18181b;
    --color-muted: #27272a;
    --color-muted-foreground: #a1a1aa;
    --color-border: #27272a;
  }
}

body { background: var(--color-background); color: var(--color-foreground); }
```

- [ ] **Step 4: Create `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Create `components.json` (shadcn config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "~/components",
    "utils": "~/lib/utils",
    "ui": "~/components/ui"
  }
}
```

- [ ] **Step 6: Create `src/components/ui/button.tsx`** (hand-written; matches shadcn output)

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-border bg-background hover:bg-muted',
        ghost: 'hover:bg-muted',
      },
      size: { default: 'h-9 px-4 py-2', sm: 'h-8 px-3', lg: 'h-10 px-6' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
```

- [ ] **Step 7: Write a unit test for Button**

Create `src/components/ui/button.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders text content and default classes', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('bg-primary');
  });

  it('respects variant prop', () => {
    render(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole('button')).toHaveClass('border');
  });
});
```

- [ ] **Step 8: Run tests**

```bash
pnpm test:unit
```

Expected: 3 passed.

- [ ] **Step 9: Boot dev to visually confirm Tailwind applies**

```bash
pnpm dev
```

Expected: the home page renders with Tailwind classes (no longer plain text). Stop with Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat: tailwind v4 + shadcn-style Button primitive"
```

---

## Task 5: Storybook 9 + MSW + test-runner

**Files:**
- Create: `.storybook/main.ts`
- Create: `.storybook/preview.tsx`
- Create: `.storybook/test-runner.ts`
- Create: `src/components/ui/button.stories.tsx`
- Create: `public/mockServiceWorker.js` (generated)

- [ ] **Step 1: Install Storybook**

```bash
pnpm dlx storybook@latest init --type react_vite --yes
```

Expected: Storybook scaffolds. Accept default eslint/test-runner offers.

- [ ] **Step 2: Add MSW + test-runner**

```bash
pnpm add -D msw msw-storybook-addon @storybook/test-runner @storybook/addon-themes @storybook/addon-a11y
pnpm dlx msw init public/ --save
```

- [ ] **Step 3: Replace `.storybook/main.ts`**

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.@(ts|tsx)',
  ],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-themes',
    '@storybook/addon-a11y',
    'msw-storybook-addon',
  ],
  framework: { name: '@storybook/react-vite', options: {} },
  staticDirs: ['../public'],
};

export default config;
```

- [ ] **Step 4: Replace `.storybook/preview.tsx`**

```tsx
import type { Preview } from '@storybook/react';
import { initialize, mswLoader } from 'msw-storybook-addon';
import '../src/styles/globals.css';

initialize({ onUnhandledRequest: 'bypass' });

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'todo' },
  },
  globalTypes: {
    locale: {
      description: 'Locale',
      defaultValue: 'ko-KR',
      toolbar: {
        title: 'Locale',
        icon: 'globe',
        items: [
          { value: 'ko-KR', title: '한국어' },
          { value: 'en', title: 'English' },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
```

- [ ] **Step 5: Create `.storybook/test-runner.ts`**

```ts
import type { TestRunnerConfig } from '@storybook/test-runner';
import { getStoryContext } from '@storybook/test-runner';

const config: TestRunnerConfig = {
  async preVisit(page) {
    await page.evaluate(() => {
      window.localStorage.clear();
    });
  },
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    if (storyContext.tags?.includes('skip-test-runner')) return;
  },
};
export default config;
```

- [ ] **Step 6: Write a Button story**

Create `src/components/ui/button.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { within, expect } from '@storybook/test';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { children: 'Click me' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  },
};

export const Outline: Story = {
  args: { children: 'Outline', variant: 'outline' },
};
```

- [ ] **Step 7: Run Storybook locally**

```bash
pnpm storybook
```

Expected: opens on http://localhost:6006 with the Button stories visible. Stop with Ctrl+C.

- [ ] **Step 8: Build Storybook + run test-runner**

```bash
pnpm storybook:build
npx http-server storybook-static -p 6007 -s &
SB_PID=$!
sleep 2
TARGET_URL=http://127.0.0.1:6007 pnpm test:stories
kill $SB_PID
```

Expected: tests pass (Default story's play function passes).

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: storybook 9 with MSW addon and play-function test-runner"
```

---

## Task 6: Docker Compose for Postgres + Redis

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.env.local`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: gamstory-postgres
    environment:
      POSTGRES_USER: gamstory
      POSTGRES_PASSWORD: gamstory
      POSTGRES_DB: gamstory
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gamstory -d gamstory"]
      interval: 3s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: gamstory-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 10

volumes:
  postgres-data:
```

- [ ] **Step 2: Create `.env.example`**

```
# Database
DATABASE_URL=postgres://gamstory:gamstory@localhost:5432/gamstory

# Better Auth (Plan 1 generates the secret)
BETTER_AUTH_SECRET=replace-me-with-openssl-rand-32
BETTER_AUTH_URL=http://localhost:3000
REFRESH_TOKEN_ENC_KEY=replace-me-with-openssl-rand-32

# OAuth providers (Plan 3 wires these)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=

# Rate limiter (local dev uses ioredis against the Docker container)
REDIS_URL=redis://localhost:6379

# Vercel Blob (Plan 4 uses this)
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 3: Create `.env.local`**

Run:

```bash
node -e "console.log('BETTER_AUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env.local
node -e "console.log('REFRESH_TOKEN_ENC_KEY=' + require('crypto').randomBytes(32).toString('hex'))" >> .env.local
```

Then edit `.env.local` to include:

```
DATABASE_URL=postgres://gamstory:gamstory@localhost:5432/gamstory
BETTER_AUTH_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379
# Plus the two generated lines above
```

- [ ] **Step 4: Boot the containers**

```bash
pnpm db:up
```

Expected: both containers report healthy within ~10s. Verify:

```bash
docker compose ps
```

Expected: `postgres` and `redis` both `(healthy)`.

- [ ] **Step 5: Sanity-check Postgres connection**

```bash
docker exec -i gamstory-postgres psql -U gamstory -d gamstory -c "select 1"
```

Expected: returns `1`.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: docker compose for postgres + redis"
```

Note: `.env.local` is gitignored.

---

## Task 7: Drizzle ORM + Better Auth tables

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/server/db/client.ts`
- Create: `src/server/db/schema.ts`
- Create: `src/server/db/migrations/.gitkeep`

- [ ] **Step 1: Install Drizzle**

```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

- [ ] **Step 2: Create `drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
```

Install dotenv: `pnpm add -D dotenv`.

- [ ] **Step 3: Create `src/server/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '~/lib/config';
import * as schema from './schema';

const queryClient = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  prepare: false,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
```

(Note: `~/lib/config` is created in Task 8. This file will fail typecheck until then — order matters.)

- [ ] **Step 4: Create `src/server/db/schema.ts` with Better Auth tables**

```ts
import { pgTable, text, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userEmailUq: uniqueIndex('user_email_uq').on(t.email),
}));

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionTokenUq: uniqueIndex('session_token_uq').on(t.token),
}));

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  accountProviderUq: uniqueIndex('account_provider_uq').on(t.providerId, t.accountId),
}));

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 5: Create migrations dir placeholder**

```bash
mkdir -p src/server/db/migrations && touch src/server/db/migrations/.gitkeep
```

- [ ] **Step 6: Generate first migration**

```bash
pnpm db:generate
```

Expected: a `0000_*.sql` file appears under `src/server/db/migrations/`.

- [ ] **Step 7: Run migration against the Docker DB**

```bash
pnpm db:migrate
```

Expected: applies cleanly. Verify:

```bash
docker exec -i gamstory-postgres psql -U gamstory -d gamstory -c "\dt"
```

Expected: lists `user`, `session`, `account`, `verification`, `__drizzle_migrations`.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: drizzle orm with better-auth schema and initial migration"
```

---

## Task 8: Env config validation (Zod)

**Files:**
- Create: `src/lib/config.ts`
- Create: `src/lib/config.test.ts`

- [ ] **Step 1: Install Zod**

```bash
pnpm add zod
```

- [ ] **Step 2: Write the failing test first**

Create `src/lib/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('lib/config', () => {
  const saved = { ...process.env };
  beforeEach(() => { for (const k of Object.keys(process.env)) delete process.env[k]; });
  afterEach(() => { for (const k of Object.keys(process.env)) delete process.env[k]; Object.assign(process.env, saved); });

  it('parses a minimally valid env', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@h:5432/d';
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(64);
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.REFRESH_TOKEN_ENC_KEY = 'b'.repeat(64);
    process.env.REDIS_URL = 'redis://localhost:6379';
    const mod = await import('./config?test=' + Math.random());
    expect(mod.config.DATABASE_URL).toBe('postgres://u:p@h:5432/d');
  });

  it('throws when required vars are missing', async () => {
    await expect(import('./config?test=' + Math.random())).rejects.toThrow(/invalid env/i);
  });
});
```

- [ ] **Step 3: Run it — should fail**

```bash
pnpm test:unit src/lib/config.test.ts
```

Expected: fails because `~/lib/config` does not exist yet.

- [ ] **Step 4: Create `src/lib/config.ts`**

```ts
import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  REFRESH_TOKEN_ENC_KEY: z.string().min(32),
  REDIS_URL: z.string().url(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  KAKAO_CLIENT_ID: z.string().optional(),
  KAKAO_CLIENT_SECRET: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`invalid env: ${parsed.error.message}`);
}

export const config = parsed.data;
export type Config = z.infer<typeof Env>;
```

- [ ] **Step 5: Run the test again**

```bash
pnpm test:unit src/lib/config.test.ts
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: zod-validated env config (lib/config.ts)"
```

---

## Task 9: AppError discriminated union

**Files:**
- Create: `src/lib/validators/app-error.ts`
- Create: `src/lib/validators/app-error.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/validators/app-error.test.ts`:

```ts
import { describe, it, expect, expectTypeOf } from 'vitest';
import { AppError, type AppErrorCode, isAppError } from './app-error';

describe('AppError', () => {
  it('constructs with required fields', () => {
    const err = new AppError({ code: 'NOT_FOUND', message: 'no' });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.message).toBe('no');
  });

  it('CONFLICT(stale) carries serverVersion', () => {
    const err = new AppError({ code: 'CONFLICT', message: 'stale', details: { subcode: 'stale', serverVersion: 7 } });
    expect(err.status).toBe(409);
    if (err.code === 'CONFLICT' && err.details?.subcode === 'stale') {
      expect(err.details.serverVersion).toBe(7);
    } else {
      throw new Error('narrowing failed');
    }
  });

  it('RATE_LIMITED carries retryAfterSec', () => {
    const err = new AppError({ code: 'RATE_LIMITED', message: 'slow down', details: { retryAfterSec: 30 } });
    expect(err.status).toBe(429);
  });

  it('isAppError narrows', () => {
    const err: unknown = new AppError({ code: 'INTERNAL', message: 'x' });
    expect(isAppError(err)).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
  });

  it('exhaustiveness — every code maps to a status', () => {
    const codes: AppErrorCode[] = ['UNAUTHORIZED','FORBIDDEN','NOT_FOUND','VALIDATION','CONFLICT','RATE_LIMITED','STORAGE_FULL','INTERNAL'];
    for (const c of codes) {
      const e = new AppError({ code: c, message: c });
      expect(e.status).toBeGreaterThanOrEqual(400);
    }
    expectTypeOf<AppErrorCode>().toMatchTypeOf<'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'VALIDATION'|'CONFLICT'|'RATE_LIMITED'|'STORAGE_FULL'|'INTERNAL'>();
  });
});
```

- [ ] **Step 2: Run it — fails**

```bash
pnpm test:unit src/lib/validators/app-error.test.ts
```

Expected: fails because the module doesn't exist yet.

- [ ] **Step 3: Create `src/lib/validators/app-error.ts`**

```ts
export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'STORAGE_FULL'
  | 'INTERNAL';

export type AppErrorDetails =
  | { subcode: 'stale'; serverVersion: number }
  | { subcode: 'invite_expired' }
  | { subcode: 'invite_exhausted' }
  | { subcode: 'invite_revoked' }
  | { subcode: 'duplicate' }
  | { retryAfterSec: number }
  | { fields: Record<string, string> }
  | Record<string, unknown>;

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  STORAGE_FULL: 507,
  INTERNAL: 500,
};

export interface AppErrorInit {
  code: AppErrorCode;
  message: string;
  details?: AppErrorDetails;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: AppErrorDetails;
  constructor(init: AppErrorInit) {
    super(init.message, { cause: init.cause });
    this.name = 'AppError';
    this.code = init.code;
    this.status = STATUS_BY_CODE[init.code];
    this.details = init.details;
  }
  toJSON() {
    return { code: this.code, message: this.message, status: this.status, details: this.details };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test:unit src/lib/validators/app-error.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: AppError discriminated union with closed code set"
```

---

## Task 10: Better Auth server config + API route (no providers yet)

**Files:**
- Create: `src/server/auth/better-auth.ts`
- Create: `src/lib/auth-client.ts`
- Create: `src/routes/api/auth/$.ts`
- Create: `src/server/auth/better-auth.test.ts`

- [ ] **Step 1: Install Better Auth**

```bash
pnpm add better-auth
```

- [ ] **Step 2: Create `src/server/auth/better-auth.ts`** (skeleton — providers wired in Plan 3)

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '~/server/db/client';
import { config } from '~/lib/config';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    cookiePrefix: '__Host-gamstory',
    useSecureCookies: config.NODE_ENV === 'production',
    cookieAttributes: { sameSite: 'lax', httpOnly: true, path: '/' },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: [],
      allowDifferentEmails: false,
    },
  },
  // social providers added in Plan 3 (google, kakao)
});

export type Auth = typeof auth;
```

- [ ] **Step 3: Create `src/lib/auth-client.ts`**

```ts
import { createAuthClient } from 'better-auth/react';
import { config } from './config';

export const authClient = createAuthClient({
  baseURL: config.BETTER_AUTH_URL,
});
```

- [ ] **Step 4: Mount Better Auth handler at `routes/api/auth/$.ts`**

```ts
import { createAPIFileRoute } from '@tanstack/react-start/api';
import { auth } from '~/server/auth/better-auth';

export const APIRoute = createAPIFileRoute('/api/auth/$')({
  GET: ({ request }) => auth.handler(request),
  POST: ({ request }) => auth.handler(request),
});
```

- [ ] **Step 5: Write a smoke test**

Create `src/server/auth/better-auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { auth } from './better-auth';

describe('better-auth scaffold', () => {
  it('exposes a handler', () => {
    expect(typeof auth.handler).toBe('function');
  });

  it('has no OAuth providers wired in Plan 1', () => {
    expect(auth.options.socialProviders ?? {}).toEqual({});
  });
});
```

- [ ] **Step 6: Run tests**

Set env first (required by `~/lib/config`):

```bash
export DATABASE_URL=postgres://gamstory:gamstory@localhost:5432/gamstory
export BETTER_AUTH_SECRET=$(node -e "console.log('a'.repeat(64))")
export BETTER_AUTH_URL=http://localhost:3000
export REFRESH_TOKEN_ENC_KEY=$(node -e "console.log('b'.repeat(64))")
export REDIS_URL=redis://localhost:6379
pnpm test:unit src/server/auth/better-auth.test.ts
```

Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: better-auth scaffold (no providers) mounted at /api/auth"
```

---

## Task 11: Testcontainers + integration test harness

**Files:**
- Modify: `tests/setup/integration.ts`
- Create: `tests/integration/db.test.ts`

- [ ] **Step 1: Install Testcontainers**

```bash
pnpm add -D @testcontainers/postgresql testcontainers
```

- [ ] **Step 2: Replace `tests/setup/integration.ts`**

```ts
import { afterAll, beforeAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../../src/server/db/schema';

let container: StartedPostgreSqlContainer | undefined;
let sql: ReturnType<typeof postgres> | undefined;

declare global {
  // eslint-disable-next-line no-var
  var __TEST_DB__: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  sql = postgres(url, { max: 5 });
  const db = drizzle(sql, { schema });
  await migrate(db, { migrationsFolder: './src/server/db/migrations' });
  globalThis.__TEST_DB__ = db;
}, 120_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await container?.stop();
}, 60_000);

export function getTestDb() {
  if (!globalThis.__TEST_DB__) throw new Error('Test DB not initialised');
  return globalThis.__TEST_DB__;
}
```

- [ ] **Step 3: Set required env for integration tests**

The integration harness rewrites `DATABASE_URL`, but `config.ts` is loaded once. Use Vitest's `env` field. Add to `vitest.config.ts` inside the `integration` project's `test`:

```ts
env: {
  DATABASE_URL: 'postgres://placeholder/placeholder',
  BETTER_AUTH_SECRET: 'a'.repeat(64),
  BETTER_AUTH_URL: 'http://localhost:3000',
  REFRESH_TOKEN_ENC_KEY: 'b'.repeat(64),
  REDIS_URL: 'redis://localhost:6379',
  NODE_ENV: 'test',
},
```

- [ ] **Step 4: Write a sanity test**

Create `tests/integration/db.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getTestDb } from '../setup/integration';
import { user } from '../../src/server/db/schema';

describe('db integration', () => {
  it('can insert and read a user row', async () => {
    const db = getTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Tester', email: 'tester@example.com' });
    const rows = await db.select().from(user);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.find((r) => r.id === 'u1')?.email).toBe('tester@example.com');
  });
});
```

- [ ] **Step 5: Run integration**

```bash
pnpm test:int
```

Expected: 1 passed (Testcontainers takes ~30-60s the first time as it pulls the image).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: testcontainers integration harness + db sanity test"
```

---

## Task 12: i18n — messages, locale hook, root lang setter

**Files:**
- Create: `src/lib/i18n/messages/ko.json`
- Create: `src/lib/i18n/messages/en.json`
- Create: `src/lib/i18n/use-locale.ts`
- Create: `src/lib/i18n/I18nProvider.tsx`
- Create: `src/lib/i18n/use-locale.test.ts`
- Modify: `src/routes/__root.tsx`
- Modify: `src/routes/index.tsx`

- [ ] **Step 1: Create message files**

`src/lib/i18n/messages/ko.json`:
```json
{
  "common.appName": "gamstory",
  "common.boot.ok": "기반이 부팅되었습니다."
}
```

`src/lib/i18n/messages/en.json`:
```json
{
  "common.appName": "gamstory",
  "common.boot.ok": "Foundation booted."
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/i18n/use-locale.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { detectLocale, type Locale } from './use-locale';

describe('detectLocale', () => {
  beforeEach(() => { localStorage.clear(); });

  it('respects ?lang query first', () => {
    expect(detectLocale({ url: 'https://x/?lang=en', navigator: 'ko-KR' })).toBe('en');
  });

  it('falls back to localStorage', () => {
    localStorage.setItem('gamstory:locale', 'en');
    expect(detectLocale({ url: 'https://x/', navigator: 'ko-KR' })).toBe('en');
  });

  it('uses navigator next', () => {
    expect(detectLocale({ url: 'https://x/', navigator: 'en-US' })).toBe('en');
  });

  it('defaults to ko-KR', () => {
    expect(detectLocale({ url: 'https://x/', navigator: 'fr-FR' })).toBe('ko-KR');
  });

  it('rejects unsupported ?lang and falls through', () => {
    expect(detectLocale({ url: 'https://x/?lang=fr', navigator: 'en' })).toBe('en');
  });

  it('returns a Locale type', () => {
    const v: Locale = detectLocale({ url: 'https://x/', navigator: 'ko-KR' });
    expect(['ko-KR', 'en']).toContain(v);
  });
});
```

- [ ] **Step 3: Run it — fails**

```bash
pnpm test:unit src/lib/i18n/use-locale.test.ts
```

- [ ] **Step 4: Create `src/lib/i18n/use-locale.ts`**

```ts
import * as React from 'react';

export type Locale = 'ko-KR' | 'en';
const STORAGE_KEY = 'gamstory:locale';
const SUPPORTED: ReadonlyArray<Locale> = ['ko-KR', 'en'];
export const DEFAULT_LOCALE: Locale = 'ko-KR';

function normaliseTag(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower === 'ko' || lower.startsWith('ko-')) return 'ko-KR';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return null;
}

export function detectLocale(opts?: { url?: string; navigator?: string }): Locale {
  const urlStr = opts?.url ?? (typeof window !== 'undefined' ? window.location.href : '');
  const navTag = opts?.navigator ?? (typeof navigator !== 'undefined' ? navigator.language : '');

  if (urlStr) {
    try {
      const url = new URL(urlStr);
      const q = url.searchParams.get('lang');
      const fromQuery = normaliseTag(q);
      if (fromQuery && SUPPORTED.includes(fromQuery)) return fromQuery;
    } catch { /* ignore malformed */ }
  }

  if (typeof localStorage !== 'undefined') {
    const stored = normaliseTag(localStorage.getItem(STORAGE_KEY));
    if (stored && SUPPORTED.includes(stored)) return stored;
  }

  const fromNav = normaliseTag(navTag);
  if (fromNav && SUPPORTED.includes(fromNav)) return fromNav;

  return DEFAULT_LOCALE;
}

export function setLocale(locale: Locale) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const [locale, setLocaleState] = React.useState<Locale>(() => detectLocale());
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return [locale, (l) => { setLocale(l); setLocaleState(l); }];
}
```

- [ ] **Step 5: Create `src/lib/i18n/I18nProvider.tsx`** (minimal — no formatter library yet; we use a plain message bag)

```tsx
import * as React from 'react';
import ko from './messages/ko.json';
import en from './messages/en.json';
import { detectLocale, type Locale } from './use-locale';

type MessageBag = Record<string, string>;
const BAGS: Record<Locale, MessageBag> = { 'ko-KR': ko, en };

interface Ctx {
  locale: Locale;
  t: (key: keyof typeof ko) => string;
  setLocale: (l: Locale) => void;
}
const I18nContext = React.createContext<Ctx | null>(null);

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale ?? detectLocale());
  const t = React.useCallback((key: keyof typeof ko) => BAGS[locale][key] ?? BAGS['en'][key] ?? String(key), [locale]);
  const setLocale = React.useCallback((l: Locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gamstory:locale', l);
      document.documentElement.lang = l;
    }
    setLocaleState(l);
  }, []);
  React.useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={{ locale, t, setLocale }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be inside I18nProvider');
  return ctx;
}
```

- [ ] **Step 6: Wire the provider in `src/routes/__root.tsx`**

Replace `RootComponent` body:

```tsx
function RootComponent() {
  return (
    <html lang="ko-KR">
      <head>
        <Meta />
      </head>
      <body>
        <I18nProvider>
          <Outlet />
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

Add the import at the top:
```tsx
import { I18nProvider } from '~/lib/i18n/I18nProvider';
```

- [ ] **Step 7: Update `src/routes/index.tsx`** to consume `useI18n`

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useI18n } from '~/lib/i18n/I18nProvider';

export const Route = createFileRoute('/')({ component: HomeRoute });

function HomeRoute() {
  const { t, locale, setLocale } = useI18n();
  return (
    <main data-testid="home-root" className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">{t('common.appName')}</h1>
      <p data-testid="home-boot-msg">{t('common.boot.ok')}</p>
      <button onClick={() => setLocale(locale === 'ko-KR' ? 'en' : 'ko-KR')} className="mt-4 underline">
        {locale === 'ko-KR' ? 'English' : '한국어'}
      </button>
    </main>
  );
}
```

- [ ] **Step 8: Add a component test for I18nProvider**

Create `src/lib/i18n/I18nProvider.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, useI18n } from './I18nProvider';

function Probe() {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <span data-testid="msg">{t('common.boot.ok')}</span>
      <span data-testid="locale">{locale}</span>
      <button onClick={() => setLocale('en')}>en</button>
    </>
  );
}

describe('I18nProvider', () => {
  it('renders Korean by default and switches to English', () => {
    render(<I18nProvider initialLocale="ko-KR"><Probe /></I18nProvider>);
    expect(screen.getByTestId('msg').textContent).toBe('기반이 부팅되었습니다.');
    fireEvent.click(screen.getByText('en'));
    expect(screen.getByTestId('msg').textContent).toBe('Foundation booted.');
    expect(screen.getByTestId('locale').textContent).toBe('en');
  });
});
```

- [ ] **Step 9: Run all unit tests**

```bash
pnpm test:unit
```

Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat: i18n provider with ko-KR + en, locale detection, html lang setter"
```

---

## Task 13: Hardcoded-string ESLint rule

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json` (already has lint script; ensure config is picked up)

- [ ] **Step 1: Install ESLint + plugins**

```bash
pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-react-refresh eslint-plugin-i18next prettier eslint-config-prettier eslint-plugin-prettier
```

- [ ] **Step 2: Create `eslint.config.js`** (flat config)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import i18next from 'eslint-plugin-i18next';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', '.output', '.vinxi', '.tanstack', 'src/routeTree.gen.ts', 'storybook-static', 'coverage', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { window: true, document: true, navigator: true } },
    plugins: { react, 'react-hooks': reactHooks, i18next },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'i18next/no-literal-string': ['warn', { mode: 'jsx-text-only', 'jsx-attributes': { include: ['title', 'alt', 'placeholder', 'aria-label'] } }],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: { 'i18next/no-literal-string': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}', 'tests/**/*'],
    rules: { 'i18next/no-literal-string': 'off' },
  },
  prettier,
);
```

- [ ] **Step 3: Create `.prettierrc`**

```json
{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 100, "tabWidth": 2 }
```

- [ ] **Step 4: Create `.prettierignore`**

```
dist
.output
.vinxi
.tanstack
storybook-static
coverage
src/routeTree.gen.ts
pnpm-lock.yaml
```

- [ ] **Step 5: Run lint**

```bash
pnpm lint
```

Expected: passes (or only warnings; no errors). If `i18next/no-literal-string` fires on legitimate places, refine the rule above. Hardcoded `<h1>Plain</h1>` in non-test JSX should warn.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: eslint flat config + prettier + i18n string lint"
```

---

## Task 14: Playwright skeleton + smoke

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm dlx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

- [ ] **Step 3: Create `tests/e2e/smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('home renders the boot message', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-root')).toBeVisible();
  await expect(page.getByTestId('home-boot-msg')).toBeVisible();
});
```

- [ ] **Step 4: Run it**

```bash
pnpm test:e2e
```

Expected: 1 passed. The dev server boots automatically.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: playwright skeleton with smoke spec"
```

---

## Task 15: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: gamstory
          POSTGRES_PASSWORD: gamstory
          POSTGRES_DB: gamstory
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U gamstory" --health-interval 3s
          --health-timeout 3s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping" --health-interval 3s
          --health-timeout 3s --health-retries 10
    env:
      DATABASE_URL: postgres://gamstory:gamstory@localhost:5432/gamstory
      BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET_CI || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }}
      BETTER_AUTH_URL: http://localhost:3000
      REFRESH_TOKEN_ENC_KEY: ${{ secrets.REFRESH_TOKEN_ENC_KEY_CI || 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }}
      REDIS_URL: redis://localhost:6379
      NODE_ENV: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '24', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm db:migrate
      - run: pnpm test:unit
      - run: pnpm test:int
      - run: pnpm storybook:build
      - name: Run Storybook test-runner
        run: |
          npx http-server storybook-static -p 6007 -s &
          sleep 3
          TARGET_URL=http://127.0.0.1:6007 pnpm test:stories
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "ci: github actions running typecheck, lint, unit, integration, storybook"
```

- [ ] **Step 3: Push and verify CI passes**

If a remote is configured:

```bash
git push -u origin main
```

Then check the Actions tab on the host. If the project doesn't have a remote yet, skip this step — the workflow is in place for when one is added.

---

## Task 16: README polish + plan handoff

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: foundation-stage readme"
```

---

## Done — Acceptance criteria for Plan 1

Run all of the following and confirm green:

```bash
pnpm db:up                # postgres + redis healthy
pnpm db:migrate           # better-auth tables migrated
pnpm typecheck            # no TS errors
pnpm lint                 # no lint errors (warnings OK)
pnpm test:unit            # all unit tests pass
pnpm test:int             # testcontainers run + sanity test passes
pnpm storybook:build      # builds with no errors
pnpm test:e2e             # playwright smoke passes
pnpm dev                  # boot the dev server on :3000
```

Manually verify in the browser:
- `http://localhost:3000` shows "gamstory" + "기반이 부팅되었습니다." (Korean by default).
- Click the language toggle → text becomes "Foundation booted."
- `<html lang>` updates to match.
- DevTools → Network → Response headers contain the CSP and `Require-Trusted-Types-For`.

The foundation is ready for Plan 2 (Anonymous local-first), which will add Dexie tables, local CRUD, list + calendar views, the play form, and the photo worker.

---

## Self-review notes

This plan was self-reviewed against `docs/superpowers/specs/2026-06-05-gamstory-design.md` for foundation coverage:

- **Architecture / tech-stack section** — TanStack Start + Vite + Drizzle + Better Auth + Tailwind + shadcn + Vitest + Storybook + Playwright + CSP / Trusted Types: covered by Tasks 2, 4–7, 10–11, 14, 13.
- **AppError discriminated union (§6)** — Task 9.
- **Env validation (Appendix A)** — Task 8.
- **i18n with detection order URL>storage>navigator>ko-KR (§5)** — Task 12.
- **Hardcoded-string lint (§7)** — Task 13.
- **Docker Postgres + drizzle migrations (§2)** — Tasks 6, 7.
- **Testcontainers integration harness (§7)** — Task 11.
- **Storybook with MSW + test-runner (§7)** — Task 5.
- **CSP + Trusted Types (§8)** — Task 2 (routeRules).
- **Better Auth API route via createAPIFileRoute (§4.2, §5)** — Task 10.
- **CI workflow shape (§7)** — Task 15.

Not in Plan 1 (deferred to later plans, per the decomposition above):
- Dexie tables and local CRUD → Plan 2
- OAuth providers (Google/Kakao), session middleware → Plan 3
- Workspace tables and invites → Plan 3
- Play / participant / photo / outbox tables → Plan 4
- Comment / reaction tables → Plan 5
- Rate-limit policies, webview e2e project → Plan 6
