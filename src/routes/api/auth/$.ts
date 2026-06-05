import { createFileRoute } from '@tanstack/react-router';
import { auth } from '~/server/auth/better-auth';

/**
 * Better Auth catch-all handler.
 *
 * Mounted at `/api/auth/*` via TanStack Start's file-based route + `server.handlers`
 * API (TanStack Start 1.168 / Router 1.171). The legacy `createAPIFileRoute` from
 * `@tanstack/react-start/api` is not exported in this version — the current convention
 * is to attach HTTP method handlers under `server.handlers` on a regular file route.
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
