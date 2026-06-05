# gamstory — Design Spec

**Status:** Draft for review (revision 2 — incorporates backend / frontend / security / quality review)
**Date:** 2026-06-05
**Owner:** zerokoo
**Type:** Greenfield product spec, v1

A board-game play history app. Log plays locally with no account; sign in to share plays with friends inside a workspace.

---

## 1. Scope

### In scope (v1)

- Web app (responsive). Designed to render correctly inside mobile webviews (KakaoTalk, Naver, Safari/Chrome).
- Anonymous local-first usage: log plays, manage games, manage members, attach photos without an account. All data lives in IndexedDB.
- OAuth sign-in (Google + Kakao) unlocks workspace features. PKCE-required.
- A user can belong to multiple workspaces. One workspace represents one group of friends.
- A user uploads a local play into a workspace as an explicit copy. Uploaded plays are editable only by the uploader.
- Global game catalog (one-time external seed; user additions thereafter). Custom local-only games are also supported for anonymous use.
- Members are first-class local entities. A member can be linked to a workspace user on the member record; the link is per workspace.
- Two viewing modes: **list view** and **calendar view**.
- Photo attachments: up to 5 per play, 5 MB per image. Local photos stay in IndexedDB. Uploaded photos go to Vercel Blob (private; per-request signed read URLs).
- **Reactions** on shared plays: fixed emoji set (👍 ❤️ 🎉 😂 👏), one of each per user per play, toggleable. Server-side Zod enum.
- **Comments** on shared plays: flat (no threading), plain text up to 1,000 chars (post-NFC), author can edit/delete own, play owner can delete any.
- Workspace invites via shareable revocable link (token stored as SHA-256 hash, mandatory expiry ≤30 days).
- Locales: Korean (`ko-KR`) and English (`en`); default `ko-KR`.
- Baseline rate limits (Section 9).

### Out of scope (v1)

- Statistics dashboards, leaderboards, win-rate aggregations
- Tags or labels on plays
- Co-op vs competitive game-type metadata beyond per-play winner flags
- Per-play visibility scoping within a workspace
- Real-time presence and live collaborative editing
- Push notifications
- Workspace billing or quotas beyond per-play image limits
- Multi-language entries in the game catalog
- Data export / backup
- Global search bar
- @mentions, custom reactions, comment attachments, markdown in comments
- Native mobile apps (web works inside webviews)
- Email-based workspace invites
- Workspace roles beyond `owner` / `member`
- Workspace-owner comment moderation (only comment author and play owner can delete)

---

## 2. Architecture

### Stack

| Layer | Choice |
|---|---|
| Framework | TanStack Start (React, SSR/SPA hybrid, Vite-based) |
| Routing | TanStack Router (file-based, type-safe) |
| Server-side API | TanStack Start server functions (`createServerFn`) + API routes via `createAPIFileRoute` |
| UI | React + Tailwind + shadcn/ui |
| Server-state on client | TanStack Query |
| Local store | IndexedDB via Dexie + `dexie-react-hooks` (`useLiveQuery`) |
| Auth | Better Auth (Google built-in; Kakao via generic OAuth adapter, PKCE S256, signed `state`) |
| Database (prod) | Neon Postgres via Vercel Marketplace |
| Database (local dev) | Postgres 16 via Docker Compose |
| ORM | Drizzle + drizzle-kit migrations |
| Image storage | Vercel Blob (private; per-request short-lived signed read URLs) |
| Validation | Zod (often derived via `drizzle-zod`) |
| Rate limiting | Upstash Redis (Vercel Marketplace) — `@upstash/ratelimit` |
| Deploy | Vercel (TanStack Start via Nitro Vercel preset, Fluid Compute Node.js runtime) |

### Two-store mental model

- **Local store (anonymous-safe).** Every play, member, photo blob, and custom game lives in IndexedDB. Works fully offline. No account required.
- **Cloud store (workspace-bound).** Postgres holds workspaces, memberships, uploaded plays, comments, reactions, and the global game catalog. Vercel Blob holds uploaded images (private).

**Upload is an explicit copy.** Uploading posts the play + image blobs to the server, which writes Postgres rows + Blob objects in a coordinated transaction and returns server IDs. The local copy gets a `remote` pointer but remains the local source of truth for the local mirror. Edits to a shared play happen against the server only; the client mirrors via TanStack Query.

### Local dev / production split

- Local dev runs Postgres + Upstash-compatible Redis in Docker (`pnpm db:up` / `pnpm db:down`); `.env.local` points at `localhost`.
- Production / preview deploys use Neon Postgres + Upstash; connection strings auto-wired by Marketplace integrations.
- Drizzle schema and migrations are identical across environments.
- Image storage in local dev points at a preview-environment Vercel Blob store. Image features require network in local dev.
- Seed script populates the global game catalog plus a sample workspace.

