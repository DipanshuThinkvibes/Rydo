-- Driver sign-up like the Uber driver app: insurance, licence/RC back side, vehicle photos,
-- government-record checks on licence/RC/insurance, and agreeing to the driver guidelines.
ALTER TYPE "DocumentKind" ADD VALUE 'VEHICLE_INSURANCE';
ALTER TYPE "DocumentKind" ADD VALUE 'VEHICLE_PHOTO_FRONT';
ALTER TYPE "DocumentKind" ADD VALUE 'VEHICLE_PHOTO_SIDE';
ALTER TYPE "DocumentKind" ADD VALUE 'VEHICLE_PHOTO_INSIDE';

CREATE TYPE "DocumentCheckStatus" AS ENUM ('PASSED', 'WARNING', 'FAILED', 'UNAVAILABLE');

ALTER TABLE "documents"
  ADD COLUMN "back_storage_key" TEXT,
  ADD COLUMN "vehicle_classes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "check_status" "DocumentCheckStatus",
  ADD COLUMN "check_notes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "checked_at" TIMESTAMPTZ;

ALTER TABLE "driver_profiles" ADD COLUMN "guidelines_accepted_at" TIMESTAMPTZ;
