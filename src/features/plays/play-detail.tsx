import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Pencil, Trash2, Trophy } from 'lucide-react';
import { useI18n } from '~/lib/i18n/I18nProvider';
import { getLocalPlay, deleteLocalPlay } from '~/local/plays';
import { listPhotosForPlay } from '~/local/photos';
import { listLocalMembers } from '~/local/members';
import { listLocalGames } from '~/local/games';
import { SyncBadge, ThumbPlaceholder, accentColor, syncKind } from './_visual';

export interface PlayDetailProps {
  playId: string;
  onDeleted: () => void;
}

const heroBtn =
  'flex h-[38px] w-[38px] items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-card';

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
  const ranked = [...play.participants].sort(
    (a, b) => (a.rank ?? a.order + 1) - (b.rank ?? b.order + 1),
  );

  async function handleDelete() {
    if (!confirm(t('detail.confirmDelete'))) return;
    await deleteLocalPlay(playId);
    onDeleted();
  }

  return (
    <div data-testid="play-detail" className="overflow-hidden rounded-lg bg-card shadow-sm">
      {/* hero */}
      <div className="relative h-[230px]">
        {photos.length > 0 ? (
          <img src={objectUrls[0]} alt="" className="h-full w-full object-cover" />
        ) : (
          <ThumbPlaceholder seed={play.id} className="h-full w-full" />
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <Link to="/" aria-label={t('common.back')} className={heroBtn}>
            <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
          </Link>
          <div className="flex gap-2">
            <Link
              to="/plays/$playId/edit"
              params={{ playId }}
              aria-label={t('common.edit')}
              data-testid="play-detail-edit"
              className={heroBtn}
            >
              <Pencil className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              aria-label={t('common.delete')}
              data-testid="play-detail-delete"
              className={heroBtn}
            >
              <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          </div>
        </div>
        {photos.length > 1 && (
          <span className="absolute bottom-3 right-3.5 rounded-full bg-foreground/60 px-2.5 py-1 text-xs font-semibold text-background">
            1 / {photos.length}
          </span>
        )}
      </div>

      <div className="p-[18px]">
        {/* title + sync */}
        <div className="mb-1 flex items-start justify-between gap-2.5">
          <h1 className="text-2xl font-extrabold tracking-tight">{game}</h1>
          <SyncBadge kind={syncKind(play)} className="mt-1" />
        </div>
        <p className="mb-[18px] text-sm text-muted-foreground">
          {dateFmt.format(new Date(play.playedAt))} · {t('list.participants', { count: play.participants.length })}
        </p>

        {/* result table */}
        <div className="mb-[18px] overflow-hidden rounded-[14px] border border-border">
          {ranked.map((p, i) => {
            const name = members.find((m) => m.id === p.localMemberId)?.name ?? '?';
            return (
              <div
                key={p.localMemberId}
                className={
                  'flex items-center gap-2.5 px-3.5 py-3 ' +
                  (i > 0 ? 'border-t border-border ' : '') +
                  (p.isWinner ? 'bg-mustard/12' : '')
                }
              >
                <span
                  className={
                    'flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[13px] font-extrabold ' +
                    (p.isWinner ? 'bg-mustard text-white' : 'bg-muted text-muted-foreground')
                  }
                >
                  {p.rank ?? i + 1}
                </span>
                <span className="flex flex-1 items-center gap-1.5 text-[15px] font-semibold">
                  {name}
                  {p.isWinner && <Trophy className="h-3.5 w-3.5 text-mustard" strokeWidth={2.2} />}
                </span>
                {p.score !== undefined && (
                  <span className="text-[15px] font-bold tabular-nums text-secondary-foreground">{p.score}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* memo */}
        {play.description && (
          <div className="mb-5 whitespace-pre-wrap rounded-[12px] bg-muted p-3.5 text-[14.5px] leading-relaxed">
            {play.description}
          </div>
        )}

        {/* photo strip */}
        {photos.length > 0 && (
          <section data-testid="play-detail-photos">
            <h2 className="mb-2 text-[13px] font-bold">{t('detail.photos')}</h2>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <img
                  key={p.id}
                  src={objectUrls[i]}
                  alt=""
                  className="h-20 w-20 rounded-[10px] object-cover"
                  style={{ background: accentColor(p.id) }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
