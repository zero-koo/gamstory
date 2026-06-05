import { describe, it, expect } from 'vitest';
import { getTestDb } from '../setup/integration';
import { user } from '../../src/server/db/schema';

describe('db integration', () => {
  it('can insert and read a user row', async () => {
    const db = getTestDb();
    await db.insert(user).values({ id: 'u1', name: 'Tester', email: 'tester@example.com' });
    const rows = await db.select().from(user);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.find((r) => r.id === 'u1')?.email).toBe('tester@example.com');
  });
});
