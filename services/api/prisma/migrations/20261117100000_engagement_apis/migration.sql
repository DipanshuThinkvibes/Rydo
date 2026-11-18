-- Chat, feedback, surveys, emergency-contact email and car type. Additive only: nothing is dropped or rewritten.

-- CreateEnum
CREATE TYPE "CarType" AS ENUM ('HATCHBACK', 'SEDAN', 'SUV');
CREATE TYPE "FeedbackCategory" AS ENUM ('USABILITY', 'MATCHING', 'COMMUNICATION', 'COST_SHARING', 'GENERAL');
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWED', 'CLOSED');
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- Chat: nothing has ever written to this table, so the new required column is safe.
DELETE FROM "messages";
ALTER TABLE "messages" ADD COLUMN "rider_membership_id" UUID NOT NULL,
ADD COLUMN "read_at" TIMESTAMPTZ;
DROP INDEX "messages_ride_id_created_at_idx";
CREATE INDEX "messages_ride_id_rider_membership_id_created_at_idx" ON "messages"("ride_id", "rider_membership_id", "created_at");

-- Emergency contacts get an email so a live-trip link can be sent to them.
ALTER TABLE "emergency_contacts" ADD COLUMN "email" TEXT;

-- Vehicles: Hatchback / Sedan / SUV.
ALTER TABLE "vehicles" ADD COLUMN "car_type" "CarType";

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "rating" INTEGER,
    "comment" VARCHAR(1000) NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "admin_note" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feedback_rating_check" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5))
);

-- CreateTable
CREATE TABLE "surveys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questions" JSONB NOT NULL,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ,
    "closes_at" TIMESTAMPTZ,
    "audience_size" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_organization_id_status_created_at_idx" ON "feedback"("organization_id", "status", "created_at");
CREATE INDEX "surveys_organization_id_status_idx" ON "surveys"("organization_id", "status");
CREATE UNIQUE INDEX "survey_responses_survey_id_membership_id_key" ON "survey_responses"("survey_id", "membership_id");

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
