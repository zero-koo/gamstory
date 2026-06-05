import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, userEvent, expect } from 'storybook/test';
import { useState } from 'react';
import { MemberPicker } from './member-picker';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalMember } from '~/local/members';

const meta: Meta<typeof MemberPicker> = {
  title: 'Features/MemberPicker',
  component: MemberPicker,
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
      await createLocalMember({ name: 'Alice' });
      await createLocalMember({ name: 'Bob' });
      return {};
    },
  ],
};
export default meta;

function Wrap() {
  const [sel, setSel] = useState<string[]>([]);
  return <MemberPicker selectedIds={sel} onChange={setSel} />;
}

export const Default: StoryObj = {
  render: () => <Wrap />,
  play: async ({ canvasElement, step }) => {
    const c = within(canvasElement);
    await step('seeded members are listed', async () => {
      await expect(c.findByText('Alice')).resolves.toBeInTheDocument();
      await expect(c.findByText('Bob')).resolves.toBeInTheDocument();
    });
    await step('selecting Alice produces a chip', async () => {
      await userEvent.click(c.getByText('Alice'));
      const chips = c.getByTestId('member-picker-chips');
      await expect(within(chips).findByText('Alice')).resolves.toBeInTheDocument();
    });
  },
};
