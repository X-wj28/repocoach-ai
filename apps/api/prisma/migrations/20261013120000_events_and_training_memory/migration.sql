ALTER TABLE "users" ADD COLUMN "memory_epoch" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "interviews" ADD COLUMN "practice_focus" JSONB;
ALTER TABLE "evaluation_runs" ADD COLUMN "memory_epoch" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "evaluation_runs" ADD COLUMN "last_event_seq" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "evaluation_events" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evaluation_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "evaluation_events_sequence_positive" CHECK ("sequence" > 0)
);
CREATE UNIQUE INDEX "evaluation_events_run_id_sequence_key" ON "evaluation_events"("run_id", "sequence");
-- Existing tasks receive one truthful state snapshot; no historical tool steps are invented.
INSERT INTO "evaluation_events" ("id", "run_id", "sequence", "type", "payload")
SELECT 'legacy-event-' || "id", "id", 1, 'run.snapshot',
  jsonb_build_object('status', "status", 'migrated', true) FROM "evaluation_runs";
UPDATE "evaluation_runs" SET "last_event_seq" = 1;
CREATE TABLE "training_memories" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "criterion" TEXT NOT NULL,
  "dimension" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence_ids" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_memories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_memories_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_memories_score_range" CHECK ("score" BETWEEN 0 AND 4)
);
CREATE UNIQUE INDEX "training_memories_user_id_run_id_criterion_key" ON "training_memories"("user_id", "run_id", "criterion");
CREATE INDEX "training_memories_user_id_project_id_created_at_idx" ON "training_memories"("user_id", "project_id", "created_at");
