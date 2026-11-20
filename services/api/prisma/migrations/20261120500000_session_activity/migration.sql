-- Websites sign out after 2 hours without use, so each session records when it was last used.
ALTER TABLE "sessions" ADD COLUMN "last_active_at" TIMESTAMPTZ NOT NULL DEFAULT now();
