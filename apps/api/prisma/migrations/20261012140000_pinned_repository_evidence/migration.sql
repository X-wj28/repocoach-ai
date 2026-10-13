ALTER TABLE "project_snapshots"
  ADD COLUMN "commit_sha" TEXT,
  ADD COLUMN "manifest" JSONB,
  ADD COLUMN "tree_truncated" BOOLEAN NOT NULL DEFAULT false;
