import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Button } from '~/components/ui/button';
import { GamePicker } from '~/features/games/game-picker';
import { MemberPicker } from '~/features/members/member-picker';
import { useI18n } from '~/lib/i18n/I18nProvider';
import type { GameRef, LocalPlayParticipant } from '~/local/db/schema';

const FormSchema = z.object({
  playedAt: z.string().min(1),
  description: z.string().max(2000).optional(),
  gameRef: z.object({ kind: z.enum(['global', 'local']), id: z.string() }),
  memberIds: z.array(z.string()).min(1),
  winnerIds: z.array(z.string()).min(1),
});

export type PlayFormValues = z.infer<typeof FormSchema>;

export interface PlayFormProps {
  initial?: Partial<PlayFormValues>;
  onSubmit: (input: {
    gameRef: GameRef;
    playedAt: number;
    participants: LocalPlayParticipant[];
    description?: string;
  }) => Promise<void>;
  onCancel?: () => void;
}

function todayLocalIsoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function PlayForm({ initial, onSubmit, onCancel }: PlayFormProps) {
  const { t } = useI18n();
  const form = useForm<PlayFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      playedAt: initial?.playedAt ?? todayLocalIsoDate(),
      description: initial?.description ?? '',
      gameRef: initial?.gameRef ?? { kind: 'local', id: '' },
      memberIds: initial?.memberIds ?? [],
      winnerIds: initial?.winnerIds ?? [],
    },
  });

  async function handleSubmit(values: PlayFormValues) {
    const participants: LocalPlayParticipant[] = values.memberIds.map((id, idx) => ({
      localMemberId: id,
      isWinner: values.winnerIds.includes(id),
      order: idx,
    }));
    await onSubmit({
      gameRef: values.gameRef,
      playedAt: new Date(values.playedAt).getTime(),
      participants,
      description: values.description?.trim() || undefined,
    });
  }

  const memberIds = form.watch('memberIds');
  const winnerIds = form.watch('winnerIds');

  function toggleWinner(id: string) {
    const next = winnerIds.includes(id) ? winnerIds.filter((x) => x !== id) : [...winnerIds, id];
    form.setValue('winnerIds', next, { shouldDirty: true });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="playedAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('play.form.playedAt')}</FormLabel>
              <Input type="date" {...field} data-testid="play-form-date" />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="gameRef"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('play.form.game')}</FormLabel>
              <GamePicker value={field.value.id ? field.value : null} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="memberIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('play.form.members')}</FormLabel>
              <MemberPicker selectedIds={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />

        {memberIds.length > 0 && (
          <FormItem>
            <FormLabel>{t('play.form.winners')}</FormLabel>
            <ul className="space-y-1" data-testid="play-form-winner-list">
              {memberIds.map((id) => (
                <li key={id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`winner-${id}`}
                    checked={winnerIds.includes(id)}
                    onChange={() => toggleWinner(id)}
                    data-testid={`play-form-winner-${id}`}
                  />
                  <label htmlFor={`winner-${id}`} className="text-sm">
                    {id}
                  </label>
                </li>
              ))}
            </ul>
          </FormItem>
        )}

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('play.form.description')}</FormLabel>
              <Textarea rows={3} {...field} data-testid="play-form-description" />
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting} data-testid="play-form-submit">
            {t('common.save')}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} data-testid="play-form-cancel">
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