---

## 3. Data Model

### Cloud schema (Postgres, Drizzle)

```
user                    Better Auth: id, email, email_verified, name, image, ...
account, session,
verification            Better Auth tables
                        -- refresh tokens encrypted at rest

workspace               id, name, owner_user_id, created_at, deleted_at?
workspace_user          id, workspace_id, user_id, role ('owner'|'member'), joined_at
                        UNIQUE (workspace_id, user_id)
workspace_player        id, workspace_id, display_name, linked_user_id?, avatar_url?,
                        created_by_user_id, created_at
                        UNIQUE (workspace_id, lower(display_name)) WHERE linked_user_id IS NULL
                        -- partial unique to dedupe guests across concurrent inserts
                        UNIQUE (workspace_id, linked_user_id) WHERE linked_user_id IS NOT NULL
workspace_invite        id, workspace_id, token_hash (bytea), token_prefix (text, 8 chars),
                        expires_at NOT NULL, max_uses?, uses, revoked_at?,
                        created_by_user_id, created_at
                        UNIQUE (token_hash)
                        -- raw token only ever in URL; DB stores SHA-256 hash
                        -- expires_at always set; server caps at created_at + 30 days

game                    id, name, image_url?, year?, min_players?, max_players?,
                        source ('seed'|'user'), source_ref?, added_by_user_id?, created_at

play                    id, workspace_id, game_id, owner_user_id, played_at,
                        description?, version int NOT NULL DEFAULT 1,
                        idempotency_key (uuid) NOT NULL,
                        created_at, updated_at, deleted_at?
                        UNIQUE (workspace_id, owner_user_id, idempotency_key)
play_participant        play_id, workspace_player_id,
                        rank? CHECK (rank >= 1),
                        score? CHECK (score >= -1000000 AND score <= 1000000),
                        is_winner boolean NOT NULL DEFAULT false,
                        display_order int NOT NULL,
                        PRIMARY KEY (play_id, workspace_player_id)
                        FOREIGN KEY (play_id) REFERENCES play(id) ON DELETE CASCADE
play_photo              id, play_id, blob_path,
                        workspace_id, idempotency_key, photo_local_id,
                        mime_type, byte_size, width?, height?,
                        "order" int NOT NULL,
                        status ('pending'|'committed'),
                        created_at,
                        UNIQUE (workspace_id, idempotency_key, photo_local_id)
                        FOREIGN KEY (play_id) REFERENCES play(id) ON DELETE CASCADE
                        -- 'pending' rows older than TTL are swept (blob + row deleted)
                        -- workspace_id/idempotency_key/photo_local_id duplicated from
                        -- the upload draft to enforce server-side idempotency before
                        -- the play row exists
play_comment            id, play_id, author_user_id,
                        body text NULL,
                        -- body is NULL iff deleted_at IS NOT NULL (privacy-respecting)
                        created_at, updated_at,
                        deleted_at?, deleted_by_user_id?,
                        FOREIGN KEY (play_id) REFERENCES play(id) ON DELETE CASCADE
                        CHECK ((deleted_at IS NULL AND body IS NOT NULL)
                            OR (deleted_at IS NOT NULL AND body IS NULL))
play_reaction           play_id, user_id, emoji ('thumbs_up'|'heart'|'tada'|'joy'|'clap'),
                        created_at,
                        PRIMARY KEY (play_id, user_id, emoji)
                        FOREIGN KEY (play_id) REFERENCES play(id) ON DELETE CASCADE
```

**Indexes**

- `play (workspace_id, played_at DESC, id DESC)` — supports keyset pagination
- `play (workspace_id, deleted_at) WHERE deleted_at IS NULL` — hot-path filter
- `play_participant (workspace_player_id)`
- `play_comment (play_id, created_at) WHERE deleted_at IS NULL`
- `play_reaction (play_id)` + `play_reaction (user_id)`
- `workspace_player (workspace_id, linked_user_id)`
- `workspace_invite (token_hash)` — UNIQUE
- `play_photo (play_id) WHERE status = 'committed'`

**Invariants**

