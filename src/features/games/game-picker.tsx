import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search } from 'lucide-react';
import { listLocalGames, createLocalGame } from '~/local/games';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/lib/i18n/I18nProvider';
import type { GameRef } from '~/local/db/schema';

export interface GamePickerProps {
  value: GameRef | null;
  onChange: (next: GameRef) => void;
  className?: string;
}

export function GamePicker({ value, onChange, className }: GamePickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const games = useLiveQuery(() => listLocalGames(), []) ?? [];

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => g.name.toLowerCase().includes(q));
  }, [games, query]);

  const selectedName = React.useMemo(() => {
    if (!value) return null;
    if (value.kind === 'local') return games.find((g) => g.id === value.id)?.name ?? null;
    return null;
  }, [value, games]);

  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    const g = await createLocalGame({ name });
    onChange({ kind: 'local', id: g.id });
    setQuery('');
  }

  const showList = filtered.length > 0 || !!query.trim();

  return (
    <div className={className} role="combobox" aria-label={t('play.gamePicker.label')} aria-expanded>
      <div className="flex items-center gap-2.5 rounded-md border border-input bg-card px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30">
        <Search className="h-4 w-4 flex-none text-muted-foreground" strokeWidth={2.2} />
        <input
          value={selectedName ?? query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('play.gamePicker.placeholder')}
          data-testid="game-picker-input"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </div>
      {showList && (
        <ul
          className="mt-1.5 max-h-48 overflow-auto rounded-[10px] border border-border bg-card"
          role="listbox"
        >
          {filtered.map((g) => {
            const selected = value?.kind === 'local' && value.id === g.id;
            return (
              <li
                key={g.id}
                role="option"
                aria-selected={selected}
                className={
                  'cursor-pointer border-t border-border px-3.5 py-2.5 text-sm transition-colors first:border-t-0 ' +
                  (selected ? 'bg-accent font-semibold text-accent-foreground' : 'hover:bg-muted')
                }
                onClick={() => onChange({ kind: 'local', id: g.id })}
                data-testid={`game-picker-option-${g.id}`}
              >
                {g.name}
              </li>
            );
          })}
          {filtered.length === 0 && query.trim() && (
            <li className="border-t border-border first:border-t-0">
              <Button
                variant="ghost"
                onClick={handleCreate}
                className="h-auto w-full justify-start px-3.5 py-2.5 text-sm"
                data-testid="game-picker-create"
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
                {t('play.gamePicker.create')} &quot;{query.trim()}&quot;
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
