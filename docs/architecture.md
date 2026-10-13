# Architecture

## Runtime boundaries

- `apps/web` owns authentication screens, repository setup, interview interaction, report visualization, replay, and export.
- `apps/api` owns authentication, repository analysis, Agent orchestration, model access, persistence, and report aggregation.
- `packages/shared` contains contracts shared by the web and API packages.
- PostgreSQL stores users, hashed sessions, interviews, answers, evaluation runs, ordered execution events and evidence-linked practice observations.

## Request flow

```text
Browser
  |
  | REST + HttpOnly Cookie
  v
NestJS API
  |-- SessionGuard --> Prisma --> PostgreSQL
  |-- GitHubService --> GitHub Public API
  |-- AgentService --> question planning / interview restoration
  '-- EvaluationStore --> durable EvaluationRun in PostgreSQL
        '-- EvaluationWorker (inside the API process)
              |-- EvidenceRuntime --> DeepSeek / pinned GitHub blobs
              |-- evidence checkpoint --> PostgreSQL
              '-- RubricScorer --> DeepSeek (JSON, no tools)
```

The browser never receives GitHub or model tokens. All third-party requests are made by the API.

## Agent flow

1. The API resolves the branch to a commit, loads its tree, and saves up to 3000 permitted file paths with blob SHAs. It initially loads up to 14 selected text prefixes.
2. Candidate questions bind real file snippets and line numbers. Agent prompts treat repository text as untrusted data; tool access is constrained independently of the prompt.
3. DeepSeek can request `search_code`, `read_file`, or `get_file_outline` to obtain more evidence. Path search uses the manifest; content search covers loaded prefixes only. Additional files are read by saved blob SHA.
4. Every submission includes the displayed question ID. The API persists the immutable answer, questions, context and scoring versions before returning a 202 task response. Identical submissions return the same task; conflicting answers and stale turns are rejected.
5. The worker claims a stage with a 90-second lease. EvidenceRuntime validates tool arguments and permits at most 4 model calls, 6 tool executions, 2 new files, and 45 seconds. Successful retrieval persists a separate evidence checkpoint and trace.
6. RubricScorer makes one JSON-only, no-tool model call against the checkpoint. Four criteria require valid evidence IDs. The server calculates the weighted total; any unjudged criterion makes the total null. Follow-ups use actual evidence paths and server-provided snippets, or the saved candidate question.
7. Provider or output-validation failures leave the stage failed without advancing the question. A scoring retry uses saved evidence and never repeats retrieval. Each stage allows at most three attempts; expired leases can be reclaimed after a restart.
8. A Prisma transaction completes the task, inserts the final answer and evaluation, and advances the question together. Lease tokens fence stale writers. Database failures roll back the entire final commit.
9. Reports aggregate only non-null model scores. Partial judgments and unscored no-model demos remain visible in history and are counted separately.

Each interview stores its own bounded repository context and questions, including evidence snippets and line numbers. Restarts use database state without an in-memory interview cache. Legacy interviews without an embedded context can read the project snapshot.

The worker shares the API process and is awakened by startup, submissions, retries and progress queries. It drains available tasks, waits for the earliest running lease when necessary, and stops querying an idle queue. No Redis or extra worker service is required for this deployment.

Execution is at least once: a crash after an external model call but before its checkpoint may repeat that stage. Lease fencing and transactions guarantee a single committed turn, not exactly-once model calls. Tool steps are not individually checkpointed; successful evidence is the recovery boundary. Legacy snapshots without a pinned manifest permit only already saved files. The old synchronous service method is retained for compatibility tests and has no HTTP entry point.

The web uses credentialed SSE with per-run event IDs, reconnect replay and a polling fallback. Events and corresponding business transitions share transactions; per-tool progress events are observed attempts, not tool-result checkpoints. TrainingMemory stores only valid, non-null model criteria with evidence references. New sessions prioritize recent weaknesses, while a user epoch prevents pre-clear tasks from recreating deleted memory. See [events and memory](events-and-memory.md) for bounds and recovery semantics.

Human-calibrated scoring remains future validation. See [Rubric and recovery](rubric-and-recovery.md) for the scoring contract and synthetic evaluation results.

## Persistence

Prisma owns the PostgreSQL schema and migration history. Relations use cascading deletes from users to sessions and interviews, and from interviews to answers and evaluation runs. Each interview/question number has one evaluation run; runs store phase status, attempt counters, leases, code evidence and versioned evaluations. Every user-facing task, report and interview lookup includes the authenticated user ID.

The legacy SQLite importer is idempotent and imports only records with an authenticated owner.

## Deployment topology

```text
localhost:3002 -> web container (:3000)
localhost:4000 -> api container (:4000)
                     |
                     v
                postgres (:5432)
```

Docker Compose waits for PostgreSQL health before starting the API. The API applies committed Prisma migrations before booting, and the web container waits for the API health check.

For HTTPS deployments, set `WEB_ORIGIN` to the public frontend origin and `COOKIE_SECURE=true`. The public `NEXT_PUBLIC_API_URL` value is embedded during the web image build.

## Public repository policy

The application accepts public GitHub repository URLs only. Repository access is read-only. Private repository access, write actions, automatic code changes, and PR creation remain outside the current release.