- `workspace_user.role = 'owner'` exists for the workspace creator. `workspace.owner_user_id` denormalises this for cheap lookups.
- Editing a play requires `play.owner_user_id = current_user_id`. Enforced server-side via membership re-check; UI gates the Edit button.
- Comments: author edits/deletes own; play owner can delete any. Workspace owner has no moderation authority in v1.
- Reactions: a duplicate `(play_id, user_id, emoji)` insert is a no-op; a second toggle deletes.
- Optimistic concurrency uses `play.version`. Edits send the last-seen version; `UPDATE play SET ..., version = version + 1 WHERE id = $id AND version = $prev` returns 0 rows on conflict → `CONFLICT(stale)` with `details.serverVersion`.
- Shared `play.deleted_at` is set on delete; comments and reactions cascade only by physical FK cascade (allowed because UI shows deleted plays as tombstones via `deleted_at` rather than relying on related row presence).
- All deletes against tables that own user data (`play`, `play_photo`) trigger Blob cleanup via a transactional outbox (Section 4.9).

### Local schema (Dexie)

```
local_game              id, name, image_blob?
local_member            id, name, avatar_blob?,
                        links: [{ workspace_id, workspace_player_id }]
local_play              id,
                        game_ref ({ kind: 'global'|'local', id }),
                        played_at,
                        participants: [{ local_member_id, rank?, score?, is_winner, order }],
                        description?,
                        photo_ids: [local_photo_id],
                        remote?: { workspace_id, play_id, version },
                        sync_state: 'local'|'uploading'|'uploaded'|'failed',
                        sync_progress?: SyncProgress (Section 4.4),
                        idempotency_key (uuid, generated on save)
local_photo             id, play_id, blob (Blob), "order",
                        mime_type, byte_size, width?, height?,
                        upload_state?: 'pending'|'uploaded'|'failed'
game_cache              id, name, image_url?, year?, min_players?, max_players?,
                        cached_at
                        -- LRU bounded; recently used global games for offline display
```

- `game_ref` is a tagged union.
- After upload, `local_play.remote` is set and `local_play` becomes a read-only mirror.
- `local_member.links` is per workspace because the same person can correspond to different `workspace_player` records across workspaces.
- Dexie schema version is incremented for every shape change; migrations live in `src/local/db/migrations.ts` and are tested with `fake-indexeddb`.

---

## 4. Key Data Flows

### 4.1 Anonymous quick-log (no account)

1. App opens. Route loaders are client-only for any path that touches Dexie (`ssr: false` on `routes/index.tsx`, `routes/calendar.tsx`, `routes/plays/$playId.tsx`, `routes/plays/new.tsx`).
2. Local data is consumed via `useLiveQuery` from `dexie-react-hooks` directly inside `features/*`. TanStack Query is not used for local data.
3. User taps **New play** → form pulls game options from Dexie (`local_game` + `game_cache`) and, if online + signed in, additionally from `searchGames` server fn.
4. User picks members from a Dexie-backed `local_member` typeahead with inline "create new".
5. Save commits a Dexie transaction: `local_play` + `local_photo` rows with `sync_state='local'`, fresh `idempotency_key`.
6. List view updates reactively via `useLiveQuery`.

### 4.2 Sign in to workspace

1. User taps **Sign in**. UI shows Google + Kakao buttons and, when running inside an embedded webview that strips cookies, an "Open in browser" escape hatch.
2. Better Auth runs OAuth with **PKCE (S256)**, signed `state` parameter bound to a server-side nonce, and an exact-match redirect URI allowlist. Better Auth handler is mounted as an API route at `routes/api/auth/$.ts` via `createAPIFileRoute`.
3. On callback the server creates or links the `user` row. Cross-provider account linking is **only** by `email_verified = true`; unverified Kakao emails cannot claim an existing account.
4. Session cookie: `HttpOnly; Secure; SameSite=Lax; __Host-` prefix. Refresh tokens encrypted at rest with a key from env.
5. Client revalidates via Better Auth React client.
6. After sign-in the user lands on the **Workspaces** page (`routes/workspaces/index.tsx`).

### 4.3 Create or join workspace

