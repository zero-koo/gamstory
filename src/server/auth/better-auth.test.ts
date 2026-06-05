import { describe, it, expect } from 'vitest';
import { auth } from './better-auth';

describe('better-auth scaffold', () => {
  it('exposes a handler', () => {
    expect(typeof auth.handler).toBe('function');
  });

  it('has no OAuth providers wired in Plan 1', () => {
    const opts = auth.options as { socialProviders?: Record<string, unknown> };
    expect(opts.socialProviders ?? {}).toEqual({});
  });
});
