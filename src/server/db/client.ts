import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '~/lib/config';
import * as schema from './schema';

const queryClient = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  prepare: false,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
