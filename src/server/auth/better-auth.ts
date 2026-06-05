import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '~/server/db/client';
import { config } from '~/lib/config';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    cookiePrefix: '__Host-gamstory',
    useSecureCookies: config.NODE_ENV === 'production',
    cookieAttributes: { sameSite: 'lax', httpOnly: true, path: '/' },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: [],
      allowDifferentEmails: false,
    },
  },
});

export type Auth = typeof auth;
