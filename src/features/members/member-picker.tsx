import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X } from 'lucide-react';
import { listLocalMembers, createLocalMember } from '~/local/members';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/lib/i18n/I18nProvider';

export interface MemberPickerProps {
  selectedIds: string[];
  onChange: (next: string[]) => void;
}

export function MemberPicker({ selectedIds, onChange }: MemberPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const members = useLiveQuery(() => listLocalMembers(), []) ?? [];

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members;
  }, [members, query]);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }
  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    const m = await createLocalMember({ name });
    onChange([...selectedIds, m.id]);
    setQuery('');
  }

  return (
    <div role="group" aria-label={t('play.memberPicker.label')}>
      <div className="flex flex-wrap gap-1 mb-2" data-testid="member-picker-chips">
        {selectedIds.map((id) => {
          const m = members.find((mm) => mm.id === id);
          if (!m) return null;
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm">
              {m.name}
              <button
                type="button"
                aria-label={t('play.memberPicker.remove')}
                onClick={() => toggle(id)}
                className="opacity-60 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('play.memberPicker.placeholder')}
        data-testid="member-picker-input"
      />
      <ul className="mt-1 max-h-48 overflow-auto rounded-md border border-border" role="listbox">
        {filtered.map((m) => (
          <li
            key={m.id}
            role="option"
            aria-selected={selectedIds.includes(m.id)}
            className="cursor-pointer px-3 py-2 hover:bg-muted flex items-center justify-between"
            onClick={() => toggle(m.id)}
            data-testid={`member-picker-option-${m.id}`}
          >
            <span>{m.name}</span>
            {selectedIds.includes(m.id) && <span aria-hidden>✓</span>}
          </li>
        ))}
        {filtered.length === 0 && query.trim() && (
          <li className="px-3 py-2">
            <Button variant="ghost" onClick={handleCreate} className="w-full justify-start" data-testid="member-picker-create">
              <Plus className="h-4 w-4 mr-2" />
              {t('play.memberPicker.create')} &quot;{query.trim()}&quot;
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}
