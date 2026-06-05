import * as React from 'react';
import { Controller, ControllerProps, FieldPath, FieldValues, FormProvider, useFormContext } from 'react-hook-form';
import { Label } from './label';
import { cn } from '~/lib/utils';

export const Form = FormProvider;

const FormFieldContext = React.createContext<{ name: string } | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

export function useFormField() {
  const ctx = React.useContext(FormFieldContext);
  if (!ctx) throw new Error('useFormField must be used inside FormField');
  const { getFieldState, formState } = useFormContext();
  const state = getFieldState(ctx.name, formState);
  return { ...state, name: ctx.name };
}

export const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('space-y-2', className)} {...props} />,
);
FormItem.displayName = 'FormItem';

export const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => {
  const { error } = useFormField();
  return <Label ref={ref} className={cn(error && 'text-red-600', className)} {...props} />;
});
FormLabel.displayName = 'FormLabel';

export const FormMessage = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    const { error } = useFormField();
    const body = error ? String(error.message ?? '') : children;
    if (!body) return null;
    return <p ref={ref} className={cn('text-sm text-red-600', className)} {...props}>{body}</p>;
  },
);
FormMessage.displayName = 'FormMessage';
