import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { PlayForm } from './play-form';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import { createLocalMember } from '~/local/members';

const meta: Meta<typeof PlayForm> = {
  title: 'Features/PlayForm',
  component: PlayForm,
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
      await createLocalMember({ name: 'Alice' });
      await createLocalMember({ name: 'Bob' });
      return {};
    },
  ],
};
export default meta;

export const Default: StoryObj<typeof PlayForm> = {
  args: { onSubmit: async () => {} },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByTestId('play-form-date')).resolves.toBeInTheDocument();
    await expect(c.findByTestId('play-form-description')).resolves.toBeInTheDocument();
    await expect(c.findByTestId('play-form-submit')).resolves.toBeInTheDocument();
  },
};
