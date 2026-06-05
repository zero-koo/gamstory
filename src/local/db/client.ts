import Dexie from 'dexie';
import type { LocalSchemaV1 } from './schema';
import { DEXIE_DB_NAME } from './schema';
import { applyMigrations } from './migrations';

let cached: (Dexie & LocalSchemaV1) | undefined;

export function getLocalDb(): Dexie & LocalSchemaV1 {
  if (cached) return cached;
  const db = new Dexie(DEXIE_DB_NAME) as Dexie & LocalSchemaV1;
  applyMigrations(db);
  cached = db;
  return cached;
}

// Test-only: drop the cached instance so a fresh Dexie can be created on a
// reset IndexedDB. Do NOT call from app code.
export function __resetLocalDbForTests() {
  cached?.close();
  cached = undefined;
}
