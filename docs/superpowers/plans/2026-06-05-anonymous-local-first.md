# Anonymous Local-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make gamstory fully usable offline with no account — log plays, manage games and members, attach photos, browse via list and calendar views. All data persists in IndexedDB via Dexie.

**Architecture:** Two new layers land in this plan. (1) A browser-only `src/local/*` data API that wraps Dexie; routes that touch Dexie are `ssr: false`. UI reads via `useLiveQuery` from `dexie-react-hooks`; UI never imports Dexie directly. (2) A `src/workers/photo-processor.ts` Web Worker that strips EXIF, normalises orientation, sniffs MIME magic bytes, and produces thumbnails — keeping image work off the main thread. Routes use TanStack Router's `validateSearch` for filter state. Plan 1's Better Auth scaffold and Postgres setup are untouched.

**Tech Stack (added to Plan 1):** Dexie 4, dexie-react-hooks, fake-indexeddb, exifr (server-side metadata reader for tests' GPS-absence assertion), react-hook-form, @hookform/resolvers, zod (already installed), shadcn primitives (Card, Input, Label, Textarea, Select, Dialog, Drawer, Form, Calendar primitives).

This plan is the second of six. Depends on Plan 1 (foundation) being complete. Subsequent plans:
- Plan 3 — Workspaces + invites (OAuth providers, workspace tables)
- Plan 4 — Upload + sync (play/photo tables, photo chain)
- Plan 5 — Reactions + comments
- Plan 6 — Hardening (rate limits, e2e)

Spec reference: `docs/superpowers/specs/2026-06-05-gamstory-design.md` — primarily §3 (data model: Local schema), §4.1 (anonymous quick-log), §4.5 (list view), §4.6 (calendar view), §5 (module boundaries: `local/`, `features/`, `routes/`, `workers/`), §6 (photo handling, IndexedDB quota), §7 (testing: liveQuery integration, migration tests, EXIF-absence assertion).

---

## Pre-flight

Confirm Plan 1 is committed and green:

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:int && pnpm test:e2e
```

All must pass before starting. Docker should be running for the integration test (`docker info`).

---

## Phase A — Data layer (Tasks 1–5)

## Task 1: Dexie setup + schema v1 + migration tests

**Files:**
- Create: `src/local/db/schema.ts`
- Create: `src/local/db/client.ts`
- Create: `src/local/db/migrations.ts`
- Create: `src/local/db/migrations.test.ts`
- Create: `tests/setup/local-db.ts`

- [ ] **Step 1: Install Dexie + react hooks + fake-indexeddb**

```bash
pnpm add -w dexie dexie-react-hooks
pnpm add -w -D fake-indexeddb
```

- [ ] **Step 2: Create `src/local/db/schema.ts`**

```ts
import type { Table } from 'dexie';

export type Locale = 'ko-KR' | 'en';

export interface LocalGame {
  id: string;            // ulid
  name: string;
  imageBlob?: Blob;
  createdAt: number;     // epoch ms
}

export interface LocalMemberLink {
  workspaceId: string;
  workspacePlayerId: string;
}

export interface LocalMember {
  id: string;
  name: string;
  avatarBlob?: Blob;
  links: LocalMemberLink[];
  createdAt: number;
}

export type GameRef =
  | { kind: 'global'; id: string }
  | { kind: 'local'; id: string };

export interface LocalPlayParticipant {
  localMemberId: string;
  rank?: number;
  score?: number;
  isWinner: boolean;
  order: number;
}

export type SyncState = 'local' | 'uploading' | 'uploaded' | 'failed';

export interface LocalPlay {
  id: string;
  gameRef: GameRef;
  playedAt: number;         // epoch ms (date-only granularity at write time, but stored as ms)
  participants: LocalPlayParticipant[];
  description?: string;
  photoIds: string[];
  remote?: { workspaceId: string; playId: string; version: number };
  syncState: SyncState;
  idempotencyKey: string;   // uuid v4
  createdAt: number;
  updatedAt: number;
}

export interface LocalPhoto {
  id: string;
  playId: string;
  blob: Blob;
  order: number;
  mimeType: string;
  byteSize: number;
  width?: number;
  height?: number;
  uploadState?: 'pending' | 'uploaded' | 'failed';
  createdAt: number;
}

export interface GameCacheEntry {
  id: string;           // global game id
  name: string;
  imageUrl?: string;
  year?: number;
  minPlayers?: number;
  maxPlayers?: number;
  cachedAt: number;
}

export interface LocalSchemaV1 {
  localGames: Table<LocalGame, string>;
  localMembers: Table<LocalMember, string>;
  localPlays: Table<LocalPlay, string>;
  localPhotos: Table<LocalPhoto, string>;
  gameCache: Table<GameCacheEntry, string>;
}

export const DEXIE_DB_NAME = 'gamstory';
export const DEXIE_VERSION = 1;
```

- [ ] **Step 3: Create `src/local/db/migrations.ts`**

```ts
import Dexie from 'dexie';
import type { LocalSchemaV1 } from './schema';
import { DEXIE_VERSION } from './schema';

/**
 * Apply versioned Dexie schema upgrades. Each version step is idempotent
 * given the prior version's data shape. Tests assert lossless upgrades.
 */
export function applyMigrations(db: Dexie) {
  db.version(1).stores({
    localGames: 'id, name, createdAt',
    localMembers: 'id, name, createdAt',
    localPlays: 'id, syncState, playedAt, gameRef.id, createdAt, updatedAt',
    localPhotos: 'id, playId, [playId+order], createdAt',
    gameCache: 'id, name, cachedAt',
  });
  // Future versions chain via db.version(2).stores(...).upgrade(...).
  return db as Dexie & LocalSchemaV1;
}

export { DEXIE_VERSION };
```

- [ ] **Step 4: Create `src/local/db/client.ts`**

```ts
import Dexie from 'dexie';
import type { LocalSchemaV1 } from './schema';
import { DEXIE_DB_NAME } from './schema';
import { applyMigrations } from './migrations';

let cached: (Dexie & LocalSchemaV1) | undefined;

export function getLocalDb(): Dexie & LocalSchemaV1 {
  if (cached) return cached;
  const db = new Dexie(DEXIE_DB_NAME) as Dexie & LocalSchemaV1;
  applyMigrations(db);
  cached = db;
  return cached;
}

// Test-only: drop the cached instance so a fresh Dexie can be created on a
// reset IndexedDB. Do NOT call from app code.
export function __resetLocalDbForTests() {
  cached?.close();
  cached = undefined;
}
```

- [ ] **Step 5: Create `tests/setup/local-db.ts`**

```ts
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import Dexie from 'dexie';
import { __resetLocalDbForTests } from '../../src/local/db/client';
import { DEXIE_DB_NAME } from '../../src/local/db/schema';

afterEach(async () => {
  __resetLocalDbForTests();
  await Dexie.delete(DEXIE_DB_NAME);
});
```

- [ ] **Step 6: Wire the new setup into Vitest's `unit` project**

Modify `vitest.config.ts` — append `'./tests/setup/local-db.ts'` to the `setupFiles` array on the `unit` project. Final shape:

```ts
setupFiles: ['./tests/setup/unit.ts', './tests/setup/local-db.ts'],
```

- [ ] **Step 7: Write migration tests (RED)**

Create `src/local/db/migrations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { applyMigrations, DEXIE_VERSION } from './migrations';
import { DEXIE_DB_NAME } from './schema';

async function fresh() {
  await Dexie.delete(DEXIE_DB_NAME);
  const db = new Dexie(DEXIE_DB_NAME);
  applyMigrations(db);
  await db.open();
  return db;
}

describe('Dexie migrations', () => {
  it('opens at the current version', async () => {
    const db = await fresh();
    expect(db.verno).toBe(DEXIE_VERSION);
    db.close();
  });

  it('creates the v1 tables', async () => {
    const db = await fresh();
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(['gameCache', 'localGames', 'localMembers', 'localPhotos', 'localPlays']);
    db.close();
  });

  it('localPhotos has a [playId+order] compound index', async () => {
    const db = await fresh();
    const photos = db.table('localPhotos');
    const indexes = photos.schema.indexes.map((i) => i.name).sort();
    expect(indexes).toContain('[playId+order]');
    db.close();
  });

  it('inserts and reads a row through v1 schema', async () => {
    const db = await fresh();
    await db.table('localGames').put({ id: 'g1', name: 'Catan', createdAt: 1 });
    const row = await db.table('localGames').get('g1');
    expect(row?.name).toBe('Catan');
    db.close();
  });
});
```

- [ ] **Step 8: Run — RED**

```bash
pnpm test:unit src/local/db/migrations.test.ts
```

Expected: tests fail because the schema/migrations files aren't importable from a test environment that lacks IndexedDB until the setup loads. After Step 6 they should pass.

- [ ] **Step 9: Run — GREEN**

```bash
pnpm test:unit src/local/db/migrations.test.ts
```

Expected: 4 passed.

- [ ] **Step 10: Full test sweep**

```bash
pnpm test:unit
```

Expected: 19 + 4 = 23 passing.

- [ ] **Step 11: Commit**

```bash
git add src/local/db tests/setup/local-db.ts vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat: dexie v1 schema + migrations harness with fake-indexeddb"
```

---

## Task 2: Local games CRUD

**Files:**
- Create: `src/local/games.ts`
- Create: `src/local/games.test.ts`

- [ ] **Step 1: Install ulid**

```bash
pnpm add -w ulid
```

- [ ] **Step 2: Write tests (RED)**

Create `src/local/games.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createLocalGame, listLocalGames, updateLocalGame, deleteLocalGame, getLocalGame } from './games';

describe('local games', () => {
  it('creates a game and returns the row', async () => {
    const g = await createLocalGame({ name: 'Catan' });
    expect(g.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(g.name).toBe('Catan');
    expect(typeof g.createdAt).toBe('number');
  });

  it('lists games newest first', async () => {
    await createLocalGame({ name: 'First' });
    await new Promise((r) => setTimeout(r, 2));
    await createLocalGame({ name: 'Second' });
    const rows = await listLocalGames();
    expect(rows.map((r) => r.name)).toEqual(['Second', 'First']);
  });

  it('updates a name', async () => {
    const g = await createLocalGame({ name: 'Settlers' });
    await updateLocalGame(g.id, { name: 'Catan' });
    const after = await getLocalGame(g.id);
    expect(after?.name).toBe('Catan');
  });

  it('deletes', async () => {
    const g = await createLocalGame({ name: 'Risk' });
    await deleteLocalGame(g.id);
    expect(await getLocalGame(g.id)).toBeUndefined();
  });

  it('rejects empty name', async () => {
    await expect(createLocalGame({ name: '   ' })).rejects.toThrow(/name/i);
  });
});
```

- [ ] **Step 3: Run — RED**

```bash
pnpm test:unit src/local/games.test.ts
```

Expected: fails (module missing).

- [ ] **Step 4: Implement `src/local/games.ts`**

```ts
import { ulid } from 'ulid';
import { getLocalDb } from './db/client';
import type { LocalGame } from './db/schema';

export interface CreateLocalGameInput {
  name: string;
  imageBlob?: Blob;
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Game name is required');
  if (trimmed.length > 200) throw new Error('Game name is too long');
  return trimmed;
}

export async function createLocalGame(input: CreateLocalGameInput): Promise<LocalGame> {
  const name = assertName(input.name);
  const row: LocalGame = {
    id: ulid(),
    name,
    imageBlob: input.imageBlob,
    createdAt: Date.now(),
  };
  await getLocalDb().localGames.add(row);
  return row;
}

export async function getLocalGame(id: string): Promise<LocalGame | undefined> {
  return getLocalDb().localGames.get(id);
}

export async function listLocalGames(): Promise<LocalGame[]> {
  return getLocalDb()
    .localGames.orderBy('createdAt')
    .reverse()
    .toArray();
}

export async function updateLocalGame(id: string, patch: Partial<Pick<LocalGame, 'name' | 'imageBlob'>>): Promise<void> {
  const update: Partial<LocalGame> = {};
  if (patch.name !== undefined) update.name = assertName(patch.name);
  if (patch.imageBlob !== undefined) update.imageBlob = patch.imageBlob;
  if (Object.keys(update).length === 0) return;
  await getLocalDb().localGames.update(id, update);
}

export async function deleteLocalGame(id: string): Promise<void> {
  await getLocalDb().localGames.delete(id);
}
```

- [ ] **Step 5: Run — GREEN**

```bash
pnpm test:unit src/local/games.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/local/games.ts src/local/games.test.ts package.json pnpm-lock.yaml
git commit -m "feat: local games CRUD with ulid + Dexie"
```

---

## Task 3: Local members CRUD with workspace links

**Files:**
- Create: `src/local/members.ts`
- Create: `src/local/members.test.ts`

- [ ] **Step 1: Tests (RED)**

Create `src/local/members.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createLocalMember,
  listLocalMembers,
  updateLocalMember,
  deleteLocalMember,
  linkMemberToWorkspaceUser,
  unlinkMemberFromWorkspace,
  getLocalMember,
} from './members';