- **Create.** Server fn inserts `workspace` + `workspace_user(role=owner)` and seeds a `workspace_player(linked_user_id = current_user_id)`.
- **Generate invite link.** Owner UI calls `createInvite`: server generates a 32-byte urlsafe token, stores `token_hash = sha256(token)`, `token_prefix = token[:8]` (for human-readable display in the owner's invite list), `expires_at = min(caller_value, now + 30 days)`, optional `max_uses`. Returns `https://.../invite/{token}`. Raw token is never persisted.
- **Revoke.** `revokeInvite` sets `revoked_at = now()`.
- **Join via link.** Route `/invite/$token`:
  1. Loader hashes the token, looks up by `token_hash`, checks `revoked_at IS NULL`, `expires_at > now()`, `uses < COALESCE(max_uses, infinity)` — all in a single atomic SQL: `UPDATE workspace_invite SET uses = uses + 1 WHERE token_hash = $h AND revoked_at IS NULL AND expires_at > now() AND (max_uses IS NULL OR uses < max_uses) RETURNING workspace_id`.
  2. If the update affected 0 rows → `NOT_FOUND` or `CONFLICT(invite_expired|invite_exhausted|invite_revoked)` based on which predicate failed (re-queried for messaging).
  3. If the user is signed in, inserts `workspace_user(role=member)` + a `workspace_player(linked_user_id = current_user_id)`. If not signed in, redirects to sign-in with `returnTo=/invite/{token}` (token still in URL since we haven't decremented).
- **Rate limits.** Per-IP: 10 redemptions / min. Per-token: 20 attempts / hour.

### 4.4 Upload a local play to a workspace

The risky path. Designed to be idempotent and resumable.

`SyncProgress` shape persisted in Dexie:

```ts
type SyncProgress =
  | { phase: 'resolving_players'; ok: false }
  | { phase: 'uploading_photos'; done: string[]; failed: string[] }   // local_photo ids
  | { phase: 'inserting_play'; ok: false }
  | { phase: 'completed'; play_id: string; version: number }
  | { phase: 'failed'; step: 'players'|'photos'|'play'; code: AppErrorCode };
```

Flow:

1. Client picks a `local_play`, sets `sync_state='uploading'`, ensures `idempotency_key` is set.
2. Client calls `uploadPlay({ workspace_id, local_play_summary })` — *summary* contains player names, but not photo blobs yet.
3. Server resolves each `local_member` → `workspace_player`. Insert uses `INSERT ... ON CONFLICT (workspace_id, lower(display_name)) WHERE linked_user_id IS NULL DO NOTHING RETURNING id` and re-`SELECT` on conflict. Returns the mapping to the client; client stores into `local_member.links`. Progress → `resolving_players` done.
4. For each photo, the client requests `createPhotoUploadUrl({ workspace_id, idempotency_key, photo_local_id, content_type, content_length })`. Server:
   - Re-checks workspace membership.
   - Validates `content_type` against allow list (`image/jpeg|png|webp`) and `content_length ≤ 5 MB`.
   - Inserts a `play_photo` row with `status='pending'`, `idempotency_scope=(workspace_id, idempotency_key, photo_local_id)`. If the row already exists → returns its `id` (idempotent retry).
   - Mints a signed PUT URL bound to `(content_type, content_length, blob_path)`. URL expires in 10 min.
   Client PUTs the (EXIF-stripped, re-encoded by client) blob. Progress → `uploading_photos.done` updated.
5. Client calls `commitPlay({ workspace_id, idempotency_key, payload })`. Server, in a single transaction:
   - Re-checks workspace membership.
   - Verifies all referenced `play_photo` rows exist with `status='pending'` and matching `idempotency_scope`.
   - **Re-strips EXIF + re-encodes** each photo server-side. Updates `play_photo` row with `mime_type, byte_size, width, height` and flips `status='committed'`.
   - Inserts `play` + `play_participant` rows. `(workspace_id, owner_user_id, idempotency_key)` unique constraint makes the whole commit idempotent: a retry returns the existing `play_id` and version.
   - Returns `{ play_id, version, photo_ids }`.
6. Client sets `local_play.remote = { workspace_id, play_id, version }`, `sync_progress = { phase: 'completed', ... }`, `sync_state='uploaded'`.
7. On any failure: `sync_state='failed'`, `sync_progress.phase='failed'` with the step + code. User retries; the orchestrator resumes from the failed step using the same idempotency key.
8. Orphan sweeper: a server cron deletes `play_photo` rows + Blob objects whose `status='pending'` and `created_at < now() - 2 h`.

### 4.5 List view

- **Local-only** plays come from Dexie via `useLiveQuery`.
- **Workspace** plays come from `listPlays({ workspace_id, cursor })` via TanStack Query.
- **Merged** in a selector hook (`useMergedPlays`) keyed by `mergedPlayId = remote.play_id ?? local.id` to dedupe locally-mirrored uploaded plays.
- Pagination is keyset on `(played_at DESC, id DESC)`. Cursor is opaque, base64-encoded.
- Filters (workspace, game, member, date range) and sort live in URL search params validated by TanStack Router `validateSearch`.

### 4.6 Calendar view

- Month grid with count badge + first two thumbnails per day. Tap a day → drawer.
- Query key `queryKeys.plays.calendar(workspaceId, yearMonth)`; adjacent months prefetched and cached.
- Same `useMergedPlays` selector but bucketed by date.
- Month navigation is a URL search param, validated by `validateSearch`. Korean date formatting (`2026년 6월`) and English (`June 2026`) via `Intl.DateTimeFormat`.

### 4.7 Reactions and comments

- `getPlay(playId)` returns play + participants + photos (with **per-request signed read URLs**, ≤5 min expiry, minted only after membership re-check) + comments (excluding `deleted_at IS NOT NULL`) + reaction counts + `myReactions: Emoji[]`.
- **Reaction toggle**: optimistic update with explicit `onMutate`/`onError`/`onSettled` contract. Mutation key is `['reactions', playId, emoji]` to serialise double-taps. Server `toggleReaction({ play_id, emoji })` does `INSERT ... ON CONFLICT DO NOTHING` then `DELETE` only if the insert was a no-op (single statement using CTE).
- **Comment add**: optimistic append with tentative id; replaced on response. Server validates: NFC-normalise → strip control chars → enforce ≤1,000 chars. Body stored verbatim; rendered as text-only by React (no `dangerouslySetInnerHTML` anywhere).
- **Comment edit**: author only. Server fn checks `author_user_id = current_user_id`.
- **Comment delete**: author OR play owner. Workspace owner has **no** moderation authority in v1 (called out so it's not assumed). Soft-delete sets `deleted_at`, `deleted_by_user_id`, and **nulls `body`** (audit-friendly, privacy-respecting). UI renders tombstone: `"삭제된 댓글입니다 / Comment deleted"` with author hidden if play-owner-deleted, shown if self-deleted.
- **Polling**: detail view refetches on focus and every 30 s while visible. Polling pauses when `document.hidden`; verified in a fake-timer test.

### 4.8 Editing a shared play

- Only the owner sees the Edit button. Server functions re-check `play.owner_user_id` and reject with `FORBIDDEN` otherwise.
- Edits send the last-seen `version`. Server returns `CONFLICT(stale, details: { serverVersion })` on mismatch. Client refetches and surfaces a banner.
- Photo additions reuse the §4.4 signed-URL flow (with the same idempotency scope).
- Photo removals: server marks `play_photo` row tombstoned in a tx, then enqueues Blob deletion via the outbox (§4.9).

### 4.9 Blob ↔ DB consistency (outbox)

- Any DB transaction that should result in a Blob delete writes an `outbox_blob_delete (blob_path, enqueued_at)` row in the same tx.
- A short-interval server function (cron, 1 min) drains the outbox: deletes the Blob, then deletes the outbox row. Retries on failure.
- This is the only place that performs Blob mutations outside the upload path.

---

## 5. Module Boundaries

```
src/
  routes/                            # TanStack Router file-based routes
    __root.tsx                       # shell, providers, <html lang> setter
    index.tsx                        # list view (ssr: false)
    calendar.tsx                     # calendar view (ssr: false)
    plays/$playId.tsx                # play detail
    plays/new.tsx                    # play form
    workspaces/index.tsx
    workspaces/$workspaceId.tsx
    workspaces/$workspaceId/settings.tsx
    invite/$token.tsx                # join via link
    auth/sign-in.tsx                 # UI page only
    api/auth/$.ts                    # Better Auth handler (createAPIFileRoute)
  server/
    db/
      schema.ts                      # Drizzle schema
      client.ts                      # postgres-js client
      migrations/                    # drizzle-kit
    auth/
      better-auth.ts                 # PKCE, redirect allowlist, account-linking rule
    blob/
      signed-url.ts                  # mint short-lived put/get URLs
      outbox.ts                      # enqueue/drain blob deletions
      strip-exif.ts                  # server-side EXIF removal + re-encode
    ratelimit/
      index.ts                       # Upstash rate-limit policies
    fns/
      plays.ts                       # uploadPlay, commitPlay, listPlays (keyset),
                                     # getPlay, updatePlay, deletePlay
      games.ts                       # searchGames, addGame
      workspaces.ts                  # createWorkspace, listMine, getMembership
      invites.ts                     # createInvite, redeemInvite,
                                     # listInvites, revokeInvite
      players.ts                     # listPlayers, linkPlayerToUser
      comments.ts                    # addComment, editComment, deleteComment
      reactions.ts                   # toggleReaction
      photos.ts                      # createPhotoUploadUrl, getPhotoReadUrl
  local/                             # browser-only (gated by typeof window check)
    db/
      schema.ts
      client.ts
      migrations.ts
    plays.ts
    members.ts
    games.ts
    photos.ts                        # workerised: createImageBitmap + OffscreenCanvas
  workers/
    photo-processor.ts               # EXIF strip, orientation, thumbnail
  features/                          # React components (may call local/*; never server/*)
    plays/
      list-view.tsx
      calendar-view.tsx
      play-form.tsx
      play-detail.tsx
      photo-uploader.tsx
      reaction-bar.tsx
      comment-thread.tsx
    games/
      game-picker.tsx
    members/
      member-picker.tsx
    workspaces/
      workspace-switcher.tsx
      invite-link-panel.tsx
  components/                        # shadcn/ui primitives
  lib/
    queries/
      keys.ts                        # queryKeys factory
      plays.ts
      games.ts
      workspaces.ts
      players.ts
      comments.ts
      reactions.ts
    sync/
      upload-play.ts                 # client orchestrator (Section 4.4)
      sync-progress.ts               # SyncProgress type + persistence helpers
      idempotency.ts                 # UUID-based keys
    validators/
      app-error.ts                   # AppErrorCode discriminated union
      schemas.ts                     # shared Zod schemas (drizzle-zod derived)
    auth-client.ts
    config.ts                        # env-validated config
    selectors/
      use-merged-plays.ts            # local + workspace merge with mergedPlayId
    i18n/
      messages/{ko,en}.json
      use-locale.ts                  # detection order: URL ?lang > localStorage
                                     # > navigator.language > 'ko-KR'
```

### Interface contracts

- **Routes** depend on `lib/queries/*`, `features/*`, and `server/fns/*` (call sites only). Routes that read Dexie are `ssr: false`.
- **`server/fns/*`** are the only callers of Drizzle. Each function: rate-limits → parses input with Zod → checks auth + workspace membership → checks resource ownership where relevant → mutates DB → returns typed result.
- **`features/*`** are React UI. They may call **`local/*`** directly (it's the browser-only data API) and may consume server data via **`lib/queries/*`** hooks. They must **not** import from `server/fns/*` or `server/db/*`.
- **`local/*`** is the only caller of Dexie. Photo processing offloaded to `workers/photo-processor.ts`.
- **`lib/sync/upload-play.ts`** is the only module that imports both `local/*` and `server/fns/*`. Sync orchestrator.
- **`lib/queries/*`** owns all query keys via a `queryKeys` factory (`queryKeys.plays.list(workspaceId)`, `queryKeys.plays.calendar(workspaceId, yearMonth)`, etc.). Mutations include explicit `onMutate`/`onError`/`onSettled` and a stable mutation key per resource.

### Why these boundaries

- `server/` vs `local/` is the strongest seam: different storage engines, different threat models.
- `features/` can talk to `local/*` because both are browser-only — gating that through an extra layer adds friction without isolation gain.
- A single Drizzle import surface keeps migrations predictable.
- Centralised query keys make invalidations precise and auditable.
- Worker isolation for photo processing keeps the main thread responsive on low-end devices.

---

## 6. Error Handling

### Server error envelope

`AppError({ code, message, status, details? })` codes are a closed discriminated union exported from `lib/validators/app-error.ts`:

```ts
type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'           // with details.subcode: 'stale'|'invite_expired'|
                         //                       'invite_exhausted'|'invite_revoked'|
                         //                       'duplicate'
  | 'RATE_LIMITED'       // with details.retryAfterSec
  | 'STORAGE_FULL'
  | 'INTERNAL';
```

All server functions throw only members of this union (asserted in tests, §7).

`CONFLICT(stale)` carries `details.serverVersion: number` so the client diff banner can show the latest server state.

### Client query layer

- TanStack Query retry policy: 3 retries with exponential backoff for `INTERNAL`/network. **No retry** for `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION`, `CONFLICT`.
- Mutations never auto-retry destructive actions.

### Upload orchestrator

- Each phase updates `local_play.sync_progress` (shape pinned in §4.4) so the resume path has a contract.
- Failed photo upload: retry that single photo (signed URL re-mint counts as one retry).
- Photo upload `fetch` uses `signal: AbortSignal.timeout(30_000)`.

### Local store

- IndexedDB quota errors → non-blocking banner with a "Free space" action listing largest photos.
- Dexie migration failure → recovery screen with explicit "Reset local data" warning. Migration tests (`fake-indexeddb`) gate releases.

### Auth

- Session expiry mid-action → `UNAUTHORIZED`. Client redirects to sign-in with `returnTo`. Form state survives in Dexie.
- OAuth provider failure → provider-agnostic copy with both providers offered.

### Photos / Blob

- File size > 5 MB → reject at file-pick time.
- MIME: accept-attr filtered to `image/jpeg|png|webp`. **Magic-byte sniff** of the first 12 bytes before processing — webview pickers lie about MIME. HEIC explicitly rejected with a friendly message ("HEIC isn't supported yet; please use JPEG or PNG").
- EXIF stripped + orientation normalised in a Web Worker via `createImageBitmap` + `OffscreenCanvas`. Server **re-strips** EXIF and re-encodes on commit so a tampered client can't leak GPS.
- Signed PUT URLs bound to `(content_type, content_length, blob_path)`. Signed GET URLs are short-lived (≤5 min) and minted per request only after server-side membership re-check. Never persisted.

### Concurrent edits

- `play.version` monotonic. Mismatch → `CONFLICT(stale, details.serverVersion)`.
- Comments: edits independent. Deletes tombstoned with `deleted_at` + `deleted_by_user_id`.

### User-facing surfaces

- **Toast** — transient successes / network blips.
- **Inline banner** — stale-edit, validation, photo-too-large.
- **Full-screen recovery state** — Dexie corruption, OAuth callback failure, root crash boundary.
- **Sync state badge** on each local play (`synced` / `pending` / `failed` → tap to retry).

### Logging

- Server: `AppError` logged with code, hashed user id, workspace id. `INTERNAL` includes stack. Vercel Logs.
- Client: errors with `code` go to console; `reportError` helper as a no-op for future wiring.

---

## 7. Testing Strategy

### Unit (Vitest)

- `lib/sync/upload-play.ts` state machine: every phase transition, idempotency, resume from each failed step.
- `lib/validators/*`: Zod boundary values (photo count, score range, comment length post-NFC, control-char rejection).
- `local/photos.ts` + worker: EXIF strip, orientation, **GPS-tag-absent assertion** on output bytes.
- `local/db/migrations.ts`: each version step using `fake-indexeddb`, asserting lossless + idempotent forward migration.
- `server/fns/invites.ts`: token hashing, expiry, max-uses, revocation.
- `lib/validators/app-error.ts`: discriminated union exhaustiveness.
- Drizzle keyset-pagination query: cursor parse/format, stable ordering.

### Integration (Vitest + Testcontainers Postgres + Upstash mock)

- `uploadPlay` end-to-end: kill orchestrator mid-photo-upload, re-run with same idempotency key, assert `play` count == 1 and `play_photo` count matches the final intended set.
- Invite redemption race: two parallel transactions on a `max_uses=1` invite → exactly one `workspace_user` insert; other gets `CONFLICT(invite_exhausted)`.
- Ownership: `updatePlay` / `deletePlay` rejects non-owner with `FORBIDDEN`.
- Comment soft-delete: author deletes own; owner deletes other's; non-owner non-author rejected; row preserved with `body=NULL`.
- Reaction toggle: concurrent double-tap from same user collapses to net XOR of initial state, both orderings.
- `workspace_player` race: two concurrent uploads with same unlinked name produce exactly one row.
- Rate limiting: invite redemption per-IP, comment posting, signed-URL minting.
- "Server fn rejects with no session" using a fake session.

### Storybook + MSW (component play-function tests via `@storybook/test-runner`)

- Per `features/*` component: loading / empty / error / populated / owner-vs-non-owner.
- `play-detail` non-owner story asserts Edit button absence.
- Comment tombstone rendering: self-deleted (author shown) vs play-owner-deleted (author hidden) text.
- Stories ship in both locales (`ko`, `en`) via a Storybook globals decorator.
- Hardcoded-string lint: `eslint-plugin-i18n-json` (or equivalent) flags string literals in JSX outside `<Trans>`/`useTranslation`.

### End-to-end (Playwright)

- `anonymous-quick-log.spec.ts` — add a play locally, see it in list + calendar.
- `upload-and-share.spec.ts` — sign in (seeded test user), create workspace, generate invite, upload play, see as second user.
- `edit-permissions.spec.ts` — non-owner cannot edit; owner can.
- `webview.spec.ts` — Playwright project with a KakaoTalk-like UA + cleared `storageState`; exercises photo download path and the in-webview sign-in escape hatch.
- Trigger conditions on `main` branch and on PRs labeled `e2e`. **Auto-label** on changes to `lib/sync/`, `server/fns/plays.ts`, `server/fns/photos.ts`, `server/fns/invites.ts`, `routes/invite/`, `workers/`.

### Tooling

- Vitest unit + integration (separate `test:unit` / `test:int`).
- `@storybook/test-runner` for component play.
- Playwright for e2e.
- MSW for server-fn mocks in stories.
- `fake-indexeddb` for migration tests.
- `drizzle-kit` migration in CI; shared `resetDb()` helper.

### CI shape

- PR: typecheck + lint + i18n-string lint + unit + integration + Storybook test-runner. ~5 min target.
- Main: above + Playwright e2e against ephemeral preview deploy + webview project.

### Explicitly not tested

- Better Auth, Drizzle, TanStack Router/Query internals.
- Visual regressions (no Chromatic in v1).

---

## 8. Security Posture (cross-cutting)

Most controls already appear inline above. This section is the consolidated checklist so reviewers can sanity-check.

- **Authentication**: Better Auth + Google/Kakao; PKCE S256; signed `state` nonce; exact-match redirect allowlist; account linking only by `email_verified=true`.
- **Sessions**: `HttpOnly; Secure; SameSite=Lax; __Host-` prefix; refresh tokens encrypted at rest.
- **Authorization**: every server fn re-checks workspace membership for the resource it touches. Edit/delete fns additionally check ownership.
- **Invites**: token in URL only; DB stores SHA-256 hash; atomic redemption; mandatory `expires_at ≤ 30 days`; revocable; rate-limited per-IP + per-token.
- **Idempotency keys**: scoped `(workspace_id, owner_user_id, idempotency_key)`; treated as opaque server-side.
- **Photos**: client EXIF strip + server EXIF strip + server re-encode; signed PUT bound to `(content_type, content_length, blob_path)`; signed GET short-lived per-request only after membership check; magic-byte MIME sniff; HEIC rejected explicitly.
- **Comments**: text-only render; NFC normalise; control-char rejection; ≤1,000 chars; no markdown/HTML; no `dangerouslySetInnerHTML` anywhere in code.
- **CSP**: `default-src 'self'; img-src 'self' https://*.public.blob.vercel-storage.com; script-src 'self'; style-src 'self' 'unsafe-inline'` (tighten further once Tailwind extraction is verified). Trusted Types enabled.
- **IndexedDB threat model**: documented as plaintext-at-rest; user-facing toggle "Sign out clears local mirror of shared workspaces" (default off).
- **Rate limits** (Upstash):

| Surface | Limit |
|---|---|
| OAuth callback | 30 / 5 min per IP |
| Invite redemption | 10 / min per IP, 20 / hr per token_hash |
| Comment posting | 30 / 5 min per user |
| Signed-URL minting (put/get) | 60 / min per user |
| `commitPlay` | 20 / 10 min per user |

---

## 9. Open Questions and Explicit Deferrals

### Open questions

1. **Global game catalog source.** Recommended: one-time seed from a BGG data dump + user additions thereafter.
2. **Photo retention on local deletion.** Decision: uploaded photos remain in the workspace; deleting locally is a UI cleanup only.
3. **Anonymous → signed-in migration.** No auto-migration. Users upload plays explicitly (one at a time or batch via multi-select on the list view).
4. **Korean game-catalog entries.** Multi-language entries deferred; v1 uses a single name per game regardless of UI locale.
5. **Workspace-owner comment moderation.** Explicitly out in v1. Reconsider after community feedback.

### Explicit deferrals

Stats / leaderboards, tags, co-op vs competitive metadata, per-play visibility, real-time presence, push notifications, billing/quotas, multi-language catalog, export/backup, global search bar, @mentions, custom reactions, comment attachments, markdown, email invites, workspace roles beyond owner/member.

### Risks

- **TanStack Start maturity.** Pre-1.0. Mitigation: pin versions; isolate framework-specific code in `routes/` and `server/fns/*`.
- **Better Auth Kakao adapter.** Generic OAuth provider. A 30-minute spike in phase 1 confirms the token-refresh path.
- **Mobile webview signed URLs.** Some embedded webviews strip cookies. Mitigations: same-origin proxy if needed; external-browser escape hatch on sign-in; webview Playwright project gates regressions.

---

## Appendix A — Environment Variables

| Name | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | local, Vercel | Postgres connection string |
| `REDIS_URL` / `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | local, Vercel | Rate limiter |
| `BETTER_AUTH_SECRET` | local, Vercel | session token signing |
| `BETTER_AUTH_URL` | local, Vercel | canonical origin |
| `REFRESH_TOKEN_ENC_KEY` | local, Vercel | symmetric key encrypting refresh tokens at rest |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | local, Vercel | Google OAuth |
| `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET` | local, Vercel | Kakao OAuth |
| `BLOB_READ_WRITE_TOKEN` | local, Vercel | Vercel Blob |

## Appendix B — Default Limits (v1)

| Limit | Value |
|---|---|
| Photos per play | 5 |
| Photo file size | 5 MB |
| Photo MIME types | `image/jpeg`, `image/png`, `image/webp` |
| Comment body length | 1,000 chars (post-NFC) |
| Invite token entropy | 32 bytes urlsafe |
| Invite max lifetime | 30 days |
| Signed PUT URL lifetime | 10 min |
| Signed GET URL lifetime | 5 min |
| Game name length | 200 chars |
| Member display name length | 80 chars |
| Workspace name length | 80 chars |
| Orphan photo sweep TTL | 2 h |

## Appendix C — Reaction Emoji Set (v1)

`thumbs_up` (👍), `heart` (❤️), `tada` (🎉), `joy` (😂), `clap` (👏).
Server-side Zod enum enforced.
