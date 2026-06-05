import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { PlayForm } from '~/features/plays/play-form';
import { getLocalPlay, updateLocalPlay } from '~/local/plays';

export const Route = createFileRoute('/plays/$playId/edit')({
  ssr: false,
  component: EditPlayRoute,
});

function EditPlayRoute() {
  const { playId } = Route.useParams();
  const navigate = useNavigate();
  const play = useLiveQuery(() => getLocalPlay(playId), [playId]);
  if (!play) return null;

  return (
    <main className="mx-auto max-w-xl p-6">
      <PlayForm
        initial={{
          playedAt: new Date(play.playedAt).toISOString().slice(0, 10),
          description: play.description,
          gameRef: play.gameRef,
          memberIds: play.participants.map((p) => p.localMemberId),
          winnerIds: play.participants.filter((p) => p.isWinner).map((p) => p.localMemberId),
        }}
        onSubmit={async (input) => {
          await updateLocalPlay(playId, input);
          // Detail route lands in Task 13; until then navigate as a literal path.
          await navigate({ to: '/plays/' + playId });
        }}
        onCancel={() => navigate({ to: '/plays/' + playId })}
      />
    </main>
  );
}
