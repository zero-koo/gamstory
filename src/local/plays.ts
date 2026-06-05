import { v4 as uuidv4 } from 'uuid';
import { ulid } from 'ulid';
import { getLocalDb } from './db/client';
import type { LocalPlay, LocalPlayParticipant, GameRef } from './db/schema';

export interface CreateLocalPlayInput {
  gameRef: GameRef;
  playedAt: number;
  participants: LocalPlayParticipant[];
  description?: string;
}

function validateParticipants(participants: LocalPlayParticipant[]) {
  if (participants.length === 0) throw new Error('A play needs at least one participant');

  const ranked = participants.filter((p) => p.rank !== undefined).map((p) => p.rank!);
  if (ranked.length > 0) {
    const sorted = [...ranked].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) throw new Error(`Ranks must be contiguous starting at 1 (got ${sorted.join(',')})`);
    }
  }
}

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export async function createLocalPlay(input: CreateLocalPlayInput): Promise<LocalPlay> {
  validateParticipants(input.participants);

  const now = Date.now();
  const row: LocalPlay = {
    id: ulid(),
    gameRef: input.gameRef,
    playedAt: input.playedAt,
    participants: input.participants,
    description: input.description?.trim() || undefined,
    photoIds: [],
    syncState: 'local',
    idempotencyKey: uuidv4(),
    createdAt: now,
    updatedAt: now,
  };
  await getLocalDb().localPlays.add(row);
  return row;
}

export async function getLocalPlay(id: string): Promise<LocalPlay | undefined> {
  return getLocalDb().localPlays.get(id);
}

export async function listLocalPlays(): Promise<LocalPlay[]> {
  return getLocalDb().localPlays.orderBy('playedAt').reverse().toArray();
}

export async function listPlaysOnDate(date: Date): Promise<LocalPlay[]> {
  const start = startOfLocalDay(date);
  const end = start + 86_400_000;
  return getLocalDb()
    .localPlays.where('playedAt')
    .between(start, end, true, false)
    .toArray();
}

export interface UpdateLocalPlayInput {
  gameRef?: GameRef;
  playedAt?: number;
  participants?: LocalPlayParticipant[];
  description?: string | null;
  photoIds?: string[];
}

export async function updateLocalPlay(id: string, patch: UpdateLocalPlayInput): Promise<void> {
  if (patch.participants) validateParticipants(patch.participants);
  const update: Partial<LocalPlay> = { updatedAt: Date.now() };
  if (patch.gameRef !== undefined) update.gameRef = patch.gameRef;
  if (patch.playedAt !== undefined) update.playedAt = patch.playedAt;
  if (patch.participants !== undefined) update.participants = patch.participants;
  if (patch.description !== undefined) update.description = patch.description?.trim() || undefined;
  if (patch.photoIds !== undefined) update.photoIds = patch.photoIds;
  await getLocalDb().localPlays.update(id, update);
}

export async function deleteLocalPlay(id: string): Promise<void> {
  const db = getLocalDb();
  await db.transaction('rw', db.localPlays, db.localPhotos, async () => {
    const photoIds = await db.localPhotos.where({ playId: id }).primaryKeys();
    await db.localPhotos.bulkDelete(photoIds);
    await db.localPlays.delete(id);
  });
}
