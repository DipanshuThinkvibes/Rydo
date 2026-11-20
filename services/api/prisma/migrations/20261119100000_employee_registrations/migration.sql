-- New-employee sign-up details for HR to review. Additive only.
CREATE TABLE "employee_registrations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "aadhaar_last4" VARCHAR(4) NOT NULL,
    "employee_id" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "manager_name" TEXT NOT NULL,
    "manager_email" CITEXT NOT NULL,
    "notified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employee_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_registrations_membership_id_key" ON "employee_registrations"("membership_id");
CREATE INDEX "employee_registrations_organization_id_idx" ON "employee_registrations"("organization_id");
