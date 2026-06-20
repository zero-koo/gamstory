import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  addPhotoToPlay,
  listPhotosForPlay,
  removePhoto,
  MAX_PHOTOS_PER_PLAY,
  MAX_PHOTO_BYTE_SIZE,
} from '~/local/photos';
import { useI18n } from '~/lib/i18n/I18nProvider';

export interface PhotoUploaderProps {
  playId: string;
}

export function PhotoUploader({ playId }: PhotoUploaderProps) {
  const { t } = useI18n();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const photos = useLiveQuery(() => listPhotosForPlay(playId), [playId]) ?? [];

  const objectUrls = React.useMemo(() => photos.map((p) => URL.createObjectURL(p.blob)), [photos]);
  React.useEffect(() => () => { objectUrls.forEach(URL.revokeObjectURL); }, [objectUrls]);

  const atCap = photos.length >= MAX_PHOTOS_PER_PLAY;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_PHOTO_BYTE_SIZE) {
          setError(t('play.photo.tooLarge'));
          continue;
        }
        await addPhotoToPlay({ playId, blob: file, order: photos.length });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-bold">
        {t('play.form.photos')}{' '}
        <span className="font-medium text-muted-foreground">· {photos.length} / {MAX_PHOTOS_PER_PLAY}</span>
      </label>

      <div className="flex flex-wrap gap-2" data-testid="photo-uploader-grid">
        {photos.map((p, i) => (
          <div key={p.id} className="relative h-[74px] w-[74px] overflow-hidden rounded-[10px]">
            <img src={objectUrls[i]} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label={t('play.photo.remove')}
              onClick={() => removePhoto(p.id)}
              className="absolute right-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-foreground/60 text-background"
            >
              <X className="h-2.5 w-2.5" strokeWidth={3} />
            </button>
          </div>
        ))}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="photo-uploader-input"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || atCap}
          data-testid="photo-uploader-button"
          className="flex h-[74px] w-[74px] flex-col items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-input text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          {busy ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          ) : (
            <Plus className="h-5 w-5" strokeWidth={2} />
          )}
          <span className="sr-only">{t('play.photo.add', { count: photos.length, max: MAX_PHOTOS_PER_PLAY })}</span>
        </button>
      </div>

      <p className="text-[11.5px] text-muted-foreground">
        {atCap ? t('play.photo.capReached') : t('play.photo.hint')}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">{error}</p>
      )}
    </div>
  );
}
