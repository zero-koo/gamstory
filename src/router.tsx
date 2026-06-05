import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { QueryClient } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (count, err: unknown) => {
          const code = (err as { code?: string } | null)?.code;
          if (
            code === 'UNAUTHORIZED' ||
            code === 'FORBIDDEN' ||
            code === 'VALIDATION' ||
            code === 'CONFLICT'
          ) {
            return false;
          }
          return count < 3;
        },
      },
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
    router: ReturnType<typeof getRouter>;
  }
}
