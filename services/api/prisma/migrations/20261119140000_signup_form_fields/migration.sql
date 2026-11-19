-- Sign-up form (mobile): job title, office and the reporting manager's work email.
ALTER TABLE "memberships"
  ADD COLUMN "job_title" TEXT,
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "manager_email" TEXT;
