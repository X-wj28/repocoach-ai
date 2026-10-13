ALTER TABLE "interview_answers" ALTER COLUMN "score" DROP NOT NULL;
CREATE TYPE "EvaluationRunStatus" AS ENUM ('EVIDENCE_PENDING', 'EVIDENCE_RUNNING', 'EVIDENCE_FAILED', 'SCORING_PENDING', 'SCORING_RUNNING', 'SCORING_FAILED', 'COMPLETED');
CREATE TABLE "evaluation_runs" (
  "id" TEXT NOT NULL,
  "interview_id" TEXT NOT NULL,
  "question_number" INTEGER NOT NULL,
  "question_id" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "questions" JSONB NOT NULL,
  "project_context" JSONB NOT NULL,
  "evidence" JSONB,
  "trace" JSONB,
  "evaluation" JSONB,
  "status" "EvaluationRunStatus" NOT NULL DEFAULT 'EVIDENCE_PENDING',
  "evidence_attempts" INTEGER NOT NULL DEFAULT 0,
  "scoring_attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "failure_code" TEXT,
  "rubric_version" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evaluation_runs_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "evaluation_runs_interview_id_question_number_key" ON "evaluation_runs"("interview_id", "question_number");
CREATE INDEX "evaluation_runs_status_lease_expires_at_created_at_idx" ON "evaluation_runs"("status", "lease_expires_at", "created_at");
