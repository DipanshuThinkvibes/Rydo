-- Driver papers (licence and RC front and back, vehicle photos, safety guidelines), identity/vehicle mismatch reports,
-- and temporary blocks by RYDO staff.
ALTER TYPE "DocumentKind" ADD VALUE 'VEHICLE_PHOTO_FRONT';
ALTER TYPE "DocumentKind" ADD VALUE 'VEHICLE_PHOTO_SIDE';
ALTER TYPE "DocumentKind" ADD VALUE 'VEHICLE_PHOTO_INSIDE';
ALTER TYPE "IssueCategory" ADD VALUE 'IDENTITY_MISMATCH';

ALTER TABLE "documents" ADD COLUMN "back_storage_key" TEXT;
ALTER TABLE "driver_profiles" ADD COLUMN "guidelines_accepted_at" TIMESTAMPTZ;
ALTER TABLE "memberships" ADD COLUMN "platform_blocked_until" TIMESTAMPTZ;
