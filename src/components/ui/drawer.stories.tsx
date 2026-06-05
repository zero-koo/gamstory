import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from './drawer';
import { Button } from './button';

const meta: Meta<typeof Drawer> = { title: 'UI/Drawer', component: Drawer };
export default meta;

export const Default: StoryObj<typeof Drawer> = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button>Open drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Drawer title</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4">Body content</div>
      </DrawerContent>
    </Drawer>
  ),
};

export const Open: StoryObj<typeof Drawer> = {
  render: () => (
    <Drawer defaultOpen>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Already open</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4">Body content</div>
      </DrawerContent>
    </Drawer>
  ),
};
