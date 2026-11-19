-- Contact us form: companies asking RYDO to onboard them. Additive only.
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'ONBOARDED', 'CLOSED');

CREATE TABLE "onboarding_inquiries" (
    "id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "work_email" CITEXT NOT NULL,
    "phone" TEXT,
    "company_size" TEXT NOT NULL,
    "city" TEXT,
    "message" VARCHAR(1500),
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "handled_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "onboarding_inquiries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "onboarding_inquiries_status_created_at_idx" ON "onboarding_inquiries"("status", "created_at");
CREATE INDEX "onboarding_inquiries_work_email_created_at_idx" ON "onboarding_inquiries"("work_email", "created_at");
