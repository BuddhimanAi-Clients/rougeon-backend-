import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { prisma } from '../../configs/database.config.js';
import { envVariables } from '../../configs/env.config.js';
import { USER_ROLES } from './auth.types.js';
import { enqueueAuthEmail } from '../email/email.service.js';
import { EmailKind } from '@prisma/client';
import { customerProfileInputSchema } from '../customers/customer.schemas.js';
import { resolveVerifiedMembershipSignup, saveMembershipSignupClaim } from '../customers/customer.service.js';
import { AppError } from '../errors/app-error.js';

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
    user: {
      create: {
        after: async (user) => {
          const pendingProfile = (user as { pendingMembershipProfile?: unknown }).pendingMembershipProfile;
          if (typeof pendingProfile !== 'string') return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(pendingProfile);
          } catch {
            throw APIError.from('BAD_REQUEST', { code: 'INVALID_MEMBERSHIP_PROFILE', message: 'Invalid membership profile details' });
          }
          const profile = customerProfileInputSchema.safeParse(parsed);
          if (!profile.success) throw APIError.from('BAD_REQUEST', { code: 'INVALID_MEMBERSHIP_PROFILE', message: 'Invalid membership profile details' });
          try {
            await saveMembershipSignupClaim(user.id, profile.data);
          } catch (error) {
            if (error instanceof AppError) throw APIError.from('BAD_REQUEST', { code: error.code, message: error.message });
            throw error;
          }
          await prisma.$executeRaw`UPDATE "users" SET "pendingMembershipProfile" = NULL WHERE "id" = ${user.id}`;
        },
      },
      update: {
        after: async (user) => {
          const verifiedUser = user as { id: string; emailVerified?: unknown };
          if (verifiedUser.emailVerified === true) await resolveVerifiedMembershipSignup(verifiedUser.id);
        },
      },
    },
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
    // Website customers must confirm ownership of their email before an
    // authenticated session is created. Staff are marked verified by the
    // admin-only staff provisioning path below.
    requireEmailVerification: true,
    autoSignIn: false,
    sendResetPassword: async ({ user, url }) => {
      await enqueueAuthEmail({ kind: EmailKind.auth_password_reset, to: user.email, subject: 'Reset your ROGUEON password', text: `Reset your password: ${url}`, html: `<p>Use this link to reset your ROGUEON password:</p><p><a href="${url}">Reset password</a></p>` });
    },
  },
  emailVerification: {
    // The website explicitly requests this after it has stored the
    // customer's pending membership details. This keeps the admin staff
    // provisioning path free of customer verification email.
    sendOnSignUp: false,
    sendOnSignIn: false,
    sendVerificationEmail: async ({ user, url }) => {
      await enqueueAuthEmail({ kind: EmailKind.auth_verification, to: user.email, subject: 'Verify your ROGUEON email', text: `Verify your email: ${url}`, html: `<p>Verify your ROGUEON email address:</p><p><a href="${url}">Verify email</a></p>` });
    },
  },
  user: {
    additionalFields: {
      phone: {
        type: 'string',
        required: false,
      },
      pendingMembershipProfile: {
        type: 'string',
        required: false,
        input: true,
        returned: false,
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
