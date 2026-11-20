-- Drivers can describe any car: more body types than hatchback / sedan / SUV.
ALTER TYPE "CarType" ADD VALUE IF NOT EXISTS 'COMPACT_SUV';
ALTER TYPE "CarType" ADD VALUE IF NOT EXISTS 'MUV';
ALTER TYPE "CarType" ADD VALUE IF NOT EXISTS 'LUXURY';
ALTER TYPE "CarType" ADD VALUE IF NOT EXISTS 'OTHER';
