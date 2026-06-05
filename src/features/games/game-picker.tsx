import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { listLocalGames, createLocalGame } from '~/local/games';
import { Input } from '~/components/ui/input';
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

  return (
    <div className={className} role="combobox" aria-label={t('play.gamePicker.label')} aria-expanded>
      <Input
        value={selectedName ?? query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('play.gamePicker.placeholder')}
        data-testid="game-picker-input"
      />
      <ul className="mt-1 max-h-48 overflow-auto rounded-md border border-border" role="listbox">
        {filtered.map((g) => (
          <li
            key={g.id}
            role="option"
            aria-selected={value?.kind === 'local' && value.id === g.id}
            className="cursor-pointer px-3 py-2 hover:bg-muted"
            onClick={() => onChange({ kind: 'local', id: g.id })}
            data-testid={`game-picker-option-${g.id}`}
          >
            {g.name}
          </li>
        ))}
        {filtered.length === 0 && query.trim() && (
          <li className="px-3 py-2">
            <Button variant="ghost" onClick={handleCreate} className="w-full justify-start" data-testid="game-picker-create">
              <Plus className="h-4 w-4 mr-2" />
              {t('play.gamePicker.create')} &quot;{query.trim()}&quot;
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}
