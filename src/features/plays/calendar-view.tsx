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

function _isSameLocalDay(ts: number, y: number, m: number, d: number): boolean {
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
