import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, userEvent, expect } from 'storybook/test';
import { useState } from 'react';
import { GamePicker } from './game-picker';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import type { GameRef } from '~/local/db/schema';

const meta: Meta<typeof GamePicker> = {
  title: 'Features/GamePicker',
  component: GamePicker,
  decorators: [
    (Story) => (
      <I18nProvider initialLocale="en">
        <Story />
      </I18nProvider>
    ),
  ],
  loaders: [
    async () => {
      __resetLocalDbForTests();
      await indexedDB.deleteDatabase('gamstory');
      await createLocalGame({ name: 'Catan' });
      await createLocalGame({ name: 'Wingspan' });
      return {};
    },
  ],
};
export default meta;

type Wrapper = { initial?: GameRef | null };
function Wrap({ initial = null }: Wrapper) {
  const [v, setV] = useState<GameRef | null>(initial);
  return <GamePicker value={v} onChange={setV} />;
}

export const Default: StoryObj = {
  render: () => <Wrap />,
  play: async ({ canvasElement, step }) => {
    const c = within(canvasElement);
    await step('shows the seeded games', async () => {
      await expect(c.findByText('Catan')).resolves.toBeInTheDocument();
      await expect(c.findByText('Wingspan')).resolves.toBeInTheDocument();
    });
    await step('typing narrows results', async () => {
      await userEvent.type(c.getByTestId('game-picker-input'), 'cat');
      await expect(c.queryByText('Wingspan')).not.toBeInTheDocument();
    });
  },
};

export const CreateNewWhenNoMatch: StoryObj = {
  render: () => <Wrap />,
  play: async ({ canvasElement, step }) => {
    const c = within(canvasElement);
    await step('typing an unknown name surfaces the create button', async () => {
      await userEvent.type(c.getByTestId('game-picker-input'), 'Splendor');
      await expect(c.findByTestId('game-picker-create')).resolves.toBeInTheDocument();
    });
  },
};
