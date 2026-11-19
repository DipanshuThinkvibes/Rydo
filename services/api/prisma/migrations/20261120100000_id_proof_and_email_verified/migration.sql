-- Any ID proof (not just Aadhaar) for new-employee sign-up, and a verified-email flag. Additive / rename only.
ALTER TABLE "employee_registrations" RENAME COLUMN "aadhaar_last4" TO "id_last4";
ALTER TABLE "employee_registrations" ADD COLUMN "id_type" TEXT NOT NULL DEFAULT 'AADHAAR';

ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ;
-- People who already proved their inbox with an email code count as verified.
UPDATE "users" u SET "email_verified_at" = now() WHERE EXISTS (SELECT 1 FROM "otp_codes" o WHERE o."email" = u."email" AND o."consumed_at" IS NOT NULL);
