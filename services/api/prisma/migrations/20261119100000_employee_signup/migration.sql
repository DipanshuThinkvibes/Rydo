-- Self sign-up: employee details, ID proof and "Continue with Google".
ALTER TABLE "users" ADD COLUMN "google_sub" TEXT;
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

ALTER TABLE "memberships"
  ADD COLUMN "manager_name" TEXT,
  ADD COLUMN "manager_employee_code" TEXT,
  ADD COLUMN "id_proof_type" TEXT,
  ADD COLUMN "id_proof_number" TEXT,
  ADD COLUMN "id_proof_key" TEXT,
  ADD COLUMN "signed_up_at" TIMESTAMPTZ;
