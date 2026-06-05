import type { Meta, StoryObj } from '@storybook/tanstack-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Button } from './button';

const meta: Meta<typeof Dialog> = { title: 'UI/Dialog', component: Dialog };
export default meta;

export const Default: StoryObj<typeof Dialog> = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description text goes here.</DialogDescription>
        </DialogHeader>
        <p>Body content</p>
      </DialogContent>
    </Dialog>
  ),
};

export const Open: StoryObj<typeof Dialog> = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Already open</DialogTitle>
          <DialogDescription>This dialog renders open by default.</DialogDescription>
        </DialogHeader>
        <p>Body content</p>
      </DialogContent>
    </Dialog>
  ),
};
