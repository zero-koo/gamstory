import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { PhotoUploader } from './photo-uploader';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';

const meta: Meta<typeof PhotoUploader> = {
  title: 'Features/PhotoUploader',
  component: PhotoUploader,
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
      return {};
    },
  ],
};
export default meta;

export const Empty: StoryObj = {
  args: { playId: 'play-empty' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const btn = await c.findByTestId('photo-uploader-button');
    expect(btn.textContent).toContain('Add photo (0/5)');
  },
};
