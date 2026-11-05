-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "features" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "max_employees" INTEGER,
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "support_grants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_daily" (
    "day" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_daily_pkey" PRIMARY KEY ("day","provider","sku")
);

-- CreateIndex
CREATE INDEX "support_grants_user_id_organization_id_expires_at_idx" ON "support_grants"("user_id", "organization_id", "expires_at");

-- AddForeignKey
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
