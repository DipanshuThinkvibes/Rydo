-- Driver application: details, vehicle verification (first), then HR approval.
ALTER TYPE "DocumentKind" ADD VALUE 'INSURANCE';

CREATE TYPE "VehicleCheckStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');
CREATE TYPE "DriverApplicationStatus" AS ENUM ('DRAFT', 'NEEDS_FIXES', 'WITH_HR');

ALTER TABLE "vehicles"
  ADD COLUMN "check_status" "VehicleCheckStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "checked_at" TIMESTAMPTZ,
  ADD COLUMN "check_results" JSONB,
  ADD COLUMN "manufacture_year" INTEGER,
  ADD COLUMN "fuel_type" TEXT;

ALTER TABLE "driver_profiles"
  ADD COLUMN "application_status" "DriverApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "submitted_at" TIMESTAMPTZ,
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "license_class" TEXT,
  ADD COLUMN "driving_since" INTEGER,
  ADD COLUMN "declared_at" TIMESTAMPTZ;

-- Drivers who are already on RYDO keep working: their vehicles count as verified, and anyone already in HR's queue stays there.
UPDATE "vehicles" v SET "check_status" = 'VERIFIED', "checked_at" = now()
  FROM "driver_profiles" p WHERE p."id" = v."driver_profile_id" AND p."status" = 'VERIFIED';
UPDATE "driver_profiles" p SET "application_status" = 'WITH_HR', "submitted_at" = p."created_at"
  WHERE p."status" <> 'PENDING' OR EXISTS (SELECT 1 FROM "documents" d WHERE d."driver_profile_id" = p."id");
