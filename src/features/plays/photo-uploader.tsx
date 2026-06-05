import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Trash2 } from 'lucide-react';
import {
  addPhotoToPlay,
  listPhotosForPlay,
  removePhoto,
  MAX_PHOTOS_PER_PLAY,
  MAX_PHOTO_BYTE_SIZE,
} from '~/local/photos';
import { Button } from '~/components/ui/button';
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

  const objectUrls = React.useMemo(
    () => photos.map((p) => URL.createObjectURL(p.blob)),
    [photos],
  );
  React.useEffect(
    () => () => {
      objectUrls.forEach(URL.revokeObjectURL);
    },
    [objectUrls],
  );

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
      <div className="flex flex-wrap gap-2" data-testid="photo-uploader-grid">
        {photos.map((p, i) => (
          <div
            key={p.id}
            className="relative h-24 w-24 overflow-hidden rounded-md border border-border"
          >
            <img src={objectUrls[i]} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label={t('play.photo.remove')}
              onClick={() => removePhoto(p.id)}
              className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
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
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy || photos.length >= MAX_PHOTOS_PER_PLAY}
          data-testid="photo-uploader-button"
        >
          <Camera className="h-4 w-4 mr-2" />
          {t('play.photo.add', { count: photos.length, max: MAX_PHOTOS_PER_PLAY })}
        </Button>
        {photos.length >= MAX_PHOTOS_PER_PLAY && (
          <span className="text-sm text-muted-foreground">{t('play.photo.capReached')}</span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
