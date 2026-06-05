import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '~': path.resolve(import.meta.dirname, 'src') } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'happy-dom',
          include: ['tests/unit/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
          exclude: ['tests/integration/**', 'tests/e2e/**'],
          setupFiles: ['./tests/setup/unit.ts', './tests/setup/local-db.ts'],
          env: {
            DATABASE_URL: 'postgres://placeholder:placeholder@localhost:5432/placeholder',
            BETTER_AUTH_SECRET: 'a'.repeat(64),
            BETTER_AUTH_URL: 'http://localhost:3000',
            REFRESH_TOKEN_ENC_KEY: 'b'.repeat(64),
            REDIS_URL: 'redis://localhost:6379',
            NODE_ENV: 'test',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.{test,spec}.ts'],
          setupFiles: ['./tests/setup/integration.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          env: {
            DATABASE_URL: 'postgres://placeholder/placeholder',
            BETTER_AUTH_SECRET: 'a'.repeat(64),
            BETTER_AUTH_URL: 'http://localhost:3000',
            REFRESH_TOKEN_ENC_KEY: 'b'.repeat(64),
            REDIS_URL: 'redis://localhost:6379',
            NODE_ENV: 'test',
          },
        },
      },
    ],
  },
});
