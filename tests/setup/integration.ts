import { afterAll, beforeAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../../src/server/db/schema';

let container: StartedPostgreSqlContainer | undefined;
let sql: ReturnType<typeof postgres> | undefined;

declare global {
  var __TEST_DB__: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  sql = postgres(url, { max: 5 });
  const db = drizzle(sql, { schema });
  await migrate(db, { migrationsFolder: './src/server/db/migrations' });
  globalThis.__TEST_DB__ = db;
}, 120_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
  await container?.stop();
}, 60_000);

export function getTestDb() {
  if (!globalThis.__TEST_DB__) throw new Error('Test DB not initialised');
  return globalThis.__TEST_DB__;
}
