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
            const winners = p.participants
              .filter((pp) => pp.isWinner)
              .map((pp) => members.find((m) => m.id === pp.localMemberId)?.name ?? '?')
              .join(', ');
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
