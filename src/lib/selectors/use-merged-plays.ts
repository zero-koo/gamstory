import { useLiveQuery } from 'dexie-react-hooks';
import { listLocalPlays } from '~/local/plays';
import type { LocalPlay } from '~/local/db/schema';

export type MergedPlay = LocalPlay & { mergedId: string };

export function useMergedPlays(): MergedPlay[] {
  const local = useLiveQuery(() => listLocalPlays(), []) ?? [];
  return local.map((p) => ({ ...p, mergedId: p.remote?.playId ?? p.id }));
}
