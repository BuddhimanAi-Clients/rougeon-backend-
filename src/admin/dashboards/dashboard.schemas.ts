import { z } from 'zod';

export const dashboardSalesQuerySchema = z
  .object({
    range: z.enum(['today', 'week', 'month']).optional(),
    date: z.iso.date().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .superRefine((value, context) => {
    const modes = Number(Boolean(value.range)) + Number(Boolean(value.date)) + Number(Boolean(value.from || value.to));
    if (modes > 1) context.addIssue({ code: 'custom', message: 'Use only range, date, or from/to' });
    if (Boolean(value.from) !== Boolean(value.to)) context.addIssue({ code: 'custom', message: 'from and to must be provided together' });
    if (value.from && value.to && value.from > value.to) context.addIssue({ code: 'custom', message: 'from must be before or equal to to' });
  });
export const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).max(2_147_483_647).default(10),
});

export type DashboardSalesQuery = z.infer<typeof dashboardSalesQuerySchema>;
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;