describe('local members', () => {
  it('creates a member', async () => {
    const m = await createLocalMember({ name: 'Alice' });
    expect(m.name).toBe('Alice');
    expect(m.links).toEqual([]);
  });

  it('lists members alphabetically', async () => {
    await createLocalMember({ name: 'Charlie' });
    await createLocalMember({ name: 'Alice' });
    await createLocalMember({ name: 'Bob' });
    const rows = await listLocalMembers();
    expect(rows.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('updates display name', async () => {
    const m = await createLocalMember({ name: 'Bob' });
    await updateLocalMember(m.id, { name: 'Robert' });
    expect((await getLocalMember(m.id))?.name).toBe('Robert');
  });

  it('links and unlinks workspace players', async () => {
    const m = await createLocalMember({ name: 'Alice' });
    await linkMemberToWorkspaceUser(m.id, { workspaceId: 'w1', workspacePlayerId: 'p1' });
    let after = await getLocalMember(m.id);
    expect(after?.links).toEqual([{ workspaceId: 'w1', workspacePlayerId: 'p1' }]);

    // re-linking same workspace replaces the existing link
    await linkMemberToWorkspaceUser(m.id, { workspaceId: 'w1', workspacePlayerId: 'p2' });
    after = await getLocalMember(m.id);
    expect(after?.links).toEqual([{ workspaceId: 'w1', workspacePlayerId: 'p2' }]);

    // linking a different workspace adds without removing the first
    await linkMemberToWorkspaceUser(m.id, { workspaceId: 'w2', workspacePlayerId: 'p3' });
    after = await getLocalMember(m.id);
    expect(after?.links).toEqual([
      { workspaceId: 'w1', workspacePlayerId: 'p2' },
      { workspaceId: 'w2', workspacePlayerId: 'p3' },
    ]);

    await unlinkMemberFromWorkspace(m.id, 'w1');
    after = await getLocalMember(m.id);
    expect(after?.links).toEqual([{ workspaceId: 'w2', workspacePlayerId: 'p3' }]);
  });

  it('rejects empty name', async () => {
    await expect(createLocalMember({ name: '' })).rejects.toThrow();
  });

  it('deletes', async () => {
    const m = await createLocalMember({ name: 'Z' });
    await deleteLocalMember(m.id);
    expect(await getLocalMember(m.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — RED**

```bash
pnpm test:unit src/local/members.test.ts
```

- [ ] **Step 3: Implement `src/local/members.ts`**

```ts
import { ulid } from 'ulid';
import { getLocalDb } from './db/client';
import type { LocalMember, LocalMemberLink } from './db/schema';

export interface CreateLocalMemberInput {
  name: string;
  avatarBlob?: Blob;
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Member name is required');
  if (trimmed.length > 80) throw new Error('Member name is too long');
  return trimmed;
}

export async function createLocalMember(input: CreateLocalMemberInput): Promise<LocalMember> {
  const name = assertName(input.name);
  const row: LocalMember = {
    id: ulid(),
    name,
    avatarBlob: input.avatarBlob,
    links: [],
    createdAt: Date.now(),
  };
  await getLocalDb().localMembers.add(row);
  return row;
}

export async function getLocalMember(id: string): Promise<LocalMember | undefined> {
  return getLocalDb().localMembers.get(id);
}

export async function listLocalMembers(): Promise<LocalMember[]> {
  const all = await getLocalDb().localMembers.toArray();
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateLocalMember(
  id: string,
  patch: Partial<Pick<LocalMember, 'name' | 'avatarBlob'>>,
): Promise<void> {
  const update: Partial<LocalMember> = {};
  if (patch.name !== undefined) update.name = assertName(patch.name);
  if (patch.avatarBlob !== undefined) update.avatarBlob = patch.avatarBlob;
  if (Object.keys(update).length === 0) return;
  await getLocalDb().localMembers.update(id, update);
}

export async function deleteLocalMember(id: string): Promise<void> {
  await getLocalDb().localMembers.delete(id);
}

export async function linkMemberToWorkspaceUser(memberId: string, link: LocalMemberLink): Promise<void> {
  const db = getLocalDb();
  await db.transaction('rw', db.localMembers, async () => {
    const m = await db.localMembers.get(memberId);
    if (!m) throw new Error(`Member ${memberId} not found`);
    const filtered = m.links.filter((l) => l.workspaceId !== link.workspaceId);
    filtered.push(link);
    await db.localMembers.update(memberId, { links: filtered });
  });
}

export async function unlinkMemberFromWorkspace(memberId: string, workspaceId: string): Promise<void> {
  const db = getLocalDb();
  await db.transaction('rw', db.localMembers, async () => {
    const m = await db.localMembers.get(memberId);
    if (!m) return;
    const filtered = m.links.filter((l) => l.workspaceId !== workspaceId);
    await db.localMembers.update(memberId, { links: filtered });
  });
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm test:unit src/local/members.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/local/members.ts src/local/members.test.ts
git commit -m "feat: local members CRUD with per-workspace links"
```

---

## Task 4: Photo worker — magic-byte sniff, EXIF strip, thumbnail

**Files:**
- Create: `src/workers/photo-processor.ts`
- Create: `src/workers/photo-processor.test.ts`
- Create: `src/local/photos.ts`
- Create: `src/local/photos.test.ts`
- Create: `tests/fixtures/photos/with-gps.jpg.base64` (small JPEG with synthetic EXIF GPS — use a checked-in base64 string)
- Modify: `package.json` (add fixture helper script if needed; otherwise skip)

- [ ] **Step 1: Install image processing deps**

```bash
pnpm add -w -D exifr
```

We use `exifr` only in tests to assert "no GPS tags in the post-strip blob." The runtime worker uses `createImageBitmap` + `OffscreenCanvas`, no library needed.

- [ ] **Step 2: Add the GPS-stamped fixture**

The fixture is a tiny (3×3 pixel) JPEG hand-built with EXIF GPS tags. Store as base64 to keep the repo binary-free.

Create `tests/fixtures/photos/with-gps.jpg.base64`:

```
/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEB
AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAADAAMD
ASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUF
BAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0
NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKj
pKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oA
DAMBAAIRAxEAPwD9/KKKKACiiigD/9k=
```

(This is a placeholder 3×3 JPEG without EXIF; for the GPS-absence assertion, the test will write its own GPS-stamped JPEG using `exifr`'s sibling lib `piexifjs` OR — simpler — generate a JPEG in-test using `OffscreenCanvas`+`exifr` round-trip. Rewrite Step 2 to skip the on-disk fixture and instead synthesise the input in-test (Step 4). Delete this file step.)

(Drop Step 2's fixture file. Use Step 4's in-test synthesis below.)

- [ ] **Step 3: Install `piexifjs` (test-only) for synthesising EXIF GPS**

```bash
pnpm add -w -D piexifjs
```

- [ ] **Step 4: Write tests for the worker (RED)**

Create `src/workers/photo-processor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { processImage, sniffMime } from './photo-processor';
import piexif from 'piexifjs';
import exifr from 'exifr';

function makeTinyJpegBytes(): Uint8Array {
  // Minimal 1×1 white JPEG (hex literal sourced from the JFIF spec).
  const hex = (
    'ffd8ffe000104a46494600010101006000600000ffdb004300080606070605' +
    '08070706090908' +
    '0a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c2024362c20272a2c2b' +
    '2c2c1d2f31302e3134333133' +
    'ffdb0043010c0c0c111111171818175b272a275b51474751' +
    '5151515151515151515151515151515151515151' +
    '5151515151515151515151515151515151515151515151515151' +
    'ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000' +
    '0000000001020304050607080910111213141516171819' +
    'ffc400b5100002010303020403050504040000017d010203041105122131410613516107' +
    '227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435' +
    '363738393a434445464748494a535455565758595a636465666768696a737475767778' +
    '797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8' +
    'b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5' +
    'f6f7f8f9faffda000c03010002110311003f00fbd3ffd9'
  );
  return Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

function withGps(jpegBytes: Uint8Array): Uint8Array {
  // piexifjs operates on binary strings, not Uint8Array
  const binary = Array.from(jpegBytes).map((b) => String.fromCharCode(b)).join('');
  const exifObj = {
    '0th': {},
    'Exif': {},
    'GPS': {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: [[37, 1], [33, 1], [0, 1]], // ~Seoul
      [piexif.GPSIFD.GPSLongitudeRef]: 'E',
      [piexif.GPSIFD.GPSLongitude]: [[126, 1], [58, 1], [0, 1]],
    },
    'Interop': {},
    '1st': {},
    'thumbnail': null,
  };
  const exifBytes = piexif.dump(exifObj);
  const newBinary = piexif.insert(exifBytes, binary);
  const out = new Uint8Array(newBinary.length);
  for (let i = 0; i < newBinary.length; i++) out[i] = newBinary.charCodeAt(i) & 0xff;
  return out;
}

describe('sniffMime', () => {
  it('detects JPEG magic bytes', async () => {
    const bytes = makeTinyJpegBytes();
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    expect(await sniffMime(blob)).toBe('image/jpeg');
  });

  it('detects PNG magic bytes', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const blob = new Blob([png]);
    expect(await sniffMime(blob)).toBe('image/png');
  });

  it('detects WebP magic bytes', async () => {
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(await sniffMime(new Blob([webp]))).toBe('image/webp');
  });

  it('rejects HEIC (sentinel "ftypheic") with a specific error', async () => {
    const heic = new Uint8Array(32);
    heic.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
    await expect(sniffMime(new Blob([heic]))).rejects.toThrow(/heic/i);
  });

  it('returns null for unknown bytes', async () => {
    expect(await sniffMime(new Blob([new Uint8Array([1, 2, 3, 4])]))).toBeNull();
  });
});

describe('processImage — GPS stripping', () => {
  it('removes GPS tags from a JPEG that had them', async () => {
    const bytes = withGps(makeTinyJpegBytes());

    // sanity: GPS is present in the input
    const before = await exifr.gps(new Blob([bytes]).arrayBuffer ? new Blob([bytes]) : new Blob([bytes])) as any;
    expect(before?.latitude).toBeCloseTo(37.55, 1);

    const processed = await processImage(new Blob([bytes], { type: 'image/jpeg' }), {
      maxDimension: 16,
    });

    // GPS must be gone in the output
    const after = await exifr.gps(processed.blob);
    expect(after).toBeFalsy();
    expect(processed.mimeType).toBe('image/jpeg');
    expect(processed.width).toBeGreaterThan(0);
    expect(processed.height).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Implement `src/workers/photo-processor.ts`**

```ts
export type SupportedMime = 'image/jpeg' | 'image/png' | 'image/webp';

const MAGIC: Array<{ mime: SupportedMime; prefix: number[] }> = [
  { mime: 'image/jpeg', prefix: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

function startsWith(buf: Uint8Array, prefix: number[]): boolean {
  if (buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (buf[i] !== prefix[i]) return false;
  return true;
}

function isWebP(buf: Uint8Array): boolean {
  return buf.length >= 12
    && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}

function isHeic(buf: Uint8Array): boolean {
  if (buf.length < 12) return false;
  // ISO-BMFF: bytes 4-7 = "ftyp", brand starts at byte 8.
  if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) return false;
  const brand = String.fromCharCode(buf[8] ?? 0, buf[9] ?? 0, buf[10] ?? 0, buf[11] ?? 0);
  return brand === 'heic' || brand === 'heif' || brand === 'heix' || brand === 'mif1';
}

export async function sniffMime(blob: Blob): Promise<SupportedMime | null> {
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (isHeic(head)) {
    throw new Error('HEIC images are not supported yet. Please use JPEG, PNG, or WebP.');
  }
  for (const { mime, prefix } of MAGIC) {
    if (startsWith(head, prefix)) return mime;
  }
  if (isWebP(head)) return 'image/webp';
  return null;
}

export interface ProcessImageOptions {
  /** Longest edge in pixels for the re-encoded copy. */
  maxDimension?: number;
  /** JPEG quality 0..1. */
  quality?: number;
}

export interface ProcessImageResult {
  blob: Blob;
  mimeType: SupportedMime;
  width: number;
  height: number;
  byteSize: number;
}

/**
 * Decode the blob via createImageBitmap (which discards all EXIF), re-draw
 * onto an OffscreenCanvas at most `maxDimension` px on the long edge, then
 * re-encode. The output has no EXIF, no GPS, no orientation tag — just pixels.
 */
export async function processImage(blob: Blob, opts: ProcessImageOptions = {}): Promise<ProcessImageResult> {
  const detectedMime = await sniffMime(blob);
  if (!detectedMime) throw new Error('Unsupported image format');

  // createImageBitmap honours JPEG's stored orientation in browsers that support
  // it (Chrome/Safari); imageOrientation: 'from-image' makes it consistent.
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const maxDim = opts.maxDimension ?? 1600;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Always re-encode to image/jpeg unless input was PNG (lossless preservation).
  const outMime: SupportedMime = detectedMime === 'image/png' ? 'image/png' : 'image/jpeg';
  const outBlob = await canvas.convertToBlob({
    type: outMime,
    quality: outMime === 'image/jpeg' ? (opts.quality ?? 0.85) : undefined,
  });

  return { blob: outBlob, mimeType: outMime, width: w, height: h, byteSize: outBlob.size };
}
```

- [ ] **Step 6: Run tests — GREEN**

```bash
pnpm test:unit src/workers/photo-processor.test.ts
```

If happy-dom doesn't support `OffscreenCanvas` or `createImageBitmap`, the test will fail. happy-dom 20 supports these APIs in basic form; if it doesn't, install `@happyDOM/global-registrator`'s newer canvas mock, OR switch this test to `environment: 'jsdom-with-canvas'` via the Vitest per-file directive `// @vitest-environment jsdom`. If neither works, document the limitation and gate the test with `it.skipIf(typeof OffscreenCanvas === 'undefined')`. The GPS-absence assertion is the critical part — keep that.

Expected: 6 passed.

- [ ] **Step 7: Write tests for `src/local/photos.ts` (RED)**

Create `src/local/photos.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addPhotoToPlay, listPhotosForPlay, removePhoto } from './photos';

function tinyJpegBlob(): Blob {
  const hex = 'ffd8ffe000104a46494600010101006000600000' +
    'ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e' +
    '1d1a1c1c2024362c20272a2c2b2c2c1d2f31302e3134333133' +
    'ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000' +
    '0000000001020304050607080910111213141516171819ffc4001f01000301010101010101' +
    '01010100000000000001020304050607080910111213141516171819ffda000c0301000211' +
    '0311003f00fbd3ffd9';
  const bytes = Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return new Blob([bytes], { type: 'image/jpeg' });
}

describe('local photos', () => {
  it('adds a processed photo to a play', async () => {
    const photo = await addPhotoToPlay({
      playId: 'play-1',
      blob: tinyJpegBlob(),
      order: 0,
    });
    expect(photo.playId).toBe('play-1');
    expect(photo.order).toBe(0);
    expect(['image/jpeg', 'image/png']).toContain(photo.mimeType);
    expect(photo.byteSize).toBeGreaterThan(0);
  });

  it('lists photos ordered by `order`', async () => {
    await addPhotoToPlay({ playId: 'p', blob: tinyJpegBlob(), order: 1 });
    await addPhotoToPlay({ playId: 'p', blob: tinyJpegBlob(), order: 0 });
    const rows = await listPhotosForPlay('p');
    expect(rows.map((r) => r.order)).toEqual([0, 1]);
  });

  it('enforces 5-image cap per play', async () => {
    for (let i = 0; i < 5; i++) {
      await addPhotoToPlay({ playId: 'cap', blob: tinyJpegBlob(), order: i });
    }
    await expect(
      addPhotoToPlay({ playId: 'cap', blob: tinyJpegBlob(), order: 5 }),
    ).rejects.toThrow(/5/);
  });

  it('rejects oversize blobs', async () => {
    const oversized = new Blob([new Uint8Array(5_242_881)], { type: 'image/jpeg' });
    await expect(
      addPhotoToPlay({ playId: 'big', blob: oversized, order: 0 }),
    ).rejects.toThrow(/5 ?MB|size/i);
  });

  it('removes a photo', async () => {
    const p = await addPhotoToPlay({ playId: 'r', blob: tinyJpegBlob(), order: 0 });
    await removePhoto(p.id);
    expect(await listPhotosForPlay('r')).toEqual([]);
  });
});
```

- [ ] **Step 8: Run — RED**

```bash
pnpm test:unit src/local/photos.test.ts
```

- [ ] **Step 9: Implement `src/local/photos.ts`**

```ts
import { ulid } from 'ulid';
import { getLocalDb } from './db/client';
import type { LocalPhoto } from './db/schema';
import { processImage, sniffMime } from '~/workers/photo-processor';

export const MAX_PHOTOS_PER_PLAY = 5;
export const MAX_PHOTO_BYTE_SIZE = 5 * 1024 * 1024;

export interface AddPhotoInput {
  playId: string;
  blob: Blob;
  order: number;
}

export async function addPhotoToPlay(input: AddPhotoInput): Promise<LocalPhoto> {
  if (input.blob.size > MAX_PHOTO_BYTE_SIZE) {
    throw new Error(`Photo exceeds 5MB size cap (${input.blob.size} bytes)`);
  }
  // Magic-byte sniff (throws for HEIC, returns null for unknown)
  const detected = await sniffMime(input.blob);
  if (!detected) throw new Error('Unsupported image format');

  const db = getLocalDb();
  const existing = await db.localPhotos.where({ playId: input.playId }).count();
  if (existing >= MAX_PHOTOS_PER_PLAY) {
    throw new Error(`At most ${MAX_PHOTOS_PER_PLAY} photos per play`);
  }

  const processed = await processImage(input.blob);

  const row: LocalPhoto = {
    id: ulid(),
    playId: input.playId,
    blob: processed.blob,
    order: input.order,
    mimeType: processed.mimeType,
    byteSize: processed.byteSize,
    width: processed.width,
    height: processed.height,
    createdAt: Date.now(),
  };
  await db.localPhotos.add(row);
  return row;
}

export async function listPhotosForPlay(playId: string): Promise<LocalPhoto[]> {
  return getLocalDb()
    .localPhotos.where({ playId })
    .sortBy('order');
}

export async function removePhoto(id: string): Promise<void> {
  await getLocalDb().localPhotos.delete(id);
}

export async function removeAllPhotosForPlay(playId: string): Promise<void> {
  const db = getLocalDb();
  const ids = await db.localPhotos.where({ playId }).primaryKeys();
  await db.localPhotos.bulkDelete(ids);
}
```

- [ ] **Step 10: GREEN**

```bash
pnpm test:unit src/local/photos.test.ts
```

Expected: 5 passed.

- [ ] **Step 11: Commit**

```bash
git add src/workers src/local/photos.ts src/local/photos.test.ts package.json pnpm-lock.yaml
git commit -m "feat: photo worker (magic sniff, EXIF strip, thumbnail) + local photos CRUD"
```

---

## Task 5: Local plays CRUD with participants

**Files:**
- Create: `src/local/plays.ts`
- Create: `src/local/plays.test.ts`

- [ ] **Step 1: Install uuid v4 (for idempotency keys)**

```bash
pnpm add -w uuid
pnpm add -w -D @types/uuid
```

- [ ] **Step 2: Tests (RED)**

Create `src/local/plays.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createLocalPlay,
  getLocalPlay,
  listLocalPlays,
  updateLocalPlay,
  deleteLocalPlay,
  listPlaysOnDate,
} from './plays';

const baseInput = () => ({
  gameRef: { kind: 'local' as const, id: 'g1' },
  playedAt: new Date('2026-06-04').getTime(),
  participants: [
    { localMemberId: 'm1', isWinner: true, order: 0, rank: 1, score: 87 },
    { localMemberId: 'm2', isWinner: false, order: 1, rank: 2, score: 63 },
  ],
});

describe('local plays', () => {
  it('creates a play with all fields populated', async () => {
    const p = await createLocalPlay({ ...baseInput(), description: 'good game' });
    expect(p.syncState).toBe('local');
    expect(p.idempotencyKey).toMatch(/^[0-9a-f]{8}-/);
    expect(p.participants).toHaveLength(2);
    expect(p.gameRef).toEqual({ kind: 'local', id: 'g1' });
    expect(p.photoIds).toEqual([]);
    expect(typeof p.createdAt).toBe('number');
    expect(p.createdAt).toBe(p.updatedAt);
  });

  it('lists plays newest playedAt first', async () => {
    await createLocalPlay({ ...baseInput(), playedAt: new Date('2026-06-01').getTime() });
    await createLocalPlay({ ...baseInput(), playedAt: new Date('2026-06-03').getTime() });
    await createLocalPlay({ ...baseInput(), playedAt: new Date('2026-06-02').getTime() });
    const rows = await listLocalPlays();
    expect(rows.map((r) => new Date(r.playedAt).getUTCDate())).toEqual([3, 2, 1]);
  });

  it('lists plays on a specific date (local timezone day buckets)', async () => {
    const day = new Date('2026-06-04T12:00:00Z').getTime();
    await createLocalPlay({ ...baseInput(), playedAt: day });
    await createLocalPlay({ ...baseInput(), playedAt: day + 86_400_000 }); // +1d
    const rows = await listPlaysOnDate(new Date('2026-06-04'));
    expect(rows).toHaveLength(1);
  });

  it('updates a play and bumps updatedAt', async () => {
    const p = await createLocalPlay(baseInput());
    await new Promise((r) => setTimeout(r, 2));
    await updateLocalPlay(p.id, { description: 'edited' });
    const after = await getLocalPlay(p.id);
    expect(after?.description).toBe('edited');
    expect(after!.updatedAt).toBeGreaterThan(p.updatedAt);
  });

  it('deletes a play and cascades photo cleanup', async () => {
    const { addPhotoToPlay, listPhotosForPlay } = await import('./photos');
    const tiny = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])], { type: 'image/jpeg' });
    const p = await createLocalPlay(baseInput());
    // Note: tiny blob below is for the cascade test only — we mock-add a row by direct write
    // because processImage would reject this 5-byte stub. See the test fixture in step 4 of Task 4
    // for a real JPEG. For this cascade test, we directly add a row to localPhotos:
    const { getLocalDb } = await import('./db/client');
    await getLocalDb().localPhotos.add({
      id: 'fake-photo-1', playId: p.id, blob: tiny, order: 0,
      mimeType: 'image/jpeg', byteSize: 5, createdAt: Date.now(),
    });
    expect((await listPhotosForPlay(p.id)).length).toBe(1);
    await deleteLocalPlay(p.id);
    expect(await getLocalPlay(p.id)).toBeUndefined();
    expect((await listPhotosForPlay(p.id)).length).toBe(0);
  });

  it('rejects a play with zero participants', async () => {
    await expect(
      createLocalPlay({ ...baseInput(), participants: [] }),
    ).rejects.toThrow(/participant/i);
  });

  it('rejects when participant ranks are not contiguous from 1', async () => {
    const bad = baseInput();
    bad.participants[1].rank = 5; // gap
    await expect(createLocalPlay(bad)).rejects.toThrow(/rank/i);
  });
});
```

- [ ] **Step 3: Implement `src/local/plays.ts`**

```ts
import { v4 as uuidv4 } from 'uuid';
import { ulid } from 'ulid';
import { getLocalDb } from './db/client';
import type { LocalPlay, LocalPlayParticipant, GameRef } from './db/schema';

export interface CreateLocalPlayInput {
  gameRef: GameRef;
  playedAt: number;
  participants: LocalPlayParticipant[];
  description?: string;
}

function validateParticipants(participants: LocalPlayParticipant[]) {
  if (participants.length === 0) throw new Error('A play needs at least one participant');

  const ranked = participants.filter((p) => p.rank !== undefined).map((p) => p.rank!);
  if (ranked.length > 0) {
    const sorted = [...ranked].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) throw new Error(`Ranks must be contiguous starting at 1 (got ${sorted.join(',')})`);
    }
  }
}

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export async function createLocalPlay(input: CreateLocalPlayInput): Promise<LocalPlay> {
  validateParticipants(input.participants);

  const now = Date.now();
  const row: LocalPlay = {
    id: ulid(),
    gameRef: input.gameRef,
    playedAt: input.playedAt,
    participants: input.participants,
    description: input.description?.trim() || undefined,
    photoIds: [],
    syncState: 'local',
    idempotencyKey: uuidv4(),
    createdAt: now,
    updatedAt: now,
  };
  await getLocalDb().localPlays.add(row);
  return row;
}

export async function getLocalPlay(id: string): Promise<LocalPlay | undefined> {
  return getLocalDb().localPlays.get(id);
}

export async function listLocalPlays(): Promise<LocalPlay[]> {
  return getLocalDb().localPlays.orderBy('playedAt').reverse().toArray();
}

export async function listPlaysOnDate(date: Date): Promise<LocalPlay[]> {
  const start = startOfLocalDay(date);
  const end = start + 86_400_000;
  return getLocalDb()
    .localPlays.where('playedAt')
    .between(start, end, true, false)
    .toArray();
}

export interface UpdateLocalPlayInput {
  gameRef?: GameRef;
  playedAt?: number;
  participants?: LocalPlayParticipant[];
  description?: string | null;
  photoIds?: string[];
}

export async function updateLocalPlay(id: string, patch: UpdateLocalPlayInput): Promise<void> {
  if (patch.participants) validateParticipants(patch.participants);
  const update: Partial<LocalPlay> = { updatedAt: Date.now() };
  if (patch.gameRef !== undefined) update.gameRef = patch.gameRef;
  if (patch.playedAt !== undefined) update.playedAt = patch.playedAt;
  if (patch.participants !== undefined) update.participants = patch.participants;
  if (patch.description !== undefined) update.description = patch.description?.trim() || undefined;
  if (patch.photoIds !== undefined) update.photoIds = patch.photoIds;
  await getLocalDb().localPlays.update(id, update);
}

export async function deleteLocalPlay(id: string): Promise<void> {
  const db = getLocalDb();
  await db.transaction('rw', db.localPlays, db.localPhotos, async () => {
    const photoIds = await db.localPhotos.where({ playId: id }).primaryKeys();
    await db.localPhotos.bulkDelete(photoIds);
    await db.localPlays.delete(id);
  });
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm test:unit src/local/plays.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Full sweep**

```bash
pnpm test:unit
```

Expected: 23 + 6 (Task 3) + ... rolling total. Confirm everything still passes.

- [ ] **Step 6: Commit**

```bash
git add src/local/plays.ts src/local/plays.test.ts package.json pnpm-lock.yaml
git commit -m "feat: local plays CRUD with participant validation + photo cascade"
```

---

## Phase B — UI primitives (Tasks 6–9)

## Task 6: shadcn primitives needed by Plan 2

**Files:**
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/textarea.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/drawer.tsx`
- Create: `src/components/ui/form.tsx`
- Create: `src/components/ui/select.tsx`
- Create: stories for each (`*.stories.tsx`)

These are hand-written shadcn-style primitives. Rather than running `npx shadcn add` (which would attempt to fetch from the shadcn registry and may not be reachable in some envs), each primitive is included verbatim below.

- [ ] **Step 1: Install Radix UI deps used by these primitives**

```bash
pnpm add -w @radix-ui/react-dialog @radix-ui/react-label @radix-ui/react-select @radix-ui/react-slot react-hook-form @hookform/resolvers vaul
```

- [ ] **Step 2: Create `src/components/ui/card.tsx`**

```tsx
import * as React from 'react';
import { cn } from '~/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border border-border bg-background shadow-sm', className)} {...props} />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-4 border-b border-border', className)} {...props} />,
);
CardHeader.displayName = 'CardHeader';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-4', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-4 border-t border-border flex items-center gap-2', className)} {...props} />,
);
CardFooter.displayName = 'CardFooter';
```

- [ ] **Step 3: Create `src/components/ui/input.tsx`**

```tsx
import * as React from 'react';
import { cn } from '~/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

- [ ] **Step 4: Create `src/components/ui/label.tsx`**

```tsx
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '~/lib/utils';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;
```

- [ ] **Step 5: Create `src/components/ui/textarea.tsx`**

```tsx
import * as React from 'react';
import { cn } from '~/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
```

- [ ] **Step 6: Create `src/components/ui/dialog.tsx`**

```tsx
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '~/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-black/50', className)} {...props} />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-background p-6 shadow-lg rounded-lg',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5 text-center sm:text-left', className)} {...props} />
);
export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none', className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
```

- [ ] **Step 7: Create `src/components/ui/drawer.tsx`** (Vaul-based, used for the calendar day drawer)

```tsx
import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '~/lib/utils';

export const Drawer = (props: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground {...props} />
);
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerPortal = DrawerPrimitive.Portal;
export const DrawerClose = DrawerPrimitive.Close;
export const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-black/40', className)} {...props} />
));
DrawerOverlay.displayName = 'DrawerOverlay';

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto max-h-[85vh] flex-col rounded-t-2xl border border-border bg-background',
        className,
      )}
      {...props}
    >
      <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

export const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-4', className)} {...props} />
);
export const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
));
DrawerTitle.displayName = 'DrawerTitle';
```

- [ ] **Step 8: Create `src/components/ui/form.tsx`** (react-hook-form bridge)

```tsx
import * as React from 'react';
import { Controller, ControllerProps, FieldPath, FieldValues, FormProvider, useFormContext } from 'react-hook-form';
import { Label } from './label';
import { cn } from '~/lib/utils';

