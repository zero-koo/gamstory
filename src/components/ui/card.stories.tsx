import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Card, CardHeader, CardContent, CardFooter } from './card';

const meta: Meta<typeof Card> = { title: 'UI/Card', component: Card };
export default meta;

export const Default: StoryObj<typeof Card> = {
  render: () => (
    <Card className="w-80">
      <CardHeader>Header</CardHeader>
      <CardContent>Body content</CardContent>
      <CardFooter>Footer</CardFooter>
    </Card>
  ),
};
