-- CreateTable
CREATE TABLE "trip_shares" (
    "id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_shares_token_hash_key" ON "trip_shares"("token_hash");

-- CreateIndex
CREATE INDEX "trip_shares_ride_id_idx" ON "trip_shares"("ride_id");
