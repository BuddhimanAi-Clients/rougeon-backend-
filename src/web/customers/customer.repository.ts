import { prisma } from '../../configs/database.config.js';
export function findByUserId(userId: string) { return prisma.customerProfile.findUnique({ where: { userId } }); }
export function findUser(userId: string) { return prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, emailVerified: true } }); }
