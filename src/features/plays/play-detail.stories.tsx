import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { useState } from 'react';
import { PlayDetail } from './play-detail';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import { createLocalMember } from '~/local/members';
import { createLocalPlay } from '~/local/plays';

const meta: Meta<typeof PlayDetail> = {
  title: 'Features/PlayDetail',
  component: PlayDetail,
  decorators: [(Story) => <I18nProvider initialLocale="en"><Story /></I18nProvider>],
};
export default meta;

function Wrap({ playId }: { playId: string }) {
  const [del, setDel] = useState(false);
  if (del) return <p>deleted</p>;
  return <PlayDetail playId={playId} onDeleted={() => setDel(true)} />;
}

export const Populated: StoryObj = {
  loaders: [async () => {
    __resetLocalDbForTests();
    await indexedDB.deleteDatabase('gamstory');
    const g = await createLocalGame({ name: 'Catan' });
    const a = await createLocalMember({ name: 'Alice' });
    const b = await createLocalMember({ name: 'Bob' });
    const p = await createLocalPlay({
      gameRef: { kind: 'local', id: g.id },
      playedAt: Date.now(),
      participants: [
        { localMemberId: a.id, isWinner: true, order: 0, rank: 1, score: 87 },
        { localMemberId: b.id, isWinner: false, order: 1, rank: 2, score: 63 },
      ],
      description: 'Great game',
    });
    return { playId: p.id };
  }],
  render: (_args, { loaded }) => <Wrap playId={(loaded as { playId: string }).playId} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByText('Catan')).resolves.toBeInTheDocument();
    await expect(c.findByText(/Alice/)).resolves.toBeInTheDocument();
    await expect(c.findByText(/Bob/)).resolves.toBeInTheDocument();
    await expect(c.findByText('Great game')).resolves.toBeInTheDocument();
  },
};
