import { Router } from 'express';
import { prisma } from '../../configs/database.config.js';
export const posMembershipTierRouter = Router();
posMembershipTierRouter.get('/', async (_request, response) => response.json({ data: await prisma.membershipTier.findMany({ where: { isActive: true }, orderBy: { rank: 'asc' }, select: { id: true, name: true, threshold: true, discountPercent: true, benefits: true, birthdayGiftDescription: true, rank: true } }) }));
