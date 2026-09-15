-- Staff credentials are provisioned by an administrator, so existing
-- cashier/admin accounts must not be blocked when customer login verification
-- becomes mandatory.
UPDATE "users"
SET "emailVerified" = true
WHERE "role" IN ('cashier', 'admin')
  AND "emailVerified" = false;
