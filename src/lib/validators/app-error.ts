export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'STORAGE_FULL'
  | 'INTERNAL';

export type AppErrorDetails =
  | { subcode: 'stale'; serverVersion: number }
  | { subcode: 'invite_expired' }
  | { subcode: 'invite_exhausted' }
  | { subcode: 'invite_revoked' }
  | { subcode: 'duplicate' }
  | { subcode?: undefined; retryAfterSec: number }
  | { subcode?: undefined; fields: Record<string, string> }
  | { subcode?: undefined; [key: string]: unknown };

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  STORAGE_FULL: 507,
  INTERNAL: 500,
};

export interface AppErrorInit {
  code: AppErrorCode;
  message: string;
  details?: AppErrorDetails;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: AppErrorDetails;
  constructor(init: AppErrorInit) {
    super(init.message, { cause: init.cause });
    this.name = 'AppError';
    this.code = init.code;
    this.status = STATUS_BY_CODE[init.code];
    this.details = init.details;
  }
  toJSON() {
    return { code: this.code, message: this.message, status: this.status, details: this.details };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
