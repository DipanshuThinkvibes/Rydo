-- Admin accounts run the company; they do not ride or drive. Riding and driving belong to separate employee accounts.
-- An account that had both keeps its admin roles and loses the rider and driver roles (its driver application, if any, stays on file).
DELETE FROM "membership_roles" r
WHERE r."role" IN ('RIDER', 'DRIVER')
  AND EXISTS (
    SELECT 1 FROM "membership_roles" a
    WHERE a."membership_id" = r."membership_id" AND a."role" IN ('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN')
  );
