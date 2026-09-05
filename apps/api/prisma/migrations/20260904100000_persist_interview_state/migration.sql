ALTER TABLE "interviews"
ADD COLUMN "questions" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN "current_question" INTEGER NOT NULL DEFAULT 0;
