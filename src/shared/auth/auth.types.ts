export const USER_ROLES = ['customer', 'cashier', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];
