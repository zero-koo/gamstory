import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Label } from './label';
import { Input } from './input';

const meta: Meta<typeof Label> = { title: 'UI/Label', component: Label };
export default meta;

export const Default: StoryObj<typeof Label> = {
  render: () => (
    <div className="flex flex-col gap-2 w-80">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </div>
  ),
};
