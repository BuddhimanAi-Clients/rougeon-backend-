import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { prisma } from '../../configs/database.config.js';
import { envVariables } from '../../configs/env.config.js';
import { USER_ROLES } from './auth.types.js';
import { sendAuthEmail } from '../email/email.service.js';

export const auth = betterAuth({
  appName: 'ROGUEON',
  baseURL: envVariables.SERVER_URL,
  basePath: '/api/v1/auth',
  secret: envVariables.BETTER_AUTH_SECRET,
  trustedOrigins: envVariables.CORS_ORIGINS,
  disabledPaths: ['/sign-in/social', '/link-social', '/unlink-account', '/get-access-token', '/refresh-token'],
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
    sendResetPassword: async ({ user, url }) => {
      void sendAuthEmail({ to: user.email, subject: 'Reset your ROGUEON password', text: `Reset your password: ${url}`, html: `<p>Use this link to reset your ROGUEON password:</p><p><a href="${url}">Reset password</a></p>` });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendAuthEmail({ to: user.email, subject: 'Verify your ROGUEON email', text: `Verify your email: ${url}`, html: `<p>Verify your ROGUEON email address:</p><p><a href="${url}">Verify email</a></p>` });
    },
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