export const Form = FormProvider;

const FormFieldContext = React.createContext<{ name: string } | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

export function useFormField() {
  const ctx = React.useContext(FormFieldContext);
  if (!ctx) throw new Error('useFormField must be used inside FormField');
  const { getFieldState, formState } = useFormContext();
  const state = getFieldState(ctx.name, formState);
  return { ...state, name: ctx.name };
}

export const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('space-y-2', className)} {...props} />,
);
FormItem.displayName = 'FormItem';

export const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => {
  const { error } = useFormField();
  return <Label ref={ref} className={cn(error && 'text-red-600', className)} {...props} />;
});
FormLabel.displayName = 'FormLabel';

export const FormMessage = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    const { error } = useFormField();
    const body = error ? String(error.message ?? '') : children;
    if (!body) return null;
    return <p ref={ref} className={cn('text-sm text-red-600', className)} {...props}>{body}</p>;
  },
);
FormMessage.displayName = 'FormMessage';
```

- [ ] **Step 9: Create `src/components/ui/select.tsx`** (Radix-based)

```tsx
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '~/lib/utils';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm',
      'focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn('relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-background shadow-md', className)}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
      'focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
```

- [ ] **Step 10: Add one Storybook story per primitive**

Use a uniform pattern. Example for Card — `src/components/ui/card.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Card, CardHeader, CardContent, CardFooter } from './card';

