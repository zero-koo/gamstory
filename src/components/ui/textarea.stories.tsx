import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Textarea } from './textarea';

const meta: Meta<typeof Textarea> = { title: 'UI/Textarea', component: Textarea };
export default meta;

export const Default: StoryObj<typeof Textarea> = {
  render: () => <Textarea placeholder="Write something..." className="w-80" />,
};
