import * as React from 'react';
import { Check, Smartphone, AlertTriangle, Trophy } from 'lucide-react';
import { cn } from '~/lib/utils';
import { useI18n } from '~/lib/i18n/I18nProvider';
import type { MergedPlay } from '~/lib/selectors/use-merged-plays';

/** Deterministic warm placeholder colour for a play/game thumbnail. */
const ACCENTS = ['#C9885C', '#8FA37E', '#B98A86', '#6E8B62', '#E0A53B', '#A98AB0'];
export function accentColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length]!;
}

/** Diagonal-stripe placeholder block used when a play has no photo. */
export function ThumbPlaceholder({
  seed,
  className,
  children,
}: {
  seed: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn('relative flex-none overflow-hidden', className)}
      style={{ background: accentColor(seed) }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(45deg,rgba(255,255,255,.10) 0 8px,transparent 8px 16px)',
        }}
      />
      {children}
    </div>
  );
}

export type SyncKind = 'local' | 'uploading' | 'shared' | 'failed';
export function syncKind(p: Pick<MergedPlay, 'syncState' | 'remote'>): SyncKind {
  if (p.syncState === 'uploaded' || p.remote) return 'shared';
  if (p.syncState === 'uploading') return 'uploading';
  if (p.syncState === 'failed') return 'failed';
  return 'local';
}

export function SyncBadge({ kind, className }: { kind: SyncKind; className?: string }) {
  const { t } = useI18n();
  const base =
    'inline-flex flex-none items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold';
  if (kind === 'shared')
    return (
      <span className={cn(base, 'bg-success/15 text-success', className)}>
        <Check className="h-3 w-3" strokeWidth={2.6} />
        {t('sync.shared')}
      </span>
    );
  if (kind === 'uploading')
    return (
      <span className={cn(base, 'bg-warning/15 text-warning', className)}>
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-warning border-t-transparent" />
        {t('sync.uploading')}
      </span>
    );
  if (kind === 'failed')
    return (
      <span className={cn(base, 'bg-danger/10 text-danger', className)}>
        <AlertTriangle className="h-3 w-3" strokeWidth={2.2} />
        {t('sync.failed')}
      </span>
    );
  return (
    <span className={cn(base, 'bg-muted text-muted-foreground', className)}>
      <Smartphone className="h-3 w-3" strokeWidth={2.2} />
      {t('sync.local')}
    </span>
  );
}

/** "승 {name}" pill with a mustard trophy. */
export function WinnerBadge({ name }: { name: string }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-mustard/15 px-2 py-1 text-xs font-bold text-mustard">
      <Trophy className="h-3.5 w-3.5" strokeWidth={2.2} />
      {t('list.winnerBadge', { name })}
    </span>
  );
}