const meta: Meta<typeof Card> = { title: 'UI/Card', component: Card };
export default meta;

export const Default: StoryObj<typeof Card> = {
  render: () => (
    <Card className="w-80">
      <CardHeader>Header</CardHeader>
      <CardContent>Body content</CardContent>
      <CardFooter>Footer</CardFooter>
    </Card>
  ),
};
```

Create equivalent files for `input`, `label`, `textarea`, `dialog`, `drawer`, `form`, `select`. Each story renders the primitive with sensible defaults. Stories may use literal English text — these are UI primitives and the `i18next/no-literal-string` rule is disabled for them already.

- [ ] **Step 11: Verify Storybook still builds**

```bash
pnpm storybook:build
```

Expected: builds cleanly.

- [ ] **Step 12: Run lint + typecheck**

```bash
pnpm lint && pnpm typecheck
```

Expected: clean.

- [ ] **Step 13: Commit**

```bash
git add src/components/ui package.json pnpm-lock.yaml
git commit -m "feat: shadcn primitives (card, input, label, textarea, dialog, drawer, form, select) + stories"
```

---

## Task 7: Game picker component

**Files:**
- Create: `src/features/games/game-picker.tsx`
- Create: `src/features/games/game-picker.stories.tsx`

- [ ] **Step 1: Implement `src/features/games/game-picker.tsx`**

```tsx
import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { listLocalGames, createLocalGame } from '~/local/games';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/lib/i18n/I18nProvider';
import type { GameRef } from '~/local/db/schema';

export interface GamePickerProps {
  value: GameRef | null;
  onChange: (next: GameRef) => void;
  className?: string;
}

