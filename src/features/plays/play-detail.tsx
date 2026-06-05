import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Card, CardContent, CardHeader, CardFooter } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { useI18n } from '~/lib/i18n/I18nProvider';
import { getLocalPlay, deleteLocalPlay } from '~/local/plays';
import { listPhotosForPlay } from '~/local/photos';
import { listLocalMembers } from '~/local/members';
import { listLocalGames } from '~/local/games';

export interface PlayDetailProps {
  playId: string;
  onDeleted: () => void;
}

export function PlayDetail({ playId, onDeleted }: PlayDetailProps) {
  const { t, locale } = useI18n();
  const play = useLiveQuery(() => getLocalPlay(playId), [playId]);
  const photos = useLiveQuery(() => listPhotosForPlay(playId), [playId]) ?? [];
  const members = useLiveQuery(() => listLocalMembers(), []) ?? [];
  const games = useLiveQuery(() => listLocalGames(), []) ?? [];

  const objectUrls = React.useMemo(() => photos.map((p) => URL.createObjectURL(p.blob)), [photos]);
  React.useEffect(() => () => { objectUrls.forEach(URL.revokeObjectURL); }, [objectUrls]);

  if (!play) return <p data-testid="play-detail-loading">{t('detail.loading')}</p>;

  const game = games.find((g) => g.id === play.gameRef.id)?.name ?? t('list.unknownGame');
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });

  async function handleDelete() {
    if (!confirm(t('detail.confirmDelete'))) return;
    await deleteLocalPlay(playId);
    onDeleted();
  }

  return (
    <Card data-testid="play-detail">
      <CardHeader className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{game}</h1>
          <p className="text-sm text-muted-foreground">{dateFmt.format(new Date(play.playedAt))}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/plays/$playId/edit" params={{ playId }}>
            <Button variant="outline" data-testid="play-detail-edit">{t('common.edit')}</Button>
          </Link>
          <Button variant="ghost" onClick={handleDelete} data-testid="play-detail-delete">{t('common.delete')}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <section>
          <h2 className="font-medium">{t('detail.participants')}</h2>
          <ul className="space-y-0.5">
            {play.participants.map((p) => {
              const name = members.find((m) => m.id === p.localMemberId)?.name ?? '?';
              return (
                <li key={p.localMemberId} className="text-sm">
                  {p.isWinner && '🏆 '}
                  {name}
                  {p.rank !== undefined && ` · #${p.rank}`}
                  {p.score !== undefined && ` · ${p.score}`}
                </li>
              );
            })}
          </ul>
        </section>

        {play.description && (
          <section>
            <h2 className="font-medium">{t('detail.notes')}</h2>
            <p className="text-sm whitespace-pre-wrap">{play.description}</p>
          </section>
        )}

        {photos.length > 0 && (
          <section data-testid="play-detail-photos">
            <h2 className="font-medium">{t('detail.photos')}</h2>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <img key={p.id} src={objectUrls[i]} alt="" className="h-24 w-24 rounded-md object-cover" />
              ))}
            </div>
          </section>
        )}
      </CardContent>
      <CardFooter>
        <Link to="/"><Button variant="ghost">{t('common.back')}</Button></Link>
      </CardFooter>
    </Card>
  );
}
