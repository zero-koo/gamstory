import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PlayDetail } from '~/features/plays/play-detail';
import { PhotoUploader } from '~/features/plays/photo-uploader';

export const Route = createFileRoute('/plays/$playId')({
  ssr: false,
  component: PlayDetailRoute,
});

function PlayDetailRoute() {
  const { playId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <main className="mx-auto max-w-2xl min-h-screen p-6 space-y-4">
      <PlayDetail playId={playId} onDeleted={() => navigate({ to: '/' })} />
      <PhotoUploader playId={playId} />
    </main>
  );
}
