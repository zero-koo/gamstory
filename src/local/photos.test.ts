import { describe, it, expect, vi } from 'vitest';

// Mock `~/workers/photo-processor` so the CRUD tests stay independent of the
// browser canvas pipeline (createImageBitmap + OffscreenCanvas), which
// happy-dom does not implement. The pipeline itself is covered by
// `photo-processor.test.ts`. We keep the real `sniffMime` (pure byte sniff)
// and stub `processImage` to round-trip the input blob.
vi.mock('~/workers/photo-processor', async () => {
  const actual =
    await vi.importActual<typeof import('~/workers/photo-processor')>(
      '~/workers/photo-processor',
    );
  return {
    ...actual,
    processImage: vi.fn(async (blob: Blob) => ({
      blob,
      mimeType: 'image/jpeg' as const,
      width: 1,
      height: 1,
      byteSize: blob.size,
    })),
  };
});

import { addPhotoToPlay, listPhotosForPlay, removePhoto } from './photos';

function tinyJpegBlob(): Blob {
  const hex =
    'ffd8ffe000104a46494600010101006000600000' +
    'ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e' +
    '1d1a1c1c2024362c20272a2c2b2c2c1d2f31302e3134333133' +
    'ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000' +
    '0000000001020304050607080910111213141516171819ffc4001f01000301010101010101' +
    '01010100000000000001020304050607080910111213141516171819ffda000c0301000211' +
    '0311003f00fbd3ffd9';
  const bytes = Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return new Blob([bytes], { type: 'image/jpeg' });
}

describe('local photos', () => {
  it('adds a processed photo to a play', async () => {
    const photo = await addPhotoToPlay({
      playId: 'play-1',
      blob: tinyJpegBlob(),
      order: 0,
    });
    expect(photo.playId).toBe('play-1');
    expect(photo.order).toBe(0);
    expect(['image/jpeg', 'image/png']).toContain(photo.mimeType);
    expect(photo.byteSize).toBeGreaterThan(0);
  });

  it('lists photos ordered by `order`', async () => {
    await addPhotoToPlay({ playId: 'p', blob: tinyJpegBlob(), order: 1 });
    await addPhotoToPlay({ playId: 'p', blob: tinyJpegBlob(), order: 0 });
    const rows = await listPhotosForPlay('p');
    expect(rows.map((r) => r.order)).toEqual([0, 1]);
  });

  it('enforces 5-image cap per play', async () => {
    for (let i = 0; i < 5; i++) {
      await addPhotoToPlay({ playId: 'cap', blob: tinyJpegBlob(), order: i });
    }
    await expect(
      addPhotoToPlay({ playId: 'cap', blob: tinyJpegBlob(), order: 5 }),
    ).rejects.toThrow(/5/);
  });

  it('rejects oversize blobs', async () => {
    const oversized = new Blob([new Uint8Array(5_242_881)], { type: 'image/jpeg' });
    await expect(
      addPhotoToPlay({ playId: 'big', blob: oversized, order: 0 }),
    ).rejects.toThrow(/5 ?MB|size/i);
  });

  it('removes a photo', async () => {
    const p = await addPhotoToPlay({ playId: 'r', blob: tinyJpegBlob(), order: 0 });
    await removePhoto(p.id);
    expect(await listPhotosForPlay('r')).toEqual([]);
  });
});
