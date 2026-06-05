import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  REFRESH_TOKEN_ENC_KEY: z.string().min(32),
  REDIS_URL: z.string().url(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  KAKAO_CLIENT_ID: z.string().optional(),
  KAKAO_CLIENT_SECRET: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`invalid env: ${parsed.error.message}`);
}

export const config = parsed.data;
export type Config = z.infer<typeof Env>;
