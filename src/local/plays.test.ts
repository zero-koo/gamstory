import { describe, it, expect } from 'vitest';
import {
  createLocalPlay,
  getLocalPlay,
  listLocalPlays,
  updateLocalPlay,
  deleteLocalPlay,
  listPlaysOnDate,
} from './plays';

const baseInput = () => ({
  gameRef: { kind: 'local' as const, id: 'g1' },
  playedAt: new Date('2026-06-04').getTime(),
  participants: [
    { localMemberId: 'm1', isWinner: true, order: 0, rank: 1, score: 87 },
    { localMemberId: 'm2', isWinner: false, order: 1, rank: 2, score: 63 },
  ],
});

describe('local plays', () => {
  it('creates a play with all fields populated', async () => {
    const p = await createLocalPlay({ ...baseInput(), description: 'good game' });
    expect(p.syncState).toBe('local');
    expect(p.idempotencyKey).toMatch(/^[0-9a-f]{8}-/);
    expect(p.participants).toHaveLength(2);
    expect(p.gameRef).toEqual({ kind: 'local', id: 'g1' });
    expect(p.photoIds).toEqual([]);
    expect(typeof p.createdAt).toBe('number');
    expect(p.createdAt).toBe(p.updatedAt);
  });

  it('lists plays newest playedAt first', async () => {
    await createLocalPlay({ ...baseInput(), playedAt: new Date('2026-06-01').getTime() });
    await createLocalPlay({ ...baseInput(), playedAt: new Date('2026-06-03').getTime() });
    await createLocalPlay({ ...baseInput(), playedAt: new Date('2026-06-02').getTime() });
    const rows = await listLocalPlays();
    expect(rows.map((r) => new Date(r.playedAt).getUTCDate())).toEqual([3, 2, 1]);
  });

  it('lists plays on a specific date (local timezone day buckets)', async () => {
    const day = new Date('2026-06-04T12:00:00Z').getTime();
    await createLocalPlay({ ...baseInput(), playedAt: day });
    await createLocalPlay({ ...baseInput(), playedAt: day + 86_400_000 }); // +1d
    const rows = await listPlaysOnDate(new Date('2026-06-04'));
    expect(rows).toHaveLength(1);
  });

  it('updates a play and bumps updatedAt', async () => {
    const p = await createLocalPlay(baseInput());
    await new Promise((r) => setTimeout(r, 2));
    await updateLocalPlay(p.id, { description: 'edited' });
    const after = await getLocalPlay(p.id);
    expect(after?.description).toBe('edited');
    expect(after!.updatedAt).toBeGreaterThan(p.updatedAt);
  });

  it('deletes a play and cascades photo cleanup', async () => {
    const { listPhotosForPlay } = await import('./photos');
    const tiny = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])], { type: 'image/jpeg' });
    const p = await createLocalPlay(baseInput());
    // Note: tiny blob below is for the cascade test only — we mock-add a row by direct write
    // because processImage would reject this 5-byte stub. See the test fixture in step 4 of Task 4
    // for a real JPEG. For this cascade test, we directly add a row to localPhotos:
    const { getLocalDb } = await import('./db/client');
    await getLocalDb().localPhotos.add({
      id: 'fake-photo-1', playId: p.id, blob: tiny, order: 0,
      mimeType: 'image/jpeg', byteSize: 5, createdAt: Date.now(),
    });
    expect((await listPhotosForPlay(p.id)).length).toBe(1);
    await deleteLocalPlay(p.id);
    expect(await getLocalPlay(p.id)).toBeUndefined();
    expect((await listPhotosForPlay(p.id)).length).toBe(0);
  });

  it('rejects a play with zero participants', async () => {
    await expect(
      createLocalPlay({ ...baseInput(), participants: [] }),
    ).rejects.toThrow(/participant/i);
  });

  it('rejects when participant ranks are not contiguous from 1', async () => {
    const bad = baseInput();
    bad.participants[1]!.rank = 5; // gap
    await expect(createLocalPlay(bad)).rejects.toThrow(/rank/i);
  });
});
