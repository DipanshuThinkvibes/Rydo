-- Per-person notification choices (email and phone push). Safety and account alerts are always sent.
ALTER TABLE "users" ADD COLUMN "notification_prefs" JSONB NOT NULL DEFAULT '{}';
