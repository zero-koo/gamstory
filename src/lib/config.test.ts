import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('lib/config', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(process.env)) delete process.env[k];
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  });

  it('parses a minimally valid env', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@h:5432/d';
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(64);
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.REFRESH_TOKEN_ENC_KEY = 'b'.repeat(64);
    process.env.REDIS_URL = 'redis://localhost:6379';
    const mod = await import('./config');
    expect(mod.config.DATABASE_URL).toBe('postgres://u:p@h:5432/d');
  });

  it('throws when required vars are missing', async () => {
    await expect(import('./config')).rejects.toThrow(/invalid env/i);
  });
});
