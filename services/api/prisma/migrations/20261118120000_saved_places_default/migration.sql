-- Saved addresses: many per person (home, office, other), one default per kind.
ALTER TABLE "saved_places" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- Each person's newest home (the one /me/home used) becomes their default home.
UPDATE "saved_places" s SET "is_default" = true
WHERE s."label" = 'HOME' AND s."id" = (
  SELECT x."id" FROM "saved_places" x
  WHERE x."membership_id" = s."membership_id" AND x."label" = 'HOME'
  ORDER BY x."created_at" DESC LIMIT 1
);
