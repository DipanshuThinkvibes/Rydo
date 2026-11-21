-- CreateEnum
CREATE TYPE "JoinMethod" AS ENUM ('SELF_SIGNUP', 'INVITE_LINK', 'ADDED_BY_ADMIN');

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "invite_id" UUID,
ADD COLUMN     "joined_via" "JoinMethod" NOT NULL DEFAULT 'SELF_SIGNUP';

-- CreateTable
CREATE TABLE "org_invites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "max_uses" INTEGER NOT NULL DEFAULT 100,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_invites_token_hash_key" ON "org_invites"("token_hash");

-- CreateIndex
CREATE INDEX "org_invites_organization_id_created_at_idx" ON "org_invites"("organization_id", "created_at");


-- People who hold an admin role were created by the company or RYDO, not by signing up.
UPDATE "memberships" m SET "joined_via" = 'ADDED_BY_ADMIN'
WHERE EXISTS (SELECT 1 FROM "membership_roles" r WHERE r."membership_id" = m."id" AND r."role" IN ('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN'));
