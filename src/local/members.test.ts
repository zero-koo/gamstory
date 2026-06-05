import { describe, it, expect } from 'vitest';
import {
  createLocalMember,
  listLocalMembers,
  updateLocalMember,
  deleteLocalMember,
  linkMemberToWorkspaceUser,
  unlinkMemberFromWorkspace,
  getLocalMember,
} from './members';

describe('local members', () => {
  it('creates a member', async () => {
    const m = await createLocalMember({ name: 'Alice' });
    expect(m.name).toBe('Alice');
    expect(m.links).toEqual([]);
  });

  it('lists members alphabetically', async () => {
    await createLocalMember({ name: 'Charlie' });
    await createLocalMember({ name: 'Alice' });
    await createLocalMember({ name: 'Bob' });
    const rows = await listLocalMembers();
    expect(rows.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('updates display name', async () => {
    const m = await createLocalMember({ name: 'Bob' });
    await updateLocalMember(m.id, { name: 'Robert' });
    expect((await getLocalMember(m.id))?.name).toBe('Robert');
  });

  it('links and unlinks workspace players', async () => {
    const m = await createLocalMember({ name: 'Alice' });
    await linkMemberToWorkspaceUser(m.id, { workspaceId: 'w1', workspacePlayerId: 'p1' });
    let after = await getLocalMember(m.id);
    expect(after?.links).toEqual([{ workspaceId: 'w1', workspacePlayerId: 'p1' }]);

    // re-linking same workspace replaces the existing link
    await linkMemberToWorkspaceUser(m.id, { workspaceId: 'w1', workspacePlayerId: 'p2' });
    after = await getLocalMember(m.id);
    expect(after?.links).toEqual([{ workspaceId: 'w1', workspacePlayerId: 'p2' }]);

    // linking a different workspace adds without removing the first
    await linkMemberToWorkspaceUser(m.id, { workspaceId: 'w2', workspacePlayerId: 'p3' });
    after = await getLocalMember(m.id);
    expect(after?.links).toEqual([
      { workspaceId: 'w1', workspacePlayerId: 'p2' },
      { workspaceId: 'w2', workspacePlayerId: 'p3' },
    ]);

    await unlinkMemberFromWorkspace(m.id, 'w1');
    after = await getLocalMember(m.id);
    expect(after?.links).toEqual([{ workspaceId: 'w2', workspacePlayerId: 'p3' }]);
  });

  it('rejects empty name', async () => {
    await expect(createLocalMember({ name: '' })).rejects.toThrow();
  });

  it('deletes', async () => {
    const m = await createLocalMember({ name: 'Z' });
    await deleteLocalMember(m.id);
    expect(await getLocalMember(m.id)).toBeUndefined();
  });
});
