import { ulid } from 'ulid';
import { getLocalDb } from './db/client';
import type { LocalMember, LocalMemberLink } from './db/schema';

export interface CreateLocalMemberInput {
  name: string;
  avatarBlob?: Blob;
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Member name is required');
  if (trimmed.length > 80) throw new Error('Member name is too long');
  return trimmed;
}

export async function createLocalMember(input: CreateLocalMemberInput): Promise<LocalMember> {
  const name = assertName(input.name);
  const row: LocalMember = {
    id: ulid(),
    name,
    avatarBlob: input.avatarBlob,
    links: [],
    createdAt: Date.now(),
  };
  await getLocalDb().localMembers.add(row);
  return row;
}

export async function getLocalMember(id: string): Promise<LocalMember | undefined> {
  return getLocalDb().localMembers.get(id);
}

export async function listLocalMembers(): Promise<LocalMember[]> {
  const all = await getLocalDb().localMembers.toArray();
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateLocalMember(
  id: string,
  patch: Partial<Pick<LocalMember, 'name' | 'avatarBlob'>>,
): Promise<void> {
  const update: Partial<LocalMember> = {};
  if (patch.name !== undefined) update.name = assertName(patch.name);
  if (patch.avatarBlob !== undefined) update.avatarBlob = patch.avatarBlob;
  if (Object.keys(update).length === 0) return;
  await getLocalDb().localMembers.update(id, update);
}

export async function deleteLocalMember(id: string): Promise<void> {
  await getLocalDb().localMembers.delete(id);
}

export async function linkMemberToWorkspaceUser(memberId: string, link: LocalMemberLink): Promise<void> {
  const db = getLocalDb();
  await db.transaction('rw', db.localMembers, async () => {
    const m = await db.localMembers.get(memberId);
    if (!m) throw new Error(`Member ${memberId} not found`);
    const filtered = m.links.filter((l) => l.workspaceId !== link.workspaceId);
    filtered.push(link);
    await db.localMembers.update(memberId, { links: filtered });
  });
}

export async function unlinkMemberFromWorkspace(memberId: string, workspaceId: string): Promise<void> {
  const db = getLocalDb();
  await db.transaction('rw', db.localMembers, async () => {
    const m = await db.localMembers.get(memberId);
    if (!m) return;
    const filtered = m.links.filter((l) => l.workspaceId !== workspaceId);
    await db.localMembers.update(memberId, { links: filtered });
  });
}