export function GamePicker({ value, onChange, className }: GamePickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const games = useLiveQuery(() => listLocalGames(), []) ?? [];

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => g.name.toLowerCase().includes(q));
  }, [games, query]);

  const selectedName = React.useMemo(() => {
    if (!value) return null;
    if (value.kind === 'local') return games.find((g) => g.id === value.id)?.name ?? null;
    return null;
  }, [value, games]);

  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    const g = await createLocalGame({ name });
    onChange({ kind: 'local', id: g.id });
    setQuery('');
  }

  return (
    <div className={className} role="combobox" aria-label={t('play.gamePicker.label')} aria-expanded>
      <Input
        value={selectedName ?? query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('play.gamePicker.placeholder')}
        data-testid="game-picker-input"
      />
      <ul className="mt-1 max-h-48 overflow-auto rounded-md border border-border" role="listbox">
        {filtered.map((g) => (
          <li
            key={g.id}
            role="option"
            aria-selected={value?.kind === 'local' && value.id === g.id}
            className="cursor-pointer px-3 py-2 hover:bg-muted"
            onClick={() => onChange({ kind: 'local', id: g.id })}
            data-testid={`game-picker-option-${g.id}`}
          >
            {g.name}
          </li>
        ))}
        {filtered.length === 0 && query.trim() && (
          <li className="px-3 py-2">
            <Button variant="ghost" onClick={handleCreate} className="w-full justify-start" data-testid="game-picker-create">
              <Plus className="h-4 w-4 mr-2" />
              {t('play.gamePicker.create')} "{query.trim()}"
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add i18n keys**

Modify `src/lib/i18n/messages/ko.json`:

```json
{
  "common.appName": "gamstory",
  "common.boot.ok": "기반이 부팅되었습니다.",
  "play.gamePicker.label": "게임 선택",
  "play.gamePicker.placeholder": "게임 이름 입력",
  "play.gamePicker.create": "새 게임 추가"
}
```

Modify `src/lib/i18n/messages/en.json`:

```json
{
  "common.appName": "gamstory",
  "common.boot.ok": "Foundation booted.",
  "play.gamePicker.label": "Pick a game",
  "play.gamePicker.placeholder": "Type a game name",
  "play.gamePicker.create": "Add new game"
}
```

- [ ] **Step 3: Create story with play function**

`src/features/games/game-picker.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, userEvent, expect } from 'storybook/test';
import { useState } from 'react';
import { GamePicker } from './game-picker';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import type { GameRef } from '~/local/db/schema';

const meta: Meta<typeof GamePicker> = {
  title: 'Features/GamePicker',
  component: GamePicker,
  decorators: [
    (Story) => (
      <I18nProvider initialLocale="en">
        <Story />
      </I18nProvider>
    ),
  ],
  loaders: [
    async () => {
      __resetLocalDbForTests();
      await indexedDB.deleteDatabase('gamstory');
      await createLocalGame({ name: 'Catan' });
      await createLocalGame({ name: 'Wingspan' });
      return {};
    },
  ],
};
export default meta;

type Wrapper = { initial?: GameRef | null };
function Wrap({ initial = null }: Wrapper) {
  const [v, setV] = useState<GameRef | null>(initial);
  return <GamePicker value={v} onChange={setV} />;
}

export const Default: StoryObj = {
  render: () => <Wrap />,
  play: async ({ canvasElement, step }) => {
    const c = within(canvasElement);
    await step('shows the seeded games', async () => {
      await expect(c.findByText('Catan')).resolves.toBeInTheDocument();
      await expect(c.findByText('Wingspan')).resolves.toBeInTheDocument();
    });
    await step('typing narrows results', async () => {
      await userEvent.type(c.getByTestId('game-picker-input'), 'cat');
      await expect(c.queryByText('Wingspan')).not.toBeInTheDocument();
    });
  },
};

export const CreateNewWhenNoMatch: StoryObj = {
  render: () => <Wrap />,
  play: async ({ canvasElement, step }) => {
    const c = within(canvasElement);
    await step('typing an unknown name surfaces the create button', async () => {
      await userEvent.type(c.getByTestId('game-picker-input'), 'Splendor');
      await expect(c.findByTestId('game-picker-create')).resolves.toBeInTheDocument();
    });
  },
};
```

- [ ] **Step 4: Run Storybook test-runner**

```bash
pnpm storybook:build
npx http-server storybook-static -p 6007 -s &
SB_PID=$!
sleep 3
TARGET_URL=http://127.0.0.1:6007 pnpm test:stories
kill $SB_PID
```

Expected: 2 new tests pass; previous Button tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/games src/lib/i18n
git commit -m "feat: game picker component with typeahead + create-new affordance"
```

---

## Task 8: Member picker component

**Files:**
- Create: `src/features/members/member-picker.tsx`
- Create: `src/features/members/member-picker.stories.tsx`

Mirror Task 7 with `listLocalMembers` + `createLocalMember`. Selection produces a `string` member id, not a tagged ref. Multi-select (because plays have multiple members).

- [ ] **Step 1: Implement `src/features/members/member-picker.tsx`**

```tsx
import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X } from 'lucide-react';
import { listLocalMembers, createLocalMember } from '~/local/members';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/lib/i18n/I18nProvider';

export interface MemberPickerProps {
  selectedIds: string[];
  onChange: (next: string[]) => void;
}

export function MemberPicker({ selectedIds, onChange }: MemberPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const members = useLiveQuery(() => listLocalMembers(), []) ?? [];

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members;
  }, [members, query]);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }
  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    const m = await createLocalMember({ name });
    onChange([...selectedIds, m.id]);
    setQuery('');
  }

  return (
    <div role="group" aria-label={t('play.memberPicker.label')}>
      <div className="flex flex-wrap gap-1 mb-2" data-testid="member-picker-chips">
        {selectedIds.map((id) => {
          const m = members.find((mm) => mm.id === id);
          if (!m) return null;
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm">
              {m.name}
              <button
                type="button"
                aria-label={t('play.memberPicker.remove')}
                onClick={() => toggle(id)}
                className="opacity-60 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('play.memberPicker.placeholder')}
        data-testid="member-picker-input"
      />
      <ul className="mt-1 max-h-48 overflow-auto rounded-md border border-border" role="listbox">
        {filtered.map((m) => (
          <li
            key={m.id}
            role="option"
            aria-selected={selectedIds.includes(m.id)}
            className="cursor-pointer px-3 py-2 hover:bg-muted flex items-center justify-between"
            onClick={() => toggle(m.id)}
            data-testid={`member-picker-option-${m.id}`}
          >
            <span>{m.name}</span>
            {selectedIds.includes(m.id) && <span aria-hidden>✓</span>}
          </li>
        ))}
        {filtered.length === 0 && query.trim() && (
          <li className="px-3 py-2">
            <Button variant="ghost" onClick={handleCreate} className="w-full justify-start" data-testid="member-picker-create">
              <Plus className="h-4 w-4 mr-2" />
              {t('play.memberPicker.create')} "{query.trim()}"
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add i18n keys** (extend both ko.json and en.json)

ko.json additions:
```json
"play.memberPicker.label": "참가자 선택",
"play.memberPicker.placeholder": "이름 입력",
"play.memberPicker.create": "새 참가자 추가",
"play.memberPicker.remove": "제거"
```

en.json additions:
```json
"play.memberPicker.label": "Pick participants",
"play.memberPicker.placeholder": "Type a name",
"play.memberPicker.create": "Add new participant",
"play.memberPicker.remove": "Remove"
```

- [ ] **Step 3: Create story** — mirror the GamePicker story:

```tsx
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, userEvent, expect } from 'storybook/test';
import { useState } from 'react';
import { MemberPicker } from './member-picker';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalMember } from '~/local/members';

const meta: Meta<typeof MemberPicker> = {
  title: 'Features/MemberPicker',
  component: MemberPicker,
  decorators: [(Story) => (
    <I18nProvider initialLocale="en"><Story /></I18nProvider>
  )],
  loaders: [async () => {
    __resetLocalDbForTests();
    await indexedDB.deleteDatabase('gamstory');
    await createLocalMember({ name: 'Alice' });
    await createLocalMember({ name: 'Bob' });
    return {};
  }],
};
export default meta;

function Wrap() {
  const [sel, setSel] = useState<string[]>([]);
  return <MemberPicker selectedIds={sel} onChange={setSel} />;
}

export const Default: StoryObj = {
  render: () => <Wrap />,
  play: async ({ canvasElement, step }) => {
    const c = within(canvasElement);
    await step('seeded members are listed', async () => {
      await expect(c.findByText('Alice')).resolves.toBeInTheDocument();
      await expect(c.findByText('Bob')).resolves.toBeInTheDocument();
    });
    await step('selecting Alice produces a chip', async () => {
      await userEvent.click(c.getByText('Alice'));
      const chips = c.getByTestId('member-picker-chips');
      await expect(within(chips).findByText('Alice')).resolves.toBeInTheDocument();
    });
  },
};
```

- [ ] **Step 4: Storybook test-runner**

```bash
pnpm storybook:build
npx http-server storybook-static -p 6007 -s &
sleep 3
TARGET_URL=http://127.0.0.1:6007 pnpm test:stories
kill %1
```

Expected: GamePicker (2) + MemberPicker (1) + Button (2) all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/members src/lib/i18n
git commit -m "feat: member picker with multi-select chips + inline create"
```

---

## Task 9: Photo uploader component

**Files:**
- Create: `src/features/plays/photo-uploader.tsx`
- Create: `src/features/plays/photo-uploader.stories.tsx`

- [ ] **Step 1: Implement `src/features/plays/photo-uploader.tsx`**

```tsx
import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Trash2 } from 'lucide-react';
import { addPhotoToPlay, listPhotosForPlay, removePhoto, MAX_PHOTOS_PER_PLAY, MAX_PHOTO_BYTE_SIZE } from '~/local/photos';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/lib/i18n/I18nProvider';

export interface PhotoUploaderProps {
  playId: string;
}

export function PhotoUploader({ playId }: PhotoUploaderProps) {
  const { t } = useI18n();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const photos = useLiveQuery(() => listPhotosForPlay(playId), [playId]) ?? [];

  const objectUrls = React.useMemo(() => photos.map((p) => URL.createObjectURL(p.blob)), [photos]);
  React.useEffect(() => () => { objectUrls.forEach(URL.revokeObjectURL); }, [objectUrls]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_PHOTO_BYTE_SIZE) {
          setError(t('play.photo.tooLarge'));
          continue;
        }
        await addPhotoToPlay({ playId, blob: file, order: photos.length });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" data-testid="photo-uploader-grid">
        {photos.map((p, i) => (
          <div key={p.id} className="relative h-24 w-24 overflow-hidden rounded-md border border-border">
            <img src={objectUrls[i]} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label={t('play.photo.remove')}
              onClick={() => removePhoto(p.id)}
              className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="photo-uploader-input"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy || photos.length >= MAX_PHOTOS_PER_PLAY}
          data-testid="photo-uploader-button"
        >
          <Camera className="h-4 w-4 mr-2" />
          {t('play.photo.add', { count: photos.length, max: MAX_PHOTOS_PER_PLAY })}
        </Button>
        {photos.length >= MAX_PHOTOS_PER_PLAY && (
          <span className="text-sm text-muted-foreground">{t('play.photo.capReached')}</span>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Extend `t()` to support template substitution** (single-level)

Modify `src/lib/i18n/I18nProvider.tsx` — replace the `t` callback:

```tsx
const t = React.useCallback(
  (key: keyof typeof ko, vars?: Record<string, string | number>) => {
    const raw = BAGS[locale][key] ?? BAGS['en'][key] ?? String(key);
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  },
  [locale],
);
```

Update the `Ctx.t` signature:

```ts
t: (key: keyof typeof ko, vars?: Record<string, string | number>) => string;
```

- [ ] **Step 3: Add i18n keys**

ko.json additions:
```json
"play.photo.add": "사진 추가 ({count}/{max})",
"play.photo.remove": "사진 삭제",
"play.photo.tooLarge": "사진이 5MB를 초과합니다",
"play.photo.capReached": "최대 5장까지 가능"
```

en.json additions:
```json
"play.photo.add": "Add photo ({count}/{max})",
"play.photo.remove": "Remove photo",
"play.photo.tooLarge": "Photo exceeds 5MB",
"play.photo.capReached": "5-photo limit reached"
```

- [ ] **Step 4: Add a test for the template-substitution change**

Modify `src/lib/i18n/I18nProvider.test.tsx` — add an `it`:

```tsx
it('substitutes {vars} in messages', () => {
  render(<I18nProvider initialLocale="en"><Probe2 /></I18nProvider>);
  expect(screen.getByTestId('msg2').textContent).toBe('Add photo (2/5)');
});

function Probe2() {
  const { t } = useI18n();
  return <span data-testid="msg2">{t('play.photo.add', { count: 2, max: 5 })}</span>;
}
```

Move `Probe2` outside the describe block per React-hook semantics. Run `pnpm test:unit src/lib/i18n/I18nProvider.test.tsx` — expect 2 passed.

- [ ] **Step 5: Create story**

`src/features/plays/photo-uploader.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { PhotoUploader } from './photo-uploader';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';

const meta: Meta<typeof PhotoUploader> = {
  title: 'Features/PhotoUploader',
  component: PhotoUploader,
  decorators: [(Story) => <I18nProvider initialLocale="en"><Story /></I18nProvider>],
  loaders: [async () => {
    __resetLocalDbForTests();
    await indexedDB.deleteDatabase('gamstory');
    return {};
  }],
};
export default meta;

export const Empty: StoryObj = {
  args: { playId: 'play-empty' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const btn = await c.findByTestId('photo-uploader-button');
    expect(btn.textContent).toContain('Add photo (0/5)');
  },
};
```

- [ ] **Step 6: Storybook test-runner sweep**

```bash
pnpm storybook:build
npx http-server storybook-static -p 6007 -s &
sleep 3
TARGET_URL=http://127.0.0.1:6007 pnpm test:stories
kill %1
```

Expected: all stories pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/plays src/lib/i18n
git commit -m "feat: photo uploader with magic-byte gating + i18n template substitution"
```

---

## Phase C — Routes (Tasks 10–13)

## Task 10: Play form route (new + edit)

**Files:**
- Create: `src/routes/plays/new.tsx`
- Create: `src/routes/plays/$playId.edit.tsx`
- Create: `src/features/plays/play-form.tsx`
- Create: `src/features/plays/play-form.stories.tsx`

- [ ] **Step 1: Implement `src/features/plays/play-form.tsx`**

```tsx
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Button } from '~/components/ui/button';
import { GamePicker } from '~/features/games/game-picker';
import { MemberPicker } from '~/features/members/member-picker';
import { useI18n } from '~/lib/i18n/I18nProvider';
import type { GameRef, LocalPlay, LocalPlayParticipant } from '~/local/db/schema';

const FormSchema = z.object({
  playedAt: z.string().min(1),
  description: z.string().max(2000).optional(),
  gameRef: z.object({ kind: z.enum(['global', 'local']), id: z.string() }),
  memberIds: z.array(z.string()).min(1),
  winnerIds: z.array(z.string()).min(1),
});

export type PlayFormValues = z.infer<typeof FormSchema>;

export interface PlayFormProps {
  initial?: Partial<PlayFormValues>;
  onSubmit: (input: {
    gameRef: GameRef;
    playedAt: number;
    participants: LocalPlayParticipant[];
    description?: string;
  }) => Promise<void>;
  onCancel?: () => void;
}

function todayLocalIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function PlayForm({ initial, onSubmit, onCancel }: PlayFormProps) {
  const { t } = useI18n();
  const form = useForm<PlayFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      playedAt: initial?.playedAt ?? todayLocalIsoDate(),
      description: initial?.description ?? '',
      gameRef: initial?.gameRef ?? { kind: 'local', id: '' },
      memberIds: initial?.memberIds ?? [],
      winnerIds: initial?.winnerIds ?? [],
    },
  });

  async function handleSubmit(values: PlayFormValues) {
    const participants: LocalPlayParticipant[] = values.memberIds.map((id, idx) => ({
      localMemberId: id,
      isWinner: values.winnerIds.includes(id),
      order: idx,
    }));
    await onSubmit({
      gameRef: values.gameRef,
      playedAt: new Date(values.playedAt).getTime(),
      participants,
      description: values.description?.trim() || undefined,
    });
  }

  const memberIds = form.watch('memberIds');
  const winnerIds = form.watch('winnerIds');

  function toggleWinner(id: string) {
    const next = winnerIds.includes(id) ? winnerIds.filter((x) => x !== id) : [...winnerIds, id];
    form.setValue('winnerIds', next, { shouldDirty: true });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="playedAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('play.form.playedAt')}</FormLabel>
              <Input type="date" {...field} data-testid="play-form-date" />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="gameRef"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('play.form.game')}</FormLabel>
              <GamePicker value={field.value.id ? field.value : null} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="memberIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('play.form.members')}</FormLabel>
              <MemberPicker selectedIds={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />

        {memberIds.length > 0 && (
          <FormItem>
            <FormLabel>{t('play.form.winners')}</FormLabel>
            <ul className="space-y-1" data-testid="play-form-winner-list">
              {memberIds.map((id) => (
                <li key={id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`winner-${id}`}
                    checked={winnerIds.includes(id)}
                    onChange={() => toggleWinner(id)}
                    data-testid={`play-form-winner-${id}`}
                  />
                  <label htmlFor={`winner-${id}`} className="text-sm">{id}</label>
                </li>
              ))}
            </ul>
          </FormItem>
        )}

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('play.form.description')}</FormLabel>
              <Textarea rows={3} {...field} data-testid="play-form-description" />
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting} data-testid="play-form-submit">
            {t('common.save')}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} data-testid="play-form-cancel">
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
```

- [ ] **Step 2: Add i18n keys**

ko.json additions:
```json
"play.form.playedAt": "날짜",
"play.form.game": "게임",
"play.form.members": "참가자",
"play.form.winners": "승자 선택",
"play.form.description": "메모",
"common.save": "저장",
"common.cancel": "취소"
```

en.json additions:
```json
"play.form.playedAt": "Date",
"play.form.game": "Game",
"play.form.members": "Members",
"play.form.winners": "Winners",
"play.form.description": "Notes",
"common.save": "Save",
"common.cancel": "Cancel"
```

- [ ] **Step 3: Create the new-play route** `src/routes/plays/new.tsx`

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PlayForm } from '~/features/plays/play-form';
import { createLocalPlay } from '~/local/plays';

export const Route = createFileRoute('/plays/new')({
  ssr: false,
  component: NewPlayRoute,
});

function NewPlayRoute() {
  const navigate = useNavigate();
  return (
    <main className="mx-auto max-w-xl p-6">
      <PlayForm
        onSubmit={async (input) => {
          const p = await createLocalPlay(input);
          await navigate({ to: '/plays/$playId', params: { playId: p.id } });
        }}
        onCancel={() => navigate({ to: '/' })}
      />
    </main>
  );
}
```

- [ ] **Step 4: Create the edit-play route** `src/routes/plays/$playId.edit.tsx`

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { PlayForm } from '~/features/plays/play-form';
import { getLocalPlay, updateLocalPlay } from '~/local/plays';

export const Route = createFileRoute('/plays/$playId/edit')({
  ssr: false,
  component: EditPlayRoute,
});

function EditPlayRoute() {
  const { playId } = Route.useParams();
  const navigate = useNavigate();
  const play = useLiveQuery(() => getLocalPlay(playId), [playId]);
  if (!play) return null;

  return (
    <main className="mx-auto max-w-xl p-6">
      <PlayForm
        initial={{
          playedAt: new Date(play.playedAt).toISOString().slice(0, 10),
          description: play.description,
          gameRef: play.gameRef,
          memberIds: play.participants.map((p) => p.localMemberId),
          winnerIds: play.participants.filter((p) => p.isWinner).map((p) => p.localMemberId),
        }}
        onSubmit={async (input) => {
          await updateLocalPlay(playId, input);
          await navigate({ to: '/plays/$playId', params: { playId } });
        }}
        onCancel={() => navigate({ to: '/plays/$playId', params: { playId } })}
      />
    </main>
  );
}
```

- [ ] **Step 5: Create a Storybook story for the form** (smoke only — full flow tested via e2e)

`src/features/plays/play-form.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { PlayForm } from './play-form';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import { createLocalMember } from '~/local/members';

const meta: Meta<typeof PlayForm> = {
  title: 'Features/PlayForm',
  component: PlayForm,
  decorators: [(Story) => <I18nProvider initialLocale="en"><Story /></I18nProvider>],
  loaders: [async () => {
    __resetLocalDbForTests();
    await indexedDB.deleteDatabase('gamstory');
    await createLocalGame({ name: 'Catan' });
    await createLocalMember({ name: 'Alice' });
    await createLocalMember({ name: 'Bob' });
    return {};
  }],
};
export default meta;

export const Default: StoryObj<typeof PlayForm> = {
  args: { onSubmit: async () => {} },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByTestId('play-form-date')).resolves.toBeInTheDocument();
    await expect(c.findByTestId('play-form-description')).resolves.toBeInTheDocument();
    await expect(c.findByTestId('play-form-submit')).resolves.toBeInTheDocument();
  },
};
```

- [ ] **Step 6: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm storybook:build
```

All clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/plays/play-form.tsx src/features/plays/play-form.stories.tsx src/routes/plays src/lib/i18n
git commit -m "feat: play form (new + edit) with react-hook-form + zod"
```

---

## Task 11: List view route + filters

**Files:**
- Modify: `src/routes/index.tsx`
- Create: `src/features/plays/list-view.tsx`
- Create: `src/features/plays/list-view.stories.tsx`
- Create: `src/lib/selectors/use-merged-plays.ts` (local-only for now; merging with workspace plays lands in Plan 4)

- [ ] **Step 1: Implement the selector** `src/lib/selectors/use-merged-plays.ts`

```ts
import { useLiveQuery } from 'dexie-react-hooks';
import { listLocalPlays } from '~/local/plays';
import type { LocalPlay } from '~/local/db/schema';

export type MergedPlay = LocalPlay & { mergedId: string };

export function useMergedPlays(): MergedPlay[] {
  const local = useLiveQuery(() => listLocalPlays(), []) ?? [];
  return local.map((p) => ({ ...p, mergedId: p.remote?.playId ?? p.id }));
}
```

- [ ] **Step 2: Implement `src/features/plays/list-view.tsx`**

```tsx
import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, CardContent, CardHeader } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/lib/i18n/I18nProvider';
import { useMergedPlays } from '~/lib/selectors/use-merged-plays';
import { listLocalGames } from '~/local/games';
import { listLocalMembers } from '~/local/members';

export interface ListViewFilters {
  q?: string;
  gameId?: string;
  memberId?: string;
  from?: string; // ISO date
  to?: string;
}

export interface ListViewProps {
  filters: ListViewFilters;
  onFiltersChange: (next: ListViewFilters) => void;
}

export function ListView({ filters, onFiltersChange }: ListViewProps) {
  const { t, locale } = useI18n();
  const plays = useMergedPlays();
  const games = useLiveQuery(() => listLocalGames(), []) ?? [];
  const members = useLiveQuery(() => listLocalMembers(), []) ?? [];

  const filtered = React.useMemo(() => {
    return plays.filter((p) => {
      if (filters.gameId && p.gameRef.id !== filters.gameId) return false;
      if (filters.memberId && !p.participants.some((pp) => pp.localMemberId === filters.memberId)) return false;
      if (filters.from && p.playedAt < new Date(filters.from).getTime()) return false;
      if (filters.to && p.playedAt > new Date(filters.to).getTime() + 86_400_000) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const game = games.find((g) => g.id === p.gameRef.id)?.name ?? '';
        const desc = p.description ?? '';
        if (!game.toLowerCase().includes(q) && !desc.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [plays, filters, games]);

  const dateFmt = React.useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }), [locale]);

  return (
    <div className="space-y-4" data-testid="list-view">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <Input
          placeholder={t('list.filter.search')}
          value={filters.q ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, q: e.target.value || undefined })}
          data-testid="list-filter-q"
        />
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={filters.gameId ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, gameId: e.target.value || undefined })}
          aria-label={t('list.filter.game')}
          data-testid="list-filter-game"
        >
          <option value="">{t('list.filter.allGames')}</option>
          {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          value={filters.memberId ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, memberId: e.target.value || undefined })}
          aria-label={t('list.filter.member')}
          data-testid="list-filter-member"
        >
          <option value="">{t('list.filter.allMembers')}</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Button
          variant="ghost"
          onClick={() => onFiltersChange({})}
          disabled={Object.values(filters).every((v) => !v)}
          data-testid="list-filter-clear"
        >
          {t('list.filter.clear')}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p data-testid="list-empty" className="text-muted-foreground">{t('list.empty')}</p>
      ) : (
        <ul className="space-y-2" data-testid="list-rows">
          {filtered.map((p) => {
            const game = games.find((g) => g.id === p.gameRef.id)?.name ?? t('list.unknownGame');
            const winners = p.participants.filter((pp) => pp.isWinner).map((pp) => members.find((m) => m.id === pp.localMemberId)?.name ?? '?').join(', ');
            return (
              <li key={p.id}>
                <Link to="/plays/$playId" params={{ playId: p.id }}>
                  <Card className="hover:bg-muted/30 cursor-pointer">
                    <CardHeader className="flex items-center justify-between">
                      <span className="font-semibold">{game}</span>
                      <span className="text-sm text-muted-foreground">{dateFmt.format(new Date(p.playedAt))}</span>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{t('list.winners')}: {winners || '—'}</p>
                      {p.description && <p className="text-sm mt-1 text-muted-foreground">{p.description}</p>}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire `validateSearch` into `src/routes/index.tsx`** (replace existing minimal home)

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/lib/i18n/I18nProvider';
import { ListView } from '~/features/plays/list-view';

const SearchSchema = z.object({
  q: z.string().optional(),
  gameId: z.string().optional(),
  memberId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute('/')({
  ssr: false,
  validateSearch: (s) => SearchSchema.parse(s),
  component: HomeRoute,
});

function HomeRoute() {
  const { t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  return (
    <main data-testid="home-root" className="mx-auto max-w-3xl min-h-screen p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('common.appName')}</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate({ to: '/plays/new' })} data-testid="new-play-button">
            + {t('list.newPlay')}
          </Button>
          <Button variant="ghost" onClick={() => setLocale(locale === 'ko-KR' ? 'en' : 'ko-KR')}>
            {locale === 'ko-KR' ? 'English' : '한국어'}
          </Button>
        </div>
      </div>
      <ListView
        filters={search}
        onFiltersChange={(next) => navigate({ to: '/', search: () => next })}
      />
    </main>
  );
}
```

- [ ] **Step 4: Add i18n keys**

ko.json additions:
```json
"list.empty": "아직 기록된 플레이가 없습니다",
"list.newPlay": "새 플레이",
"list.filter.search": "검색",
"list.filter.game": "게임 필터",
"list.filter.member": "참가자 필터",
"list.filter.allGames": "모든 게임",
"list.filter.allMembers": "모든 참가자",
"list.filter.clear": "필터 지우기",
"list.winners": "승자",
"list.unknownGame": "알 수 없는 게임"
```

en.json additions:
```json
"list.empty": "No plays recorded yet",
"list.newPlay": "New play",
"list.filter.search": "Search",
"list.filter.game": "Filter by game",
"list.filter.member": "Filter by member",
"list.filter.allGames": "All games",
"list.filter.allMembers": "All members",
"list.filter.clear": "Clear filters",
"list.winners": "Winners",
"list.unknownGame": "Unknown game"
```

- [ ] **Step 5: Create story**

`src/features/plays/list-view.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { useState } from 'react';
import { ListView, type ListViewFilters } from './list-view';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import { createLocalMember } from '~/local/members';
import { createLocalPlay } from '~/local/plays';

const meta: Meta<typeof ListView> = {
  title: 'Features/ListView',
  component: ListView,
  decorators: [(Story) => <I18nProvider initialLocale="en"><Story /></I18nProvider>],
};
export default meta;

function Wrap() {
  const [f, setF] = useState<ListViewFilters>({});
  return <ListView filters={f} onFiltersChange={setF} />;
}

export const Empty: StoryObj = {
  loaders: [async () => { __resetLocalDbForTests(); await indexedDB.deleteDatabase('gamstory'); return {}; }],
  render: () => <Wrap />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByTestId('list-empty')).resolves.toBeInTheDocument();
  },
};

export const Populated: StoryObj = {
  loaders: [async () => {
    __resetLocalDbForTests();
    await indexedDB.deleteDatabase('gamstory');
    const g = await createLocalGame({ name: 'Catan' });
    const a = await createLocalMember({ name: 'Alice' });
    const b = await createLocalMember({ name: 'Bob' });
    await createLocalPlay({
      gameRef: { kind: 'local', id: g.id },
      playedAt: Date.now(),
      participants: [
        { localMemberId: a.id, isWinner: true, order: 0 },
        { localMemberId: b.id, isWinner: false, order: 1 },
      ],
      description: 'Close game',
    });
    return {};
  }],
  render: () => <Wrap />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByText('Catan')).resolves.toBeInTheDocument();
    await expect(c.findByText(/Alice/)).resolves.toBeInTheDocument();
  },
};
```

- [ ] **Step 6: Verify**

Old e2e smoke (`tests/e2e/smoke.spec.ts`) referenced `data-testid="home-boot-msg"` which no longer exists. Update the e2e to assert `data-testid="home-root"` + `data-testid="new-play-button"` instead:

```ts
import { test, expect } from '@playwright/test';

test('home shows the new-play affordance', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-root')).toBeVisible();
  await expect(page.getByTestId('new-play-button')).toBeVisible();
});
```

Run:

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm storybook:build && pnpm test:e2e
```

All clean.

- [ ] **Step 7: Commit**

```bash
git add src/routes/index.tsx src/features/plays/list-view.tsx src/features/plays/list-view.stories.tsx src/lib/selectors src/lib/i18n tests/e2e/smoke.spec.ts
git commit -m "feat: list view with validateSearch filters + i18n date formatting"
```

---

## Task 12: Calendar view route

**Files:**
- Create: `src/routes/calendar.tsx`
- Create: `src/features/plays/calendar-view.tsx`
- Create: `src/features/plays/calendar-view.stories.tsx`

- [ ] **Step 1: Implement `src/features/plays/calendar-view.tsx`**

```tsx
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '~/components/ui/drawer';
import { useI18n } from '~/lib/i18n/I18nProvider';
import { useMergedPlays, type MergedPlay } from '~/lib/selectors/use-merged-plays';

export interface CalendarViewProps {
  year: number;
  month: number; // 1-12
  onMonthChange: (year: number, month: number) => void;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function startWeekday(y: number, m: number): number {
  // 0 = Sun
  return new Date(y, m - 1, 1).getDay();
}

function isSameLocalDay(ts: number, y: number, m: number, d: number): boolean {
  const date = new Date(ts);
  return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d;
}

export function CalendarView({ year, month, onMonthChange }: CalendarViewProps) {
  const { t, locale } = useI18n();
  const plays = useMergedPlays();
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null);

  const days = daysInMonth(year, month);
  const lead = startWeekday(year, month);
  const monthFmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' });

  const playsByDay = React.useMemo(() => {
    const map: Record<number, MergedPlay[]> = {};
    for (const p of plays) {
      const d = new Date(p.playedAt);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const dn = d.getDate();
        (map[dn] ??= []).push(p);
      }
    }
    return map;
  }, [plays, year, month]);

  function nav(delta: number) {
    let y = year, m = month + delta;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    onMonthChange(y, m);
  }

  return (
    <div data-testid="calendar-view" className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => nav(-1)} aria-label={t('calendar.prev')} data-testid="calendar-prev">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 data-testid="calendar-month" className="text-lg font-semibold">
          {monthFmt.format(new Date(year, month - 1, 1))}
        </h2>
        <Button variant="ghost" onClick={() => nav(1)} aria-label={t('calendar.next')} data-testid="calendar-next">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs text-center text-muted-foreground">
        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1" data-testid="calendar-grid">
        {Array.from({ length: lead }).map((_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1;
          const items = playsByDay[d] ?? [];
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDay(d)}
              className="aspect-square rounded-md border border-border p-1 text-left hover:bg-muted/50"
              data-testid={`calendar-day-${d}`}
            >
              <div className="text-sm">{d}</div>
              {items.length > 0 && (
                <span
                  data-testid={`calendar-day-${d}-badge`}
                  className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground h-5 min-w-[1.25rem] px-1 text-xs"
                >
                  {items.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Drawer open={selectedDay !== null} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{selectedDay !== null ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(year, month - 1, selectedDay)) : ''}</DrawerTitle>
          </DrawerHeader>
          <ul className="space-y-2 p-4">
            {selectedDay !== null && (playsByDay[selectedDay] ?? []).map((p) => (
              <li key={p.id} className="rounded-md border border-border p-2">
                {p.description ?? t('calendar.noDescription')}
              </li>
            ))}
          </ul>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
```

- [ ] **Step 2: Implement `src/routes/calendar.tsx`**

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { CalendarView } from '~/features/plays/calendar-view';
import { useI18n } from '~/lib/i18n/I18nProvider';
import { Button } from '~/components/ui/button';
import { Link } from '@tanstack/react-router';

const SearchSchema = z.object({
  ym: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

function parseYm(s?: string): { year: number; month: number } {
  if (s) {
    const [y, m] = s.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) return { year: y, month: m };
  }
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1 };
}

export const Route = createFileRoute('/calendar')({
  ssr: false,
  validateSearch: (s) => SearchSchema.parse(s),
  component: CalendarRoute,
});

function CalendarRoute() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { ym } = Route.useSearch();
  const { year, month } = parseYm(ym);

  return (
    <main className="mx-auto max-w-3xl min-h-screen p-6 space-y-4" data-testid="calendar-root">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('calendar.title')}</h1>
        <Link to="/"><Button variant="ghost">{t('common.back')}</Button></Link>
      </div>
      <CalendarView
        year={year}
        month={month}
        onMonthChange={(y, m) => navigate({ to: '/calendar', search: () => ({ ym: `${y}-${String(m).padStart(2, '0')}` }) })}
      />
    </main>
  );
}
```

- [ ] **Step 3: Add i18n keys**

ko.json:
```json
"calendar.title": "달력",
"calendar.prev": "이전 달",
"calendar.next": "다음 달",
"calendar.noDescription": "메모 없음",
"common.back": "뒤로"
```

en.json:
```json
"calendar.title": "Calendar",
"calendar.prev": "Previous month",
"calendar.next": "Next month",
"calendar.noDescription": "No notes",
"common.back": "Back"
```

- [ ] **Step 4: Add a "Calendar" affordance to the list view header** — add to `src/routes/index.tsx`:

```tsx
<Link to="/calendar"><Button variant="ghost">{t('list.calendar')}</Button></Link>
```

And the key in both message files: `"list.calendar": "달력"` / `"Calendar"`.

- [ ] **Step 5: Story**

`src/features/plays/calendar-view.stories.tsx` — mirror ListView story; seed two plays on the 4th and 5th of the current month, assert the badge count `2` on day 4 or similar. Use the current date dynamically so the test isn't time-sensitive.

```tsx
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { useState } from 'react';
import { CalendarView } from './calendar-view';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import { createLocalMember } from '~/local/members';
import { createLocalPlay } from '~/local/plays';

const meta: Meta<typeof CalendarView> = {
  title: 'Features/CalendarView',
  component: CalendarView,
  decorators: [(Story) => <I18nProvider initialLocale="en"><Story /></I18nProvider>],
};
export default meta;

function Wrap({ y, m }: { y: number; m: number }) {
  const [ym, setYm] = useState({ y, m });
  return <CalendarView year={ym.y} month={ym.m} onMonthChange={(yy, mm) => setYm({ y: yy, m: mm })} />;
}

export const WithTwoPlays: StoryObj = {
  loaders: [async () => {
    __resetLocalDbForTests();
    await indexedDB.deleteDatabase('gamstory');
    const g = await createLocalGame({ name: 'Catan' });
    const m = await createLocalMember({ name: 'Alice' });
    const today = new Date();
    const fixedDay = new Date(today.getFullYear(), today.getMonth(), 4).getTime();
    await createLocalPlay({ gameRef: { kind: 'local', id: g.id }, playedAt: fixedDay, participants: [{ localMemberId: m.id, isWinner: true, order: 0 }] });
    await createLocalPlay({ gameRef: { kind: 'local', id: g.id }, playedAt: fixedDay, participants: [{ localMemberId: m.id, isWinner: true, order: 0 }] });
    return {};
  }],
  render: () => {
    const today = new Date();
    return <Wrap y={today.getFullYear()} m={today.getMonth() + 1} />;
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByTestId('calendar-day-4-badge')).resolves.toHaveTextContent('2');
  },
};
```

- [ ] **Step 6: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm storybook:build && pnpm test:e2e
```

