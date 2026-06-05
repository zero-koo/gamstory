import { ulid } from 'ulid';
import { getLocalDb } from './db/client';
import type { LocalPhoto } from './db/schema';
import { processImage, sniffMime } from '~/workers/photo-processor';

export const MAX_PHOTOS_PER_PLAY = 5;
export const MAX_PHOTO_BYTE_SIZE = 5 * 1024 * 1024;

export interface AddPhotoInput {
  playId: string;
  blob: Blob;
  order: number;
}

export async function addPhotoToPlay(input: AddPhotoInput): Promise<LocalPhoto> {
  // Size check first — keeps the error message specific even when the input
  // would otherwise also fail magic-byte sniffing.
  if (input.blob.size > MAX_PHOTO_BYTE_SIZE) {
    throw new Error(`Photo exceeds 5MB size cap (${input.blob.size} bytes)`);
  }
  // Magic-byte sniff (throws for HEIC, returns null for unknown)
  const detected = await sniffMime(input.blob);
  if (!detected) throw new Error('Unsupported image format');

  const db = getLocalDb();
  const existing = await db.localPhotos.where({ playId: input.playId }).count();
  if (existing >= MAX_PHOTOS_PER_PLAY) {
    throw new Error(`At most ${MAX_PHOTOS_PER_PLAY} photos per play`);
  }

  const processed = await processImage(input.blob);

  const row: LocalPhoto = {
    id: ulid(),
    playId: input.playId,
    blob: processed.blob,
    order: input.order,
    mimeType: processed.mimeType,
    byteSize: processed.byteSize,
    width: processed.width,
    height: processed.height,
    createdAt: Date.now(),
  };
  await db.localPhotos.add(row);
  return row;
}

export async function listPhotosForPlay(playId: string): Promise<LocalPhoto[]> {
  return getLocalDb().localPhotos.where({ playId }).sortBy('order');
}

export async function removePhoto(id: string): Promise<void> {
  await getLocalDb().localPhotos.delete(id);
}

export async function removeAllPhotosForPlay(playId: string): Promise<void> {
  const db = getLocalDb();
  const ids = await db.localPhotos.where({ playId }).primaryKeys();
  await db.localPhotos.bulkDelete(ids);
}
