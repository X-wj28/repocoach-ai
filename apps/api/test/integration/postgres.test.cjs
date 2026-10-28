const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { readdirSync } = require("node:fs");
const { PrismaClient } = require("@prisma/client");
const { ReportStore } = require("../../dist/report/report.store.js");
const { AgentService } = require("../../dist/agent/agent.service.js");

test(
  "a fresh PostgreSQL schema supports deployment and durable interview turns",
  { timeout: 120000 },
  async (t) => {
    assert.ok(
      process.env.TEST_DATABASE_URL,
      "Set TEST_DATABASE_URL explicitly to run database integration tests.",
    );
    const target = new URL(process.env.TEST_DATABASE_URL);
    assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
    const schema = `repocoach_test_${randomUUID().replaceAll("-", "")}`;
    assert.match(schema, /^repocoach_test_[0-9a-f]{32}$/);
    const admin = new PrismaClient({
      datasourceUrl: target.toString(),
      log: [],
    });
    const clients = [];
    let schemaCreated = false;
    t.after(async () => {
      await Promise.all(clients.map((client) => client.$disconnect()));
      try {
        // Only remove the random schema created by this test, never the source schema.
        if (schemaCreated)
          await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.$disconnect();
      }
    });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    target.searchParams.set("schema", schema);
    target.searchParams.set("connection_limit", "5");
    const databaseUrl = target.toString();
    const apiRoot = resolve(__dirname, "../..");
    const cli = require.resolve("prisma/build/index.js");
    function deploy() {
      const result = spawnSync(
        process.execPath,
        [cli, "migrate", "deploy", "--schema", "prisma/schema.prisma"],
        {
          cwd: apiRoot,
          env: { ...process.env, DATABASE_URL: databaseUrl },
          encoding: "utf8",
          timeout: 45000,
        },
      );
      // Do not include CLI stderr: it can contain a database password or URL.
      assert.equal(
        result.status,
        0,
        `Prisma deployment failed (exit ${result.status}, code ${result.error?.code || "none"}).`,
      );
    }
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
    const competingClient = new PrismaClient({
      datasourceUrl: databaseUrl,
      log: [],
    });
    clients.push(prisma, competingClient);
    const store = new ReportStore(prisma);
    const userId = `integration-user-${randomUUID()}`;
    const project = {
      id: `integration-project-${randomUUID()}`,
      name: "integration-project",
      url: "https://github.com/example/integration-project",
      stack: ["React"],
      readmePreview: "Isolated database integration fixture",
      files: [
        {
          path: "src/state.ts",
          size: 42,
          language: "TypeScript",
          snippet: "export const initialState = { loading: false };",
        },
      ],
    };
    const question = {
      id: `question-${randomUUID()}`,
      prompt: "如何处理加载状态与错误恢复？",
      contextPath: "src/state.ts",
      dimension: "engineering",
      difficulty: "进阶",
      evidence: { startLine: 1, endLine: 1, snippet: project.files[0].snippet },
    };
    async function createInterview() {
      const id = `integration-interview-${randomUUID()}`;
      await store.createInterview({
        id,
        userId,
        projectId: project.id,
        projectName: project.name,
        projectUrl: project.url,
        jobDescription: "前端开发",
        totalQuestions: 1,
        questions: [question],
        projectContext: project,
      });
      return id;
    }
    function turn(interviewId, score = 7) {
      return {
        interviewId,
        userId,
        questionNumber: 1,
        question,
        answer: "使用明确的请求状态和错误恢复边界，并通过测试验证。",
        evaluation: {
          interviewId,
          projectId: project.id,
          score,
          strengths: ["说明了状态边界"],
          improvements: ["补充重试测试"],
          questionNumber: 1,
          totalQuestions: 1,
          completed: true,
          provider: "deepseek",
          note: "Integration fixture, no model request.",
          nextQuestionSource: "none",
        },
        completed: true,
        questions: [question],
      };
    }

    await t.test(
      "all migrations initialize an empty database and deploy is repeatable",
      async () => {
        deploy();
        const before =
          await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
        const expected = readdirSync(resolve(apiRoot, "prisma/migrations"), {
          withFileTypes: true,
        })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort();
        assert.deepEqual(
          before.map((row) => row.migration_name),
          expected,
        );
        assert.ok(
          before.some(
            (row) =>
              row.migration_name === "20261012090000_reliable_interview_turns",
          ),
        );
        deploy();
        const after =
          await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
        assert.deepEqual(after, before);
        await prisma.user.create({
          data: {
            id: userId,
            email: `${userId}@example.com`,
            name: "Integration test",
            passwordHash: "fixture-only",
            emailVerifiedAt: new Date(),
          },
        });
        await prisma.projectSnapshot.create({ data: project });
        const check = spawnSync(
          process.execPath,
          [resolve(apiRoot, "scripts/check-database.cjs")],
          {
            cwd: apiRoot,
            env: { ...process.env, DATABASE_URL: databaseUrl },
            encoding: "utf8",
            timeout: 20000,
          },
        );
        assert.equal(
          check.status,
          0,
          "The read-only database check should accept the migrated schema.",
        );
        assert.match(check.stdout, /"applicationSchema":"ok"/);
        assert.match(check.stdout, /"pending":\[\]/);
        assert.ok(!check.stdout.includes(databaseUrl));
        assert.ok(
          !check.stdout.includes(`${target.username}:${target.password}@`),
        );
      },
    );

    await t.test(
      "only the latest session resumes, without reviving abandoned sessions after completion",
      async () => {
        const scopedProject = {
          ...project,
          id: `session-project-${randomUUID()}`,
        };
        await prisma.projectSnapshot.create({ data: scopedProject });
        const ids = [`old-${randomUUID()}`, `latest-${randomUUID()}`];
        for (const [index, id] of ids.entries()) {
          await store.createInterview({
            id,
            userId,
            projectId: scopedProject.id,
            projectName: scopedProject.name,
            projectUrl: scopedProject.url,
            jobDescription: "恢复测试",
            totalQuestions: 1,
            questions: [question],
            projectContext: scopedProject,
          });
          await prisma.interview.update({
            where: { id },
            data: { startedAt: new Date(`2026-01-0${index + 1}T00:00:00Z`) },
          });
        }
        assert.equal(
          (await store.getActiveInterview(scopedProject.id, userId))
            .interviewId,
          ids[1],
        );
        assert.equal(
          await store.getActiveInterview(scopedProject.id, "another-user"),
          null,
        );
        const input = turn(ids[1]);
        input.evaluation.projectId = scopedProject.id;
        await store.recordAnswer(input);
        const restartedStore = new ReportStore(competingClient);
        assert.equal(
          await restartedStore.getActiveInterview(scopedProject.id, userId),
          null,
        );
        assert.equal(
          (await restartedStore.getInterviewState(ids[0], userId)).status,
          "IN_PROGRESS",
        );
        assert.equal(
          (await restartedStore.getInterviewDetail(ids[1], userId)).answers
            .length,
          1,
        );
      },
    );

    await t.test(
      "a newly constructed service replays the saved turn without another model call",
      async () => {
        const id = await createInterview();
        const input = turn(id);
        input.projectContext = {
          ...project,
          commitSha: "a".repeat(40),
          manifest: [{ path: "src/state.ts", sha: "b".repeat(40), size: 42 }],
        };
        input.evaluation.trace = {
          runId: "integration-run",
          commitSha: input.projectContext.commitSha,
          snapshot: "pinned",
          outcome: "completed",
          durationMs: 20,
          modelCalls: 2,
          promptTokens: 10,
          completionTokens: 5,
          filesRead: ["src/state.ts"],
          tools: [
            {
              name: "read_file",
              status: "ok",
              durationMs: 1,
              outputCharacters: 42,
              path: "src/state.ts",
            },
          ],
        };
        const before = await store.getInterviewState(id, userId);
        assert.deepEqual(before.projectContext, project);
        assert.deepEqual(before.questions, [question]);
        await store.recordAnswer(input);
        const state = await store.getInterviewState(id, userId);
        assert.equal(state.currentQuestion, 1);
        assert.equal(state.status, "COMPLETED");
        assert.deepEqual(state.projectContext, input.projectContext);
        const restarted = new AgentService(
          {
            getProjectContext() {
              throw new Error("Replay should not retrieve code.");
            },
          },
          {
            enabled: true,
            complete() {
              throw new Error("Replay should not call the model.");
            },
          },
          new ReportStore(competingClient),
        );
        const replay = await restarted.evaluateAnswer(
          id,
          input.answer,
          userId,
          question.id,
        );
        assert.deepEqual(replay, input.evaluation);
        assert.equal(
          await store.getRecordedAnswer(id, "another-user", question.id),
          null,
        );
        assert.equal(await store.getInterviewState(id, "another-user"), null);
      },
    );

    await t.test(
      "concurrent transactions commit exactly one answer and both return the winner",
      async () => {
        const id = await createInterview();
        const results = await Promise.all([
          store.recordAnswer(turn(id, 6)),
          new ReportStore(competingClient).recordAnswer(turn(id, 8)),
        ]);
        assert.deepEqual(results[0], results[1]);
        assert.ok([6, 8].includes(results[0].score));
        const answers = await prisma.interviewAnswer.findMany({
          where: { interviewId: id },
        });
        assert.equal(answers.length, 1);
        assert.deepEqual(answers[0].evaluation, results[0]);
        const changedAnswer = { ...turn(id), answer: "different answer" };
        await assert.rejects(
          store.recordAnswer(changedAnswer),
          (error) => error.getStatus?.() === 409,
        );
      },
    );

    await t.test(
      "a database insert failure rolls back the progress and completion update",
      async () => {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${schema}"."interview_answers" ADD CONSTRAINT "integration_nonnegative_score" CHECK (score >= 0)`,
        );
        const id = await createInterview();
        await assert.rejects(store.recordAnswer(turn(id, -1)));
        const state = await store.getInterviewState(id, userId);
        assert.equal(state.currentQuestion, 0);
        assert.equal(state.status, "IN_PROGRESS");
        assert.equal(
          await prisma.interviewAnswer.count({ where: { interviewId: id } }),
          0,
        );
        assert.equal(
          (await store.getActiveInterview(project.id, userId)).interviewId,
          id,
        );
      },
    );

    await t.test(
      "durable drafts survive scoring failure and retry only the scorer after restart",
      async () => {
        const {
          EvaluationStore,
        } = require("../../dist/agent/evaluation.store.js");
        const {
          EvaluationWorker,
        } = require("../../dist/agent/evaluation.worker.js");
        const { ScoringFailure } = require("../../dist/agent/rubric-scorer.js");
        const {
          CRITERIA,
          validateRubric,
        } = require("../../dist/agent/rubric.js");
        const id = await createInterview();
        const runs = new EvaluationStore(prisma, store);
        const other = new EvaluationStore(
          competingClient,
          new ReportStore(competingClient),
        );
        const submissions = await Promise.all([
          runs.submit(id, userId, question.id, "已保存的回答", "fixture-model"),
          other.submit(
            id,
            userId,
            question.id,
            "已保存的回答",
            "fixture-model",
          ),
        ]);
        assert.equal(submissions[0].id, submissions[1].id);
        assert.equal(
          (await store.getInterviewState(id, userId)).currentQuestion,
          0,
        );
        await assert.rejects(
          runs.submit(id, userId, question.id, "改写回答", "fixture-model"),
          (e) => e.getStatus() === 409,
        );
        await assert.rejects(
          runs.get(submissions[0].id, "another-user"),
          (e) => e.getStatus() === 404,
        );
        let retrievalCalls = 0;
        const model = {
          enabled: true,
          modelId: "fixture-model",
          async complete() {
            retrievalCalls++;
            return { content: '{"ready":true}' };
          },
        };
        const worker = new EvaluationWorker(
          runs,
          {
            readSnapshotFile() {
              throw Error("no extra reads");
            },
          },
          model,
          {},
        );
        const claims = await Promise.all([runs.claim(), other.claim()]);
        assert.equal(claims.filter(Boolean).length, 1);
        await worker.process(claims.find(Boolean));
        const snapshot = await prisma.evaluationRun.findUnique({
          where: { id: submissions[0].id },
        });
        assert.equal(snapshot.status, "SCORING_PENDING");
        assert.ok(snapshot.evidence.items[0].id);
        assert.equal(retrievalCalls, 1);
        let scoringCalls = 0;
        const failedWorker = new EvaluationWorker(
          runs,
          {},
          { enabled: true, modelId: "fixture-model" },
          {
            async score() {
              scoringCalls++;
              throw new ScoringFailure("SCORER_TRANSPORT_ERROR");
            },
          },
        );
        await failedWorker.process(await runs.claim());
        assert.equal((await runs.get(snapshot.id, userId)).phase, "scoring");
        assert.equal((await runs.get(snapshot.id, userId)).status, "failed");
        assert.equal(
          (await store.getInterviewState(id, userId)).currentQuestion,
          0,
        );
        assert.equal(
          await prisma.interviewAnswer.count({ where: { interviewId: id } }),
          0,
        );
        await other.retry(snapshot.id, userId);
        const restarted = new EvaluationWorker(
          other,
          {
            readSnapshotFile() {
              throw Error("scoring retry must not retrieve");
            },
          },
          {
            enabled: true,
            modelId: "fixture-model",
            complete() {
              throw Error("retrieval must not run");
            },
          },
          {
            async score(input) {
              scoringCalls++;
              assert.deepEqual(input.evidence, snapshot.evidence);
              return {
                rubric: validateRubric(
                  {
                    verdict: "partial",
                    criteria: CRITERIA.map((c) => ({
                      key: c.key,
                      score: 2,
                      reason: "结合代码分析",
                      evidenceIds: [input.evidence.items[0].id],
                    })),
                  },
                  input.evidence,
                ),
                scoring: {
                  model: "fixture-model",
                  durationMs: 1,
                  promptTokens: 1,
                  completionTokens: 1,
                },
              };
            },
          },
        );
        await restarted.process(await other.claim());
        const completed = await runs.get(snapshot.id, userId);
        assert.equal(completed.status, "completed");
        assert.equal(completed.evaluation.score, 5);
        assert.equal(completed.attempts.evidence, 1);
        assert.equal(completed.attempts.scoring, 2);
        assert.equal(retrievalCalls, 1);
        assert.equal(scoringCalls, 2);
        assert.equal(
          (await store.getInterviewState(id, userId)).status,
          "COMPLETED",
        );
        assert.deepEqual(
          (
            await other.submit(
              id,
              userId,
              question.id,
              "已保存的回答",
              "fixture-model",
            )
          ).evaluation,
          completed.evaluation,
        );
        assert.deepEqual(
          (
            await prisma.evaluationRun.findUnique({
              where: { id: snapshot.id },
            })
          ).evidence,
          snapshot.evidence,
        );
      },
    );

    await t.test(
      "expired leases fence stale workers and completion rollback retains the scoring checkpoint",
      async () => {
        const {
          EvaluationStore,
          LeaseLostError,
        } = require("../../dist/agent/evaluation.store.js");
        const { createEvidenceBundle } = require("../../dist/agent/rubric.js");
        const runs = new EvaluationStore(prisma, store);
        const id = await createInterview();
        const view = await runs.submit(
          id,
          userId,
          question.id,
          "lease answer",
          "fixture-model",
        );
        const stale = await runs.claim();
        assert.ok((await runs.nextLeaseDelay()) > 0);
        await prisma.evaluationRun.update({
          where: { id: view.id },
          data: { leaseExpiresAt: new Date(Date.now() - 1000) },
        });
        assert.equal(await runs.nextLeaseDelay(), 250);
        const replacement = await new EvaluationStore(
          competingClient,
          new ReportStore(competingClient),
        ).claim();
        assert.notEqual(replacement.leaseToken, stale.leaseToken);
        await assert.rejects(
          runs.checkpointEvidence(
            stale,
            project,
            createEvidenceBundle(project, question),
          ),
          (e) => e instanceof LeaseLostError,
        );
        await runs.checkpointEvidence(
          replacement,
          project,
          createEvidenceBundle(project, question),
        );
        assert.equal(await runs.nextLeaseDelay(), 50);
        const scoring = await runs.claim();
        const beforeCommit = (await runs.get(view.id, userId)).lastEventSeq;
        await assert.rejects(
          runs.complete(scoring, turn(id, -1).evaluation, [question], project),
        );
        assert.equal(
          (await prisma.evaluationRun.findUnique({ where: { id: view.id } }))
            .status,
          "SCORING_RUNNING",
        );
        assert.equal(
          (await store.getInterviewState(id, userId)).currentQuestion,
          0,
        );
        assert.equal(
          await prisma.interviewAnswer.count({ where: { interviewId: id } }),
          0,
        );
        assert.equal(
          (await runs.get(view.id, userId)).lastEventSeq,
          beforeCommit,
        );
        assert.equal(
          await prisma.evaluationEvent.count({
            where: { runId: view.id, type: "evaluation.finished" },
          }),
          0,
        );
        await runs.fail(scoring, "TEST_FINISHED");
        assert.equal(await runs.nextLeaseDelay(), undefined);
      },
    );

    await t.test(
      "stage attempts are bounded and failed drafts cannot be edited or retried by another user",
      async () => {
        const {
          EvaluationStore,
        } = require("../../dist/agent/evaluation.store.js");
        const { createEvidenceBundle } = require("../../dist/agent/rubric.js");
        const id = await createInterview();
        const runs = new EvaluationStore(prisma, store);
        const view = await runs.submit(
          id,
          userId,
          question.id,
          "immutable",
          "fixture-model",
        );
        await runs.checkpointEvidence(
          await runs.claim(),
          project,
          createEvidenceBundle(project, question),
        );
        for (let attempt = 1; attempt <= 3; attempt++) {
          const run = await runs.claim();
          assert.equal(run.scoringAttempts, attempt);
          await runs.fail(run, "SCORER_TRANSPORT_ERROR");
          if (attempt < 3) await runs.retry(view.id, userId);
        }
        assert.equal((await runs.get(view.id, userId)).retryable, false);
        await assert.rejects(
          runs.retry(view.id, userId),
          (e) => e.getStatus() === 409,
        );
        await assert.rejects(
          runs.retry(view.id, "another-user"),
          (e) => e.getStatus() === 404,
        );
        assert.equal(await runs.claim(), null);
        assert.equal(
          (await store.getInterviewState(id, userId)).currentQuestion,
          0,
        );
      },
    );

    await t.test(
      "partial rubric judgments stay visible and do not become demo or comparable scores",
      async () => {
        const id = await createInterview();
        const input = turn(id);
        input.evaluation.score = null;
        await store.recordAnswer(input);
        const detail = await store.getInterviewDetail(id, userId);
        assert.equal(detail.answers[0].score, null);
        assert.equal(detail.scoredQuestions, 0);
        assert.equal(detail.demoQuestions, 0);
        assert.equal(detail.unjudgedQuestions, 1);
      },
    );
    await t.test(
      "event sequences remain continuous under concurrent writes and cursor replay",
      async () => {
        const {
          EvaluationStore,
          LeaseLostError,
        } = require("../../dist/agent/evaluation.store");
        const {
          EvaluationStreamService,
        } = require("../../dist/agent/evaluation-stream.service");
        const { createEvidenceBundle } = require("../../dist/agent/rubric");
        const runs = new EvaluationStore(prisma, store);
        const id = await createInterview();
        const draft = await runs.submit(
          id,
          userId,
          question.id,
          "event fixture",
          "fixture-model",
        );
        assert.equal(
          (
            await runs.submit(
              id,
              userId,
              question.id,
              "event fixture",
              "fixture-model",
            )
          ).lastEventSeq,
          1,
        );
        const run = await runs.claim();
        await Promise.all(
          Array.from({ length: 8 }, (_, step) =>
            runs.progress(run, "tool.finished", { step, status: "ok" }),
          ),
        );
        // Synthetic long event history verifies page boundaries without model calls.
        for (let step = 0; step < 100; step++)
          await runs.progress(run, "model.finished", { step });
        await runs.checkpointEvidence(
          run,
          project,
          createEvidenceBundle(project, question),
        );
        const scoring = await runs.claim();
        await runs.complete(scoring, turn(id).evaluation, [question], project);
        const streams = new EvaluationStreamService(competingClient, {});
        const first = await streams.list(run.id, userId, 0);
        assert.equal(first.events.length, 100);
        assert.equal(first.hasMore, true);
        const second = await streams.list(run.id, userId, first.next);
        const all = [...first.events, ...second.events];
        assert.deepEqual(
          all.map((e) => e.sequence),
          Array.from({ length: all.length }, (_, i) => i + 1),
        );
        assert.equal(all.at(-1).type, "evaluation.finished");
        assert.equal(second.hasMore, false);
        const resumed = await streams.list(run.id, userId, 5);
        assert.equal(resumed.events[0].sequence, 6);
        await assert.rejects(
          streams.list(run.id, "other-user", 0),
          (e) => e.getStatus() === 404,
        );
        await assert.rejects(
          runs.progress(run, "tool.finished", {}),
          (e) => e instanceof LeaseLostError,
        );
      },
    );

    await t.test(
      "training memory cites real evidence, adapts a new session, and clear fences pre-clear tasks",
      async () => {
        const {
          EvaluationStore,
        } = require("../../dist/agent/evaluation.store");
        const {
          TrainingMemoryStore,
        } = require("../../dist/agent/training-memory.store");
        const {
          createEvidenceBundle,
          validateRubric,
          CRITERIA,
        } = require("../../dist/agent/rubric");
        const memory = new TrainingMemoryStore(prisma);
        await memory.clear(userId);
        const runs = new EvaluationStore(prisma, store);
        async function prepared(answer) {
          const id = await createInterview();
          const draft = await runs.submit(
            id,
            userId,
            question.id,
            answer,
            "fixture-model",
          );
          const evidence = createEvidenceBundle(project, question);
          await runs.checkpointEvidence(await runs.claim(), project, evidence);
          const scoring = await runs.claim();
          const rubric = validateRubric(
            {
              verdict: "partial",
              criteria: CRITERIA.map((c, i) => ({
                key: c.key,
                score: i === 0 ? null : 1,
                reason: "可追溯的练习边界",
                evidenceIds: [evidence.items[0].id],
              })),
            },
            evidence,
          );
          return {
            id,
            draft,
            scoring,
            evaluation: {
              ...turn(id).evaluation,
              score: null,
              rubric,
              evidence,
            },
          };
        }
        const first = await prepared("memory fixture");
        await runs.complete(
          first.scoring,
          first.evaluation,
          [question],
          project,
        );
        const saved = await memory.get(project.id, userId);
        assert.equal(saved.observations.length, 3);
        assert.equal(saved.focus.length, 3);
        assert.equal(saved.observations[0].source.interviewId, first.id);
        assert.deepEqual(saved.observations[0].source.paths, [
          question.contextPath,
        ]);
        assert.equal(
          (await memory.get(project.id, "other-user")).observations.length,
          0,
        );
        assert.equal(
          (await memory.get("another-project", userId)).observations.length,
          0,
        );
        const agent = new AgentService(
          {
            async getProjectContext() {
              return project;
            },
          },
          { enabled: false },
          store,
          memory,
        );
        const adapted = await agent.startInterview(
          project.id,
          "JD",
          undefined,
          userId,
        );
        assert.ok(adapted.practiceFocus.length);
        assert.match(adapted.question.prompt, /本次重点练习/);
        assert.equal(adapted.question.difficulty, "基础");
        const pending = await prepared("clear during scoring");
        const clearing = await memory.clear(userId);
        assert.equal(clearing.cleared, 3);
        await runs.complete(
          pending.scoring,
          pending.evaluation,
          [question],
          project,
        );
        assert.equal(
          (await memory.get(project.id, userId)).observations.length,
          0,
        );
        assert.equal(
          (await store.getInterviewDetail(first.id, userId)).answers.length,
          1,
        );
        const fresh = await prepared("fresh epoch");
        await runs.complete(
          fresh.scoring,
          fresh.evaluation,
          [question],
          project,
        );
        assert.equal(
          (await memory.get(project.id, userId)).observations.length,
          3,
        );
        // A later strong result changes practice history only in the same dimension.
        const strong = await prepared("later practice");
        strong.evaluation.rubric.criteria.forEach((c) => {
          if (c.score !== null) c.score = 4;
        });
        await runs.complete(
          strong.scoring,
          strong.evaluation,
          [question],
          project,
        );
        const practiced = await memory.get(project.id, userId);
        assert.equal(practiced.focus.length, 0);
        assert.equal(practiced.practiced, 3);
        await memory.clear(userId);
      },
    );
  },
);
