import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PlayForm } from '~/features/plays/play-form';
import { createLocalPlay } from '~/local/plays';

export const Route = createFileRoute('/plays/new')({
  ssr: false,
  component: NewPlayRoute,
});

function NewPlayRoute() {
  const navigate = useNavigate();
  return (
    <main className="mx-auto max-w-xl p-6">
      <PlayForm
        onSubmit={async (input) => {
          const p = await createLocalPlay(input);
          // Detail route lands in Task 13; until then navigate as a literal path.
          await navigate({ to: '/plays/' + p.id });
        }}
        onCancel={() => navigate({ to: '/' })}
      />
    </main>
  );
}