All clean.

- [ ] **Step 7: Commit**

```bash
git add src/routes/calendar.tsx src/features/plays/calendar-view.tsx src/features/plays/calendar-view.stories.tsx src/routes/index.tsx src/lib/i18n
git commit -m "feat: calendar view with month nav + day drawer + URL search params"
```

---

## Task 13: Play detail route (read-only for local plays)

**Files:**
- Create: `src/routes/plays/$playId.tsx`
- Create: `src/features/plays/play-detail.tsx`
- Create: `src/features/plays/play-detail.stories.tsx`

- [ ] **Step 1: Implement `src/features/plays/play-detail.tsx`**

```tsx
import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, CardContent, CardHeader, CardFooter } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/lib/i18n/I18nProvider';
import { getLocalPlay, deleteLocalPlay } from '~/local/plays';
import { listPhotosForPlay } from '~/local/photos';
import { listLocalMembers } from '~/local/members';
import { listLocalGames } from '~/local/games';

export interface PlayDetailProps {
  playId: string;
  onDeleted: () => void;
}

export function PlayDetail({ playId, onDeleted }: PlayDetailProps) {
  const { t, locale } = useI18n();
  const play = useLiveQuery(() => getLocalPlay(playId), [playId]);
  const photos = useLiveQuery(() => listPhotosForPlay(playId), [playId]) ?? [];
  const members = useLiveQuery(() => listLocalMembers(), []) ?? [];
  const games = useLiveQuery(() => listLocalGames(), []) ?? [];

  const objectUrls = React.useMemo(() => photos.map((p) => URL.createObjectURL(p.blob)), [photos]);
  React.useEffect(() => () => { objectUrls.forEach(URL.revokeObjectURL); }, [objectUrls]);

  if (!play) return <p data-testid="play-detail-loading">{t('detail.loading')}</p>;

  const game = games.find((g) => g.id === play.gameRef.id)?.name ?? t('list.unknownGame');
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });

  async function handleDelete() {
    if (!confirm(t('detail.confirmDelete'))) return;
    await deleteLocalPlay(playId);
    onDeleted();
  }

  return (
    <Card data-testid="play-detail">
      <CardHeader className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{game}</h1>
          <p className="text-sm text-muted-foreground">{dateFmt.format(new Date(play.playedAt))}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/plays/$playId/edit" params={{ playId }}>
            <Button variant="outline" data-testid="play-detail-edit">{t('common.edit')}</Button>
          </Link>
          <Button variant="ghost" onClick={handleDelete} data-testid="play-detail-delete">{t('common.delete')}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <section>
          <h2 className="font-medium">{t('detail.participants')}</h2>
          <ul className="space-y-0.5">
            {play.participants.map((p) => {
              const name = members.find((m) => m.id === p.localMemberId)?.name ?? '?';
              return (
                <li key={p.localMemberId} className="text-sm">
                  {p.isWinner && '🏆 '}
                  {name}
                  {p.rank !== undefined && ` · #${p.rank}`}
                  {p.score !== undefined && ` · ${p.score}`}
                </li>
              );
            })}
          </ul>
        </section>

        {play.description && (
          <section>
            <h2 className="font-medium">{t('detail.notes')}</h2>
            <p className="text-sm whitespace-pre-wrap">{play.description}</p>
          </section>
        )}

        {photos.length > 0 && (
          <section data-testid="play-detail-photos">
            <h2 className="font-medium">{t('detail.photos')}</h2>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <img key={p.id} src={objectUrls[i]} alt="" className="h-24 w-24 rounded-md object-cover" />
              ))}
            </div>
          </section>
        )}
      </CardContent>
      <CardFooter>
        <Link to="/"><Button variant="ghost">{t('common.back')}</Button></Link>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: Implement `src/routes/plays/$playId.tsx`**

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PlayDetail } from '~/features/plays/play-detail';
import { PhotoUploader } from '~/features/plays/photo-uploader';

