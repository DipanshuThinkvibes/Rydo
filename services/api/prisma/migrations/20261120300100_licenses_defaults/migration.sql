-- Prisma generates ids and updated_at itself.
ALTER TABLE "licenses" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "licenses" ALTER COLUMN "updated_at" DROP DEFAULT;
