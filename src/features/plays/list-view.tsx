import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { useI18n } from '~/lib/i18n/I18nProvider';
import { useMergedPlays } from '~/lib/selectors/use-merged-plays';
import { listLocalGames } from '~/local/games';
import { listLocalMembers } from '~/local/members';
import { SyncBadge, WinnerBadge, ThumbPlaceholder, syncKind } from './_visual';

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
  const hasFilters = Object.values(filters).some((v) => v);

  return (
    <div className="space-y-4" data-testid="list-view">
      {/* title + sort */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-extrabold tracking-tight">{t('list.title')}</h2>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          {t('list.sort.latest')}
          <ChevronDown className="h-4 w-4" />
        </span>
      </div>

      {/* filters */}
      <div className="space-y-2">
        <Input
          placeholder={t('list.filter.search')}
          value={filters.q ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, q: e.target.value || undefined })}
          data-testid="list-filter-q"
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill
            label={t('list.filter.game')}
            allLabel={t('list.filter.allGames')}
            options={games.map((g) => ({ id: g.id, name: g.name }))}
            selectedId={filters.gameId}
            onSelect={(id) => onFiltersChange({ ...filters, gameId: id })}
            testid="list-filter-game"
          />
          <FilterPill
            label={t('list.filter.member')}
            allLabel={t('list.filter.allMembers')}
            options={members.map((m) => ({ id: m.id, name: m.name }))}
            selectedId={filters.memberId}
            onSelect={(id) => onFiltersChange({ ...filters, memberId: id })}
            testid="list-filter-member"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => onFiltersChange({})} data-testid="list-filter-clear">
              {t('list.filter.clear')}
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState testid="list-empty" canClear={hasFilters} onClear={() => onFiltersChange({})} />
      ) : (
        <ul className="space-y-3" data-testid="list-rows">
          {filtered.map((p) => {
            const game = games.find((g) => g.id === p.gameRef.id)?.name ?? t('list.unknownGame');
            const winnerName = p.participants
              .filter((pp) => pp.isWinner)
              .map((pp) => members.find((m) => m.id === pp.localMemberId)?.name ?? '?')
              .join(', ');
            const extra = p.photoIds.length > 1 ? p.photoIds.length - 1 : 0;
            return (
              <li key={p.id}>
                <Link
                  to="/plays/$playId"
                  params={{ playId: p.id }}
                  className="flex gap-3 rounded-lg bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
                >
                  <ThumbPlaceholder seed={p.id} className="h-[84px] w-[84px] rounded-[12px]">
                    {extra > 0 && (
                      <span className="absolute bottom-1 right-1 rounded-md bg-foreground/60 px-1.5 py-0.5 text-[10px] font-bold text-background">
                        +{extra}
                      </span>
                    )}
                  </ThumbPlaceholder>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-base font-bold tracking-tight">{game}</span>
                      <SyncBadge kind={syncKind(p)} className="mt-0.5" />
                    </div>
                    <div className="mt-1 mb-2 text-[13px] text-muted-foreground">
                      {dateFmt.format(new Date(p.playedAt))} · {t('list.participants', { count: p.participants.length })}
                    </div>
                    {winnerName && <WinnerBadge name={winnerName} />}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterPill({
  label,
  allLabel,
  options,
  selectedId,
  onSelect,
  testid,
}: {
  label: string;
  allLabel: string;
  options: { id: string; name: string }[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  testid: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.id === selectedId);
  const pill = 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors';
  const row =
    'flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted';

  if (selected) {
    return (
      <span className={`${pill} bg-primary text-primary-foreground`} data-testid={testid}>
        {selected.name}
        <button
          type="button"
          aria-label={t('list.filter.clear')}
          onClick={() => onSelect(undefined)}
          className="opacity-80 transition-opacity hover:opacity-100"
        >
          <X className="h-3 w-3" strokeWidth={2.6} />
        </button>
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          className={`${pill} border border-input bg-card text-secondary-foreground hover:bg-muted`}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <ul className="max-h-72 overflow-auto">
          <li>
            <button
              type="button"
              className={row}
              onClick={() => { onSelect(undefined); setOpen(false); }}
            >
              {allLabel}
              {!selectedId && <Check className="h-4 w-4 text-primary" strokeWidth={2.6} />}
            </button>
          </li>
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={row}
                onClick={() => { onSelect(o.id); setOpen(false); }}
              >
                {o.name}
                {selectedId === o.id && <Check className="h-4 w-4 text-primary" strokeWidth={2.6} />}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({
  testid,
  canClear,
  onClear,
}: {
  testid: string;
  canClear: boolean;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      data-testid={testid}
      className="flex flex-col items-center rounded-lg bg-card px-6 py-12 text-center shadow-sm"
    >
      <DiceArt />
      <h3 className="mt-2 text-xl font-extrabold tracking-tight">{t('list.empty.title')}</h3>
      <p className="mt-2 mb-5 whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
        {t('list.empty.body')}
      </p>
      {canClear ? (
        <Button variant="secondary" onClick={onClear}>{t('list.filter.clear')}</Button>
      ) : (
        <Link
          to="/plays/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-base font-bold text-primary-foreground shadow-md transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-5 w-5" strokeWidth={2.6} />
          {t('list.empty.cta')}
        </Link>
      )}
      <p className="mt-5 text-[12.5px] text-muted-foreground/80">{t('list.empty.safe')}</p>
    </div>
  );
}

/** Playful stacked-dice illustration for the empty state. */
function DiceArt() {
  return (
    <svg width="140" height="116" viewBox="0 0 120 100" fill="none" aria-hidden>
      <ellipse cx="60" cy="90" rx="42" ry="6" fill="var(--color-muted)" />
      <rect x="22" y="34" width="42" height="42" rx="8" transform="rotate(-9 43 55)" fill="var(--color-mustard)" />
      <circle cx="35" cy="48" r="3.2" fill="#fff" /><circle cx="50" cy="62" r="3.2" fill="#fff" />
      <circle cx="50" cy="48" r="3.2" fill="#fff" /><circle cx="35" cy="62" r="3.2" fill="#fff" />
      <rect x="58" y="28" width="44" height="44" rx="8" transform="rotate(7 80 50)" fill="var(--color-primary)" />
      <circle cx="74" cy="42" r="3.4" fill="#fff" /><circle cx="90" cy="58" r="3.4" fill="#fff" />
      <circle cx="90" cy="42" r="3.4" fill="#fff" /><circle cx="74" cy="58" r="3.4" fill="#fff" />
      <circle cx="82" cy="50" r="3.4" fill="#fff" />
      <path d="M104 18l2.2 5.2 5.6 2.2-5.6 2.2L104 33l-2.2-5.4-5.6-2.2 5.6-2.2z" fill="var(--color-sage)" />
    </svg>
  );
}
