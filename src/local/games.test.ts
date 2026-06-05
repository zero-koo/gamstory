import { describe, it, expect } from 'vitest';
import { createLocalGame, listLocalGames, updateLocalGame, deleteLocalGame, getLocalGame } from './games';

describe('local games', () => {
  it('creates a game and returns the row', async () => {
    const g = await createLocalGame({ name: 'Catan' });
    expect(g.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(g.name).toBe('Catan');
    expect(typeof g.createdAt).toBe('number');
  });

  it('lists games newest first', async () => {
    await createLocalGame({ name: 'First' });
    await new Promise((r) => setTimeout(r, 2));
    await createLocalGame({ name: 'Second' });
    const rows = await listLocalGames();
    expect(rows.map((r) => r.name)).toEqual(['Second', 'First']);
  });

  it('updates a name', async () => {
    const g = await createLocalGame({ name: 'Settlers' });
    await updateLocalGame(g.id, { name: 'Catan' });
    const after = await getLocalGame(g.id);
    expect(after?.name).toBe('Catan');
  });

  it('deletes', async () => {
    const g = await createLocalGame({ name: 'Risk' });
    await deleteLocalGame(g.id);
    expect(await getLocalGame(g.id)).toBeUndefined();
  });

  it('rejects empty name', async () => {
    await expect(createLocalGame({ name: '   ' })).rejects.toThrow(/name/i);
  });
});
