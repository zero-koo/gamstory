import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '~/components/ui/drawer';
import { useI18n } from '~/lib/i18n/I18nProvider';
import { useMergedPlays, type MergedPlay } from '~/lib/selectors/use-merged-plays';
import { listLocalGames } from '~/local/games';
import { listLocalMembers } from '~/local/members';
import { accentColor } from './_visual';

export interface CalendarViewProps {
  year: number;
  month: number; // 1-12
  onMonthChange: (year: number, month: number) => void;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}
function startWeekday(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay(); // 0 = Sun
}

export function CalendarView({ year, month, onMonthChange }: CalendarViewProps) {
  const { t, locale } = useI18n();
  const plays = useMergedPlays();
  const games = useLiveQuery(() => listLocalGames(), []) ?? [];
  const members = useLiveQuery(() => listLocalMembers(), []) ?? [];
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null);

  const days = daysInMonth(year, month);
  const lead = startWeekday(year, month);
  const monthFmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' });

  const weekdayLabels = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    // 2023-01-01 is a Sunday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)));
  }, [locale]);

  const playsByDay = React.useMemo(() => {
    const map: Record<number, MergedPlay[]> = {};
    for (const p of plays) {
      const d = new Date(p.playedAt);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        (map[d.getDate()] ??= []).push(p);
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

  function gameName(p: MergedPlay) {
    return games.find((g) => g.id === p.gameRef.id)?.name ?? t('list.unknownGame');
  }
  function winnerNames(p: MergedPlay) {
    return p.participants
      .filter((pp) => pp.isWinner)
      .map((pp) => members.find((m) => m.id === pp.localMemberId)?.name ?? '?')
      .join(', ');
  }

  const dayItems = selectedDay !== null ? (playsByDay[selectedDay] ?? []) : [];

  return (
    <div data-testid="calendar-view" className="space-y-3">
      {/* month nav */}
      <div className="flex items-center justify-between">
        <h2 data-testid="calendar-month" className="text-2xl font-extrabold tracking-tight">
          {monthFmt.format(new Date(year, month - 1, 1))}
        </h2>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => nav(-1)}
            aria-label={t('calendar.prev')}
            data-testid="calendar-prev"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-input bg-card text-secondary-foreground transition-colors hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={() => nav(1)}
            aria-label={t('calendar.next')}
            data-testid="calendar-next"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-input bg-card text-secondary-foreground transition-colors hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* weekday header */}
      <div className="grid grid-cols-7 text-center">
        {weekdayLabels.map((label, i) => (
          <span
            key={i}
            className={
              'text-[11px] font-bold ' +
              (i === 0 ? 'text-danger' : i === 6 ? 'text-sage' : 'text-muted-foreground')
            }
          >
            {label}
          </span>
        ))}
      </div>

      {/* day grid */}
      <div className="grid grid-cols-7 gap-1" data-testid="calendar-grid">
        {Array.from({ length: lead }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1;
          const items = playsByDay[d] ?? [];
          const has = items.length > 0;
          const selected = selectedDay === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => has && setSelectedDay(d)}
              data-testid={`calendar-day-${d}`}
              className={
                'relative aspect-square overflow-hidden rounded-[10px] p-1 text-left transition-colors ' +
                (selected
                  ? 'bg-primary shadow-md'
                  : has
                    ? 'border border-border bg-card hover:bg-muted'
                    : '')
              }
            >
              <span
                className={
                  'text-xs font-semibold ' +
                  (selected ? 'text-primary-foreground' : has ? '' : 'text-muted-foreground/60')
                }
              >
                {d}
              </span>
              {has && (
                <span
                  data-testid={`calendar-day-${d}-badge`}
                  className={
                    'absolute right-1 top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[9px] font-bold ' +
                    (selected ? 'bg-card text-primary' : 'bg-primary text-primary-foreground')
                  }
                >
                  {items.length}
                </span>
              )}
              {has && (
                <span className="absolute inset-x-1 bottom-1 flex gap-0.5">
                  {items.slice(0, 2).map((p) => (
                    <span
                      key={p.id}
                      className="h-3.5 flex-1 rounded-[3px]"
                      style={{ background: selected ? 'rgba(255,255,255,.55)' : accentColor(p.id) }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Drawer open={selectedDay !== null} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {selectedDay !== null
                ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(year, month - 1, selectedDay))
                : ''}
              <span className="ml-1.5 text-sm font-semibold text-muted-foreground">
                · {t('detail.playCount', { count: dayItems.length })}
              </span>
            </DrawerTitle>
          </DrawerHeader>
          <ul className="space-y-2 px-4 pb-6">
            {dayItems.map((p) => {
              const win = winnerNames(p);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-[14px] bg-background p-2.5"
                >
                  <span
                    className="h-12 w-12 flex-none rounded-[10px]"
                    style={{ background: accentColor(p.id) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold">{gameName(p)}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                      {t('list.participants', { count: p.participants.length })}
                      {win && ` · ${t('list.winnerBadge', { name: win })}`}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground/60" />
                </li>
              );
            })}
          </ul>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
