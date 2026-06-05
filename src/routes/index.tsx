import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
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
          {/* Calendar route lands in Task 12; until then navigate as a literal path. */}
          <Link to={'/calendar' as never}>
            <Button variant="ghost">{t('list.calendar')}</Button>
          </Link>
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