export const Route = createFileRoute('/plays/$playId')({
  ssr: false,
  component: PlayDetailRoute,
});

function PlayDetailRoute() {
  const { playId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <main className="mx-auto max-w-2xl min-h-screen p-6 space-y-4">
      <PlayDetail playId={playId} onDeleted={() => navigate({ to: '/' })} />
      <PhotoUploader playId={playId} />
    </main>
  );
}
```

- [ ] **Step 3: Add i18n keys**

ko.json:
```json
"detail.loading": "불러오는 중...",
"detail.participants": "참가자",
"detail.notes": "메모",
"detail.photos": "사진",
"detail.confirmDelete": "이 플레이를 삭제하시겠어요?",
"common.edit": "수정",
"common.delete": "삭제"
```

en.json:
```json
"detail.loading": "Loading...",
"detail.participants": "Participants",
"detail.notes": "Notes",
"detail.photos": "Photos",
"detail.confirmDelete": "Delete this play?",
"common.edit": "Edit",
"common.delete": "Delete"
```

- [ ] **Step 4: Story**

`src/features/plays/play-detail.stories.tsx` — seed a play, render with that id, assert game name + participant names visible.

```tsx
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { useState } from 'react';
import { PlayDetail } from './play-detail';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import { createLocalMember } from '~/local/members';
import { createLocalPlay } from '~/local/plays';

