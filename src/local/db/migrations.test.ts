import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { applyMigrations, DEXIE_VERSION } from './migrations';
import { DEXIE_DB_NAME } from './schema';

async function fresh() {
  await Dexie.delete(DEXIE_DB_NAME);
  const db = new Dexie(DEXIE_DB_NAME);
  applyMigrations(db);
  await db.open();
  return db;
}

describe('Dexie migrations', () => {
  it('opens at the current version', async () => {
    const db = await fresh();
    expect(db.verno).toBe(DEXIE_VERSION);
    db.close();
  });

  it('creates the v1 tables', async () => {
    const db = await fresh();
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(['gameCache', 'localGames', 'localMembers', 'localPhotos', 'localPlays']);
    db.close();
  });

  it('localPhotos has a [playId+order] compound index', async () => {
    const db = await fresh();
    const photos = db.table('localPhotos');
    const indexes = photos.schema.indexes.map((i) => i.name).sort();
    expect(indexes).toContain('[playId+order]');
    db.close();
  });

  it('inserts and reads a row through v1 schema', async () => {
    const db = await fresh();
    await db.table('localGames').put({ id: 'g1', name: 'Catan', createdAt: 1 });
    const row = await db.table('localGames').get('g1');
    expect(row?.name).toBe('Catan');
    db.close();
  });
});
