import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { useState } from 'react';
import { ListView, type ListViewFilters } from './list-view';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import { createLocalMember } from '~/local/members';
import { createLocalPlay } from '~/local/plays';

const meta: Meta<typeof ListView> = {
  title: 'Features/ListView',
  component: ListView,
  decorators: [(Story) => <I18nProvider initialLocale="en"><Story /></I18nProvider>],
};
export default meta;

function Wrap() {
  const [f, setF] = useState<ListViewFilters>({});
  return <ListView filters={f} onFiltersChange={setF} />;
}

export const Empty: StoryObj = {
  loaders: [async () => { __resetLocalDbForTests(); await indexedDB.deleteDatabase('gamstory'); return {}; }],
  render: () => <Wrap />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByTestId('list-empty')).resolves.toBeInTheDocument();
  },
};

export const Populated: StoryObj = {
  loaders: [async () => {
    __resetLocalDbForTests();
    await indexedDB.deleteDatabase('gamstory');
    const g = await createLocalGame({ name: 'Catan' });
    const a = await createLocalMember({ name: 'Alice' });
    const b = await createLocalMember({ name: 'Bob' });
    await createLocalPlay({
      gameRef: { kind: 'local', id: g.id },
      playedAt: Date.now(),
      participants: [
        { localMemberId: a.id, isWinner: true, order: 0 },
        { localMemberId: b.id, isWinner: false, order: 1 },
      ],
      description: 'Close game',
    });
    return {};
  }],
  render: () => <Wrap />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByText('Catan')).resolves.toBeInTheDocument();
    await expect(c.findByText(/Alice/)).resolves.toBeInTheDocument();
  },
};