const meta: Meta<typeof PlayDetail> = {
  title: 'Features/PlayDetail',
  component: PlayDetail,
  decorators: [(Story) => <I18nProvider initialLocale="en"><Story /></I18nProvider>],
};
export default meta;

function Wrap({ playId }: { playId: string }) {
  const [del, setDel] = useState(false);
  if (del) return <p>deleted</p>;
  return <PlayDetail playId={playId} onDeleted={() => setDel(true)} />;
}

export const Populated: StoryObj = {
  loaders: [async () => {
    __resetLocalDbForTests();
    await indexedDB.deleteDatabase('gamstory');
    const g = await createLocalGame({ name: 'Catan' });
    const a = await createLocalMember({ name: 'Alice' });
    const b = await createLocalMember({ name: 'Bob' });
    const p = await createLocalPlay({
      gameRef: { kind: 'local', id: g.id },
      playedAt: Date.now(),
      participants: [
        { localMemberId: a.id, isWinner: true, order: 0, rank: 1, score: 87 },
        { localMemberId: b.id, isWinner: false, order: 1, rank: 2, score: 63 },
      ],
      description: 'Great game',
    });
    return { playId: p.id };
  }],
  render: (_args, { loaded }) => <Wrap playId={(loaded as { playId: string }).playId} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByText('Catan')).resolves.toBeInTheDocument();
    await expect(c.findByText(/Alice/)).resolves.toBeInTheDocument();
    await expect(c.findByText(/Bob/)).resolves.toBeInTheDocument();
    await expect(c.findByText('Great game')).resolves.toBeInTheDocument();
  },
};
```

- [ ] **Step 5: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm storybook:build && pnpm test:e2e
```

All clean.

- [ ] **Step 6: Commit**

```bash
git add src/routes/plays/$playId.tsx src/features/plays/play-detail.tsx src/features/plays/play-detail.stories.tsx src/lib/i18n
git commit -m "feat: play detail route with photos + edit/delete affordances"
```

---

## Phase D — Integration (Task 14)

## Task 14: Anonymous quick-log Playwright e2e

**Files:**
- Create: `tests/e2e/anonymous-quick-log.spec.ts`

- [ ] **Step 1: Create the spec**

```ts
import { test, expect } from '@playwright/test';

// Helper: clear IndexedDB before each test so runs are isolated.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('gamstory');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  // Reload to ensure the app reconnects to a clean DB.
  await page.reload();
});

test('anonymous user logs a play and sees it in list + calendar', async ({ page }) => {
  await expect(page.getByTestId('list-empty')).toBeVisible();

  // Open the new-play form
  await page.getByTestId('new-play-button').click();
  await expect(page).toHaveURL(/\/plays\/new/);

  // Date defaults to today; verify the input is populated
  await expect(page.getByTestId('play-form-date')).not.toHaveValue('');

  // Add a game by typing + create
  await page.getByTestId('game-picker-input').fill('Catan');
  await page.getByTestId('game-picker-create').click();

  // Add two members
  await page.getByTestId('member-picker-input').fill('Alice');
  await page.getByTestId('member-picker-create').click();
  await page.getByTestId('member-picker-input').fill('Bob');
  await page.getByTestId('member-picker-create').click();

  // Pick one winner — find the first winner checkbox and click it
  const winnerCheckboxes = page.locator('[data-testid^="play-form-winner-"]');
  await expect(winnerCheckboxes).toHaveCount(2);
  await winnerCheckboxes.first().check();

  // Description
  await page.getByTestId('play-form-description').fill('First recorded game');

  // Submit
  await page.getByTestId('play-form-submit').click();

  // Detail view
  await expect(page).toHaveURL(/\/plays\/[A-Z0-9]+/i);
  await expect(page.getByTestId('play-detail')).toBeVisible();
  await expect(page.getByText('Catan')).toBeVisible();
  await expect(page.getByText('First recorded game')).toBeVisible();

  // Back to list
  await page.getByRole('link', { name: /back/i }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('list-rows')).toBeVisible();
  await expect(page.getByText('Catan')).toBeVisible();

  // Switch to calendar and see today's badge
  await page.getByRole('link', { name: /calendar/i }).click();
  await expect(page).toHaveURL(/\/calendar/);
  const today = new Date();
  await expect(page.getByTestId(`calendar-day-${today.getDate()}-badge`)).toHaveText('1');
});
```

- [ ] **Step 2: Run e2e**

```bash
pnpm test:e2e
```

Expected: 2 passed (the existing smoke + this new spec).

If the new spec fails because of locale variance (e.g., button labels), switch to English: add `?lang=en` to the first navigation, or use the locale toggle.

If it fails because the form's winner checkboxes use `id` not `name`, the `data-testid^="play-form-winner-"` selector should still match — adjust if needed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/anonymous-quick-log.spec.ts
git commit -m "test(e2e): anonymous user logs a play and sees it in list + calendar"
```

---

## Done — Acceptance criteria for Plan 2

Run all of the following and confirm green:

```bash
pnpm db:up                            # postgres + redis still healthy (from Plan 1)
pnpm typecheck                        # clean
pnpm lint                             # clean
pnpm test:unit                        # all unit tests pass (rough total: 50+)
pnpm test:int                         # integration sanity test passes
pnpm storybook:build                  # builds with no errors
pnpm test:stories                     # all play functions pass
pnpm test:e2e                         # smoke + anonymous-quick-log both pass
pnpm dev                              # http://localhost:3000 boots
```

Manually verify in the browser:
- `http://localhost:3000` shows an empty-list state with a "+ 새 플레이" / "+ New play" button.
- Click → form opens. Add a game ("Catan"), add a member ("Alice"), check winner, submit.
- Returns to detail view showing the new play. Photo uploader visible (won't be exercised in e2e).
- Click "Back" → list view shows the new entry. Click the entry → detail again.
- Switch language toggle. All copy updates.
- Click "Calendar" → today's day shows a count badge of 1. Click the day → drawer shows the play.
- Reload — data persists (IndexedDB).

Plan 2 ships an anonymous, fully usable offline play tracker. Plan 3 (workspaces + invites) will layer Google/Kakao OAuth, workspace creation, and invite redemption on top.

---

## Self-review notes

This plan was reviewed against `docs/superpowers/specs/2026-06-05-gamstory-design.md`:

- **§3 Local schema (Dexie)** — Task 1 lands `localGames`, `localMembers`, `localPlays`, `localPhotos`, `gameCache` with the exact fields from the spec (game_ref tagged union, member links per workspace, idempotency_key, sync_state, etc.).
- **§4.1 Anonymous quick-log** — Tasks 7–14 implement the flow (game picker → member picker → form → save → list/calendar).
- **§4.5 List view** — Task 11 (filters via URL search params, validated by `validateSearch`).
- **§4.6 Calendar view** — Task 12 (month grid, day badges, drawer).
- **§5 Module boundaries** — `local/*` is the only Dexie caller; `features/*` is pure UI; routes that touch Dexie are `ssr: false`. `lib/queries/*` and `server/fns/*` are NOT touched (Plan 3+ owns them).
- **§6 Photos** — Task 4 (magic-byte sniff, HEIC rejection, EXIF strip + re-encode via Worker primitives). GPS-absence assertion in tests.
- **§6 IndexedDB quota** — Not implemented as user-facing UI in this plan; the throw from Dexie surfaces through the `addPhotoToPlay` rejection. A polished "Storage full" banner is a Plan 6 polish task.
- **§7 Testing — liveQuery integration, migration tests, EXIF-GPS-absent assertion, i18n locale stories** — covered in Tasks 1, 4, plus Storybook stories shipped per feature in EN locale.
- **i18n hardcoded-string lint** — every JSX text on a route or feature consumes `t()`; UI primitives and tests are excluded from the rule (per Plan 1 config).

Not in Plan 2 (deferred):
- Service-worker-based offline manifest (web app manifest, PWA install) — out of scope; spec didn't require it for v1.
- Drag-to-reorder participants — UX nice-to-have, deferred.
- Photo viewer modal (zoom, swipe) — deferred to Plan 5/6 polish.
- Workspace upload from the play detail — Plan 4 (upload + sync).
- Server-side game catalog search — Plan 3 (when signed in) or later. `gameCache` table is in place but unused.
- "Storage full" UX banner — Plan 6 hardening.
- Hydration-mismatch fix for i18n initial locale — Plan 6 polish (pass server-determined locale via route loader).
