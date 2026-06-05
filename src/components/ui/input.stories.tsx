import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Input } from './input';

const meta: Meta<typeof Input> = { title: 'UI/Input', component: Input };
export default meta;

export const Default: StoryObj<typeof Input> = {
  render: () => <Input placeholder="Type here..." className="w-80" />,
};
