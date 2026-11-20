-- RYDO (platform) can block a person in one company. Only RYDO can lift it; the company admin cannot.
ALTER TABLE "memberships" ADD COLUMN "platform_blocked_at" TIMESTAMPTZ;
ALTER TABLE "memberships" ADD COLUMN "platform_block_reason" TEXT;
ALTER TABLE "memberships" ADD COLUMN "platform_blocked_by_id" UUID;
