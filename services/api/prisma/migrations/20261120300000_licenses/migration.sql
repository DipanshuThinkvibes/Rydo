-- Licences: what each client may use, issued by RYDO. A product works only while its licence is valid.
CREATE TYPE "LicenseProduct" AS ENUM ('SHARE', 'ENTERPRISE', 'CAMPUS');
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

CREATE TABLE "licenses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "product" "LicenseProduct" NOT NULL,
  "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
  "starts_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ,
  "notes" TEXT,
  "status_reason" TEXT,
  "issued_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "licenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "licenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "licenses_organization_id_product_key" ON "licenses"("organization_id", "product");
CREATE INDEX "licenses_expires_at_idx" ON "licenses"("expires_at");

-- Everyone who is on RYDO today keeps what they have: a licence with no end date for each module that was switched on.
INSERT INTO "licenses" ("organization_id", "product", "notes")
SELECT id, 'SHARE', 'Created from the existing setup' FROM "organizations" WHERE COALESCE(features->>'share', 'true') <> 'false';
INSERT INTO "licenses" ("organization_id", "product", "notes")
SELECT id, 'ENTERPRISE', 'Created from the existing setup' FROM "organizations" WHERE features->>'enterprise' = 'true';
INSERT INTO "licenses" ("organization_id", "product", "notes")
SELECT id, 'CAMPUS', 'Created from the existing setup' FROM "organizations" WHERE features->>'campus' = 'true';
