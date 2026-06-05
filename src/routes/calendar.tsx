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
    const [yStr, mStr] = s.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
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
