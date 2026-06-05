import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import Dexie from 'dexie';
import { __resetLocalDbForTests } from '../../src/local/db/client';
import { DEXIE_DB_NAME } from '../../src/local/db/schema';

afterEach(async () => {
  __resetLocalDbForTests();
  await Dexie.delete(DEXIE_DB_NAME);
});
