import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { within, expect } from 'storybook/test';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { children: 'Click me' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  },
};

export const Outline: Story = {
  args: { children: 'Outline', variant: 'outline' },
};
