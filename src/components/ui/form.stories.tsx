import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { useForm } from 'react-hook-form';
import { Form, FormField, FormItem, FormLabel, FormMessage } from './form';
import { Input } from './input';
import { Button } from './button';

const meta: Meta = { title: 'UI/Form' };
export default meta;

type FormValues = { name: string };

function Demo() {
  const methods = useForm<FormValues>({ defaultValues: { name: '' } });
  return (
    <Form {...methods}>
      <form
        className="w-80 space-y-4"
        onSubmit={methods.handleSubmit(() => {
          /* noop */
        })}
      >
        <FormField
          control={methods.control}
          name="name"
          rules={{ required: 'Name is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <Input placeholder="Your name" {...field} />
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}

export const Default: StoryObj = {
  render: () => <Demo />,
};
