import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import '../styles/globals.css';
import { I18nProvider } from '~/lib/i18n/I18nProvider';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'gamstory' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="ko-KR">
      <head>
        <HeadContent />
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
