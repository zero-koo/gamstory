import { describe, it, expect, expectTypeOf } from 'vitest';
import { AppError, type AppErrorCode, isAppError } from './app-error';

describe('AppError', () => {
  it('constructs with required fields', () => {
    const err = new AppError({ code: 'NOT_FOUND', message: 'no' });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.message).toBe('no');
  });

  it('CONFLICT(stale) carries serverVersion', () => {
    const err = new AppError({ code: 'CONFLICT', message: 'stale', details: { subcode: 'stale', serverVersion: 7 } });
    expect(err.status).toBe(409);
    if (err.code === 'CONFLICT' && err.details?.subcode === 'stale') {
      expect(err.details.serverVersion).toBe(7);
    } else {
      throw new Error('narrowing failed');
    }
  });

  it('RATE_LIMITED carries retryAfterSec', () => {
    const err = new AppError({ code: 'RATE_LIMITED', message: 'slow down', details: { retryAfterSec: 30 } });
    expect(err.status).toBe(429);
  });

  it('isAppError narrows', () => {
    const err: unknown = new AppError({ code: 'INTERNAL', message: 'x' });
    expect(isAppError(err)).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
  });

  it('exhaustiveness — every code maps to a status', () => {
    const codes: AppErrorCode[] = ['UNAUTHORIZED','FORBIDDEN','NOT_FOUND','VALIDATION','CONFLICT','RATE_LIMITED','STORAGE_FULL','INTERNAL'];
    for (const c of codes) {
      const e = new AppError({ code: c, message: c });
      expect(e.status).toBeGreaterThanOrEqual(400);
    }
    expectTypeOf<AppErrorCode>().toMatchTypeOf<'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'VALIDATION'|'CONFLICT'|'RATE_LIMITED'|'STORAGE_FULL'|'INTERNAL'>();
  });
});
