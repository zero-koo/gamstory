import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, X } from 'lucide-react';
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

  const showList = filtered.length > 0 || !!query.trim();

  return (
    <div role="group" aria-label={t('play.memberPicker.label')}>
      <div className="mb-2 flex flex-wrap gap-2 empty:mb-0" data-testid="member-picker-chips">
        {selectedIds.map((id) => {
          const m = members.find((mm) => mm.id === id);
          if (!m) return null;
          return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground"
              >
                {m.name}
                <button
                  type="button"
                  aria-label={t('play.memberPicker.remove')}
                  onClick={() => toggle(id)}
                  className="opacity-80 transition-opacity hover:opacity-100"
                >
                  <X className="h-3 w-3" strokeWidth={2.6} />
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
      {showList && (
        <ul
          className="mt-1.5 max-h-48 overflow-auto rounded-[10px] border border-border bg-card"
          role="listbox"
        >
          {filtered.map((m) => {
            const selected = selectedIds.includes(m.id);
            return (
              <li
                key={m.id}
                role="option"
                aria-selected={selected}
                className={
                  'flex cursor-pointer items-center justify-between border-t border-border px-3.5 py-2.5 text-sm transition-colors first:border-t-0 ' +
                  (selected ? 'bg-accent font-semibold text-accent-foreground' : 'hover:bg-muted')
                }
                onClick={() => toggle(m.id)}
                data-testid={`member-picker-option-${m.id}`}
              >
                <span>{m.name}</span>
                {selected && <Check className="h-4 w-4" strokeWidth={2.6} />}
              </li>
            );
          })}
          {filtered.length === 0 && query.trim() && (
            <li className="border-t border-border first:border-t-0">
              <Button
                variant="ghost"
                onClick={handleCreate}
                className="h-auto w-full justify-start px-3.5 py-2.5 text-sm"
                data-testid="member-picker-create"
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
                {t('play.memberPicker.create')} &quot;{query.trim()}&quot;
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
