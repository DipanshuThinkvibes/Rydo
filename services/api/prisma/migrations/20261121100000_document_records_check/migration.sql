-- Government-record checks on driver papers (licence via Sarathi; RC and insurance via Vahan).
-- Insurance, the back side, vehicle photos and the guidelines date come from 20261120800000_driver_papers_and_safety.
CREATE TYPE "DocumentCheckStatus" AS ENUM ('PASSED', 'WARNING', 'FAILED', 'UNAVAILABLE');

ALTER TABLE "documents"
  ADD COLUMN "check_status" "DocumentCheckStatus",
  ADD COLUMN "check_notes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "checked_at" TIMESTAMPTZ;
