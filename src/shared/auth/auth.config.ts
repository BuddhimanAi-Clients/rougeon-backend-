import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { prisma } from '../../configs/database.config.js';
import { envVariables } from '../../configs/env.config.js';
import { USER_ROLES } from './auth.types.js';

export const auth = betterAuth({
  appName: 'ROGUEON',
  baseURL: envVariables.SERVER_URL,
  basePath: '/api/v1/auth',
  secret: envVariables.BETTER_AUTH_SECRET,
  trustedOrigins: envVariables.CORS_ORIGINS,
  disabledPaths: [
    '/sign-in/social',
    '/link-social',
    '/unlink-account',
    '/get-access-token',
    '/refresh-token',
    '/request-password-reset',
    '/reset-password',
    '/send-verification-email',
    '/verify-email',
  ],
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          });

          if (!user?.isActive) {
            throw APIError.from('FORBIDDEN', {
              code: 'ACCOUNT_INACTIVE',
              message: 'This account is inactive',
            });
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      phone: {
        type: 'string',
        required: false,
      },
      role: {
        type: [...USER_ROLES],
        required: true,
        defaultValue: 'customer',
        input: false,
      },
      isActive: {
        type: 'boolean',
        required: true,
        defaultValue: true,
        input: false,
      },
    },
  },
  advanced: {
    useSecureCookies: envVariables.NODE_ENV === 'production',
  },
});

export type AuthSession = typeof auth.$Infer.Session;
