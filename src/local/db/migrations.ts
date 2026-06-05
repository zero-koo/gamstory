import Dexie from 'dexie';
import type { LocalSchemaV1 } from './schema';
import { DEXIE_VERSION } from './schema';

/**
 * Apply versioned Dexie schema upgrades. Each version step is idempotent
 * given the prior version's data shape. Tests assert lossless upgrades.
 */
export function applyMigrations(db: Dexie) {
  db.version(1).stores({
    localGames: 'id, name, createdAt',
    localMembers: 'id, name, createdAt',
    localPlays: 'id, syncState, playedAt, gameRef.id, createdAt, updatedAt',
    localPhotos: 'id, playId, [playId+order], createdAt',
    gameCache: 'id, name, cachedAt',
  });
  // Future versions chain via db.version(2).stores(...).upgrade(...).
  return db as Dexie & LocalSchemaV1;
}

export { DEXIE_VERSION };
