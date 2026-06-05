import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <main data-testid="home-root" className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">gamstory</h1>
      <p>Foundation booted.</p>
    </main>
  );
}
