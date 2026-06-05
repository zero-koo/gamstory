import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { useState } from 'react';
import { CalendarView } from './calendar-view';
import { I18nProvider } from '~/lib/i18n/I18nProvider';
import { __resetLocalDbForTests } from '~/local/db/client';
import { createLocalGame } from '~/local/games';
import { createLocalMember } from '~/local/members';
import { createLocalPlay } from '~/local/plays';

const meta: Meta<typeof CalendarView> = {
  title: 'Features/CalendarView',
  component: CalendarView,
  decorators: [(Story) => <I18nProvider initialLocale="en"><Story /></I18nProvider>],
};
export default meta;

function Wrap({ y, m }: { y: number; m: number }) {
  const [ym, setYm] = useState({ y, m });
  return <CalendarView year={ym.y} month={ym.m} onMonthChange={(yy, mm) => setYm({ y: yy, m: mm })} />;
}

export const WithTwoPlays: StoryObj = {
  loaders: [async () => {
    __resetLocalDbForTests();
    await indexedDB.deleteDatabase('gamstory');
    const g = await createLocalGame({ name: 'Catan' });
    const m = await createLocalMember({ name: 'Alice' });
    const today = new Date();
    const fixedDay = new Date(today.getFullYear(), today.getMonth(), 4).getTime();
    await createLocalPlay({ gameRef: { kind: 'local', id: g.id }, playedAt: fixedDay, participants: [{ localMemberId: m.id, isWinner: true, order: 0 }] });
    await createLocalPlay({ gameRef: { kind: 'local', id: g.id }, playedAt: fixedDay, participants: [{ localMemberId: m.id, isWinner: true, order: 0 }] });
    return {};
  }],
  render: () => {
    const today = new Date();
    return <Wrap y={today.getFullYear()} m={today.getMonth() + 1} />;
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.findByTestId('calendar-day-4-badge')).resolves.toHaveTextContent('2');
  },
};
