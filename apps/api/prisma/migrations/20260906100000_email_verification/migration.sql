ALTER TABLE "users"
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "email_verification_code_hash" TEXT,
  ADD COLUMN "email_verification_expires_at" TIMESTAMP(3);

-- Accounts created before verification was introduced remain usable.
UPDATE "users"
SET "email_verified_at" = CURRENT_TIMESTAMP
WHERE "email_verified_at" IS NULL;
