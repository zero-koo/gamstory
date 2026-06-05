import { ulid } from 'ulid';
import { getLocalDb } from './db/client';
import type { LocalGame } from './db/schema';

export interface CreateLocalGameInput {
  name: string;
  imageBlob?: Blob;
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Game name is required');
  if (trimmed.length > 200) throw new Error('Game name is too long');
  return trimmed;
}

export async function createLocalGame(input: CreateLocalGameInput): Promise<LocalGame> {
  const name = assertName(input.name);
  const row: LocalGame = {
    id: ulid(),
    name,
    imageBlob: input.imageBlob,
    createdAt: Date.now(),
  };
  await getLocalDb().localGames.add(row);
  return row;
}

export async function getLocalGame(id: string): Promise<LocalGame | undefined> {
  return getLocalDb().localGames.get(id);
}

export async function listLocalGames(): Promise<LocalGame[]> {
  return getLocalDb()
    .localGames.orderBy('createdAt')
    .reverse()
    .toArray();
}

export async function updateLocalGame(id: string, patch: Partial<Pick<LocalGame, 'name' | 'imageBlob'>>): Promise<void> {
  const update: Partial<LocalGame> = {};
  if (patch.name !== undefined) update.name = assertName(patch.name);
  if (patch.imageBlob !== undefined) update.imageBlob = patch.imageBlob;
  if (Object.keys(update).length === 0) return;
  await getLocalDb().localGames.update(id, update);
}

export async function deleteLocalGame(id: string): Promise<void> {
  await getLocalDb().localGames.delete(id);
}
