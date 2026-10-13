const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { PrismaClient } = require("@prisma/client");

test(
  "HTTP acceptance: auth, durable grading, SSE and training memory",
  { timeout: 120000 },
  async (t) => {
    assert.ok(
      process.env.TEST_DATABASE_URL,
      "Set TEST_DATABASE_URL explicitly; the test creates only a random schema.",
    );
    const target = new URL(process.env.TEST_DATABASE_URL);
    assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
    const schema = `repocoach_http_${randomUUID().replaceAll("-", "")}`;
    assert.match(schema, /^repocoach_http_[0-9a-f]{32}$/);
    const admin = new PrismaClient({
      datasourceUrl: target.toString(),
      log: [],
    });
    const previousEnv = { ...process.env };
    const originalFetch = global.fetch;
    let created = false;
    let app;
    let base;
    let prisma;
    t.after(async () => {
      try {
        if (app) await app.close();
        if (created)
          await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.$disconnect();
        global.fetch = originalFetch;
        for (const key of Object.keys(process.env))
          if (!(key in previousEnv)) delete process.env[key];
        Object.assign(process.env, previousEnv);
      }
    });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    target.searchParams.set("schema", schema);
    target.searchParams.set("connection_limit", "5");
    const databaseUrl = target.toString();
    const apiRoot = resolve(__dirname, "../..");
    const migrated = spawnSync(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        "prisma/schema.prisma",
      ],
      {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: "utf8",
        timeout: 45000,
      },
    );
    // Never include the connection string or Prisma stderr in assertion output.
    assert.equal(
      migrated.status,
      0,
      `Migration failed (exit ${migrated.status}).`,
    );
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
      COOKIE_SECURE: "false",
      COOKIE_SAME_SITE: "lax",
      EMAIL_VERIFICATION_REQUIRED: "false",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      GITHUB_TOKEN: "",
      DEEPSEEK_API_KEY: "http-fixture-not-a-real-key",
      DEEPSEEK_MODEL: "fixture-model",
      HTTPS_PROXY: "",
      HTTP_PROXY: "",
      WEB_ORIGIN: "http://localhost:3002",
    });
    // Fail closed if any un-stubbed code tries to contact a model, GitHub or email provider.
    global.fetch = (input, init) => {
      const url = new URL(
        typeof input === "string" ? input : (input.url ?? input.toString()),
      );
      assert.equal(
        url.origin,
        new URL(base).origin,
        "HTTP acceptance must not contact external services.",
      );
      return originalFetch(input, init);
    };
    require("reflect-metadata");
    const { NestFactory } = require("@nestjs/core");
    const { AppModule } = require("../../dist/app.module.js");
    const {
      configureApplication,
    } = require("../../dist/configure-application.js");
    const { PrismaService } = require("../../dist/database/prisma.service.js");
    const { DeepSeekService } = require("../../dist/llm/deepseek.service.js");
    const { GitHubService } = require("../../dist/github/github.service.js");
    const { EmailService } = require("../../dist/auth/email.service.js");
    const project = {
      id: "http-fixture-project",
      name: "http-fixture",
      url: "https://github.com/example/http-fixture",
      stack: ["React", "Next.js", "TypeScript"],
      readmePreview: "Synthetic HTTP acceptance repository",
      commitSha: "a".repeat(40),
      treeTruncated: false,
      files: [
        {
          path: "src/state.ts",
          size: 100,
          language: "TypeScript",
          snippet:
            "export const state = { loading: false };\nexport function reset() { state.loading = false; }",
        },
        {
          path: "src/app/page.tsx",
          size: 80,
          language: "TSX",
          snippet:
            "export default function Page() { return <main>Practice</main>; }",
        },
        {
          path: "src/components/List.tsx",
          size: 80,
          language: "TSX",
          snippet:
            "export function List({ items }) { return items.map(item => <p key={item.id}>{item.name}</p>); }",
        },
      ],
      manifest: [],
    };
    project.manifest = project.files.map((file) => ({
      path: file.path,
      size: file.size,
      sha: "c".repeat(40),
    }));
    const counts = { evidence: 0, scoring: 0, remoteReads: 0 };
    let failScoring = true;
    let modelEnabled = true;
    async function boot() {
      app = await NestFactory.create(AppModule, { logger: false });
      prisma = app.get(PrismaService);
      const model = app.get(DeepSeekService);
      Object.defineProperty(model, "enabled", { get: () => modelEnabled });
      model.complete = async (messages, options) => {
        const input = JSON.parse(
          messages.find((message) => message.role === "user").content,
        );
        if (options.tools) {
          counts.evidence++;
          if (!messages.some((message) => message.role === "tool"))
            return {
              content: "",
              toolCalls: [
                {
                  id: `tool-${counts.evidence}`,
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: JSON.stringify({
                      path: "src/state.ts",
                      startLine: 1,
                      endLine: 2,
                    }),
                  },
                },
              ],
            };
          return {
            content: '{"ready":true}',
            usage: { prompt_tokens: 20, completion_tokens: 5 },
          };
        }
        counts.scoring++;
        if (failScoring) {
          failScoring = false;
          throw new Error("Injected scorer transport failure");
        }
        assert.ok(input.evidence.items.length > 0);
        const insufficient = input.answer.includes("insufficient-fixture");
        return {
          content: JSON.stringify({
            verdict: insufficient ? "insufficient_evidence" : "partial",
            criteria: [
              "correctness",
              "code_evidence",
              "tradeoffs",
              "failure_boundaries",
            ].map((key, i) => ({
              key,
              score: insufficient && i === 0 ? null : [2, 3, 2, 3][i],
              reason: `Controlled fixture for ${key}; this is not a quality evaluation.`,
              evidenceIds: [input.evidence.items[0].id],
            })),
          }),
          usage: { prompt_tokens: 40, completion_tokens: 20 },
        };
      };
      const github = app.get(GitHubService);
      github.analyzePublicRepository = async () => {
        await prisma.projectSnapshot.upsert({
          where: { id: project.id },
          create: project,
          update: project,
        });
        return structuredClone(project);
      };
      github.readSnapshotFile = async () => {
        counts.remoteReads++;
        throw new Error("No remote read expected in this fixture");
      };
      app.get(EmailService).sendVerificationCode = async () => {
        throw new Error("Email must be disabled in this fixture");
      };
      configureApplication(app);
      await app.listen(0, "127.0.0.1");
      base = `${await app.getUrl()}/api/v1`;
    }
    await boot();
    async function request(
      path,
      {
        cookie,
        body,
        method = body === undefined ? "GET" : "POST",
        headers = {},
      } = {},
    ) {
      return fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
    }
    async function json(path, options, status = 200) {
      const response = await request(path, options);
      assert.equal(
        response.status,
        status,
        `${options?.method ?? "request"} ${path}`,
      );
      return response.json();
    }
    async function register(label) {
      const email = `http${randomUUID().replaceAll("-", "").slice(0, 20)}@gmail.com`;
      const password = `fixture-${randomUUID()}`;
      const response = await request("/auth/register", {
        body: { email, password, name: label },
      });
      assert.equal(response.status, 201);
      const cookie = response.headers.get("set-cookie");
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      const result = await response.json();
      assert.equal(result.requiresEmailVerification, false);
      return {
        email,
        password,
        cookie: cookie.split(";")[0],
        user: result.user,
      };
    }
    async function waitRun(id, cookie, expected) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const run = await json(`/interviews/evaluations/${id}`, { cookie });
        if (run.status === expected) return run;
        assert.notEqual(
          run.status,
          expected === "completed" ? "failed" : "completed",
          "Unexpected terminal state",
        );
        await delay(40);
      }
      assert.fail(`Run did not reach ${expected} within 10 seconds`);
    }
    async function frames(id, cookie, after) {
      const response = await request(
        `/interviews/evaluations/${id}/stream?after=0`,
        { cookie, headers: { "Last-Event-ID": String(after) } },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/event-stream/);
      const text = await response.text();
      return text
        .split(/\r?\n\r?\n/)
        .filter((frame) => frame.includes("event: evaluation-event"))
        .map((frame) => ({
          id: Number(frame.match(/^id: (\d+)$/m)[1]),
          data: JSON.parse(frame.match(/^data: (.+)$/m)[1]),
        }));
    }
    let owner;
    let stranger;
    let session;
    let firstRun;
    let firstAnswer;
    let firstQuestion;
    let beforeRetry;
    const completedRuns = [];
    let failed = false;
    async function scenario(name, body) {
      await t.test(name, { skip: failed }, async () => {
        try {
          await body();
        } catch (error) {
          failed = true;
          throw error;
        }
      });
    }
    await scenario(
      "registration, cookie login, validation and CORS use production wiring",
      async () => {
        assert.equal((await json("/health")).status, "ok");
        await json("/interviews/start", { body: {} }, 401);
        owner = await register("HTTP owner");
        stranger = await register("HTTP stranger");
        assert.equal(
          (await json("/auth/me", { cookie: owner.cookie })).user.id,
          owner.user.id,
        );
        await json(
          "/auth/login",
          { body: { email: owner.email, password: "incorrect-password" } },
          401,
        );
        const login = await request("/auth/login", {
          body: { email: owner.email, password: owner.password },
        });
        assert.equal(login.status, 201);
        owner.cookie = login.headers.get("set-cookie").split(";")[0];
        const allowed = await request("/health", {
          headers: { Origin: "http://localhost:3002" },
        });
        assert.equal(
          allowed.headers.get("access-control-allow-origin"),
          "http://localhost:3002",
        );
        assert.equal(
          allowed.headers.get("access-control-allow-credentials"),
          "true",
        );
        const denied = await request("/health", {
          headers: { Origin: "https://untrusted.invalid" },
        });
        assert.equal(denied.headers.get("access-control-allow-origin"), null);
        const preflight = await request("/health", {
          method: "OPTIONS",
          headers: {
            Origin: "http://localhost:3002",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Last-Event-ID",
          },
        });
        assert.equal(preflight.status, 204);
        assert.match(
          preflight.headers.get("access-control-allow-headers"),
          /Last-Event-ID/i,
        );
        await json(
          "/projects/analyze",
          {
            cookie: owner.cookie,
            body: { repoUrl: "invalid", jobDescription: "frontend" },
          },
          400,
        );
        await json(
          "/projects/analyze",
          {
            cookie: owner.cookie,
            body: { repoUrl: project.url, jobDescription: "frontend" },
          },
          201,
        );
        session = await json(
          "/interviews/start",
          { cookie: owner.cookie, body: { projectId: project.id } },
          201,
        );
        assert.equal(session.totalQuestions, 4);
        assert.ok(
          project.files.some(
            (file) => file.path === session.question.contextPath,
          ),
        );
        assert.ok(session.question.evidence.snippet);
      },
    );
    await scenario(
      "submission persists before scoring; failure retains the answer and evidence",
      async () => {
        firstQuestion = session.question;
        firstAnswer =
          "fixture-answer: use state transitions and explain the failure boundaries";
        await json(
          `/interviews/${session.interviewId}/answer`,
          {
            cookie: owner.cookie,
            body: { answer: "  ", questionId: firstQuestion.id },
          },
          400,
        );
        firstRun = await json(
          `/interviews/${session.interviewId}/answer`,
          {
            cookie: owner.cookie,
            body: { answer: firstAnswer, questionId: firstQuestion.id },
          },
          202,
        );
        const failed = await waitRun(firstRun.id, owner.cookie, "failed");
        assert.equal(failed.phase, "scoring");
        assert.equal(failed.failureCode, "SCORER_TRANSPORT_ERROR");
        assert.deepEqual(failed.attempts, { evidence: 1, scoring: 1 });
        assert.equal(failed.answer, firstAnswer);
        assert.equal(
          await prisma.interviewAnswer.count({
            where: { interviewId: session.interviewId },
          }),
          0,
        );
        beforeRetry = await prisma.evaluationRun.findUnique({
          where: { id: firstRun.id },
        });
        assert.ok(beforeRetry.evidence.items.length);
        const active = await json(
          `/interviews/active?projectId=${project.id}`,
          { cookie: owner.cookie },
        );
        assert.equal(active.question.id, firstQuestion.id);
        assert.equal(active.pendingRun.id, firstRun.id);
        assert.equal(active.pendingRun.answer, firstAnswer);
      },
    );
    await scenario(
      "a new application restores the failed phase; retry only grades saved evidence",
      async () => {
        const evidenceCalls = counts.evidence;
        await app.close();
        app = undefined;
        await boot();
        const restored = await json(
          `/interviews/active?projectId=${project.id}`,
          { cookie: owner.cookie },
        );
        assert.equal(restored.pendingRun.id, firstRun.id);
        assert.equal(restored.pendingRun.status, "failed");
        await json(
          `/interviews/evaluations/${firstRun.id}/retry`,
          { cookie: owner.cookie, method: "POST" },
          202,
        );
        firstRun = await waitRun(firstRun.id, owner.cookie, "completed");
        completedRuns.push(firstRun);
        assert.deepEqual(firstRun.attempts, { evidence: 1, scoring: 2 });
        assert.equal(counts.evidence, evidenceCalls);
        assert.equal(counts.scoring, 2);
        const saved = await prisma.evaluationRun.findUnique({
          where: { id: firstRun.id },
        });
        assert.deepEqual(saved.evidence, beforeRetry.evidence);
        assert.deepEqual(saved.trace, beforeRetry.trace);
        assert.equal(firstRun.evaluation.score, 6.1);
      },
    );
    await scenario(
      "event replay honors Last-Event-ID and validates cursors before SSE headers",
      async () => {
        const page = await json(
          `/interviews/evaluations/${firstRun.id}/events`,
          { cookie: owner.cookie },
        );
        const sequences = page.events.map((event) => event.sequence);
        assert.deepEqual(
          sequences,
          Array.from({ length: firstRun.lastEventSeq }, (_, i) => i + 1),
        );
        assert.ok(page.events.some((event) => event.type === "tool.finished"));
        assert.ok(page.events.some((event) => event.type === "run.failed"));
        assert.ok(page.events.some((event) => event.type === "run.retried"));
        assert.equal(page.events.at(-1).type, "evaluation.finished");
        const resumed = await frames(firstRun.id, owner.cookie, 3);
        assert.deepEqual(
          resumed.map((frame) => frame.id),
          sequences.filter((value) => value > 3),
        );
        assert.deepEqual(
          resumed.map((frame) => frame.data),
          page.events.filter((event) => event.sequence > 3),
        );
        for (const suffix of [
          "?after=-1",
          `?after=${firstRun.lastEventSeq + 1}`,
        ]) {
          const response = await request(
            `/interviews/evaluations/${firstRun.id}/stream${suffix}`,
            { cookie: owner.cookie },
          );
          assert.equal(response.status, 400);
          assert.doesNotMatch(
            response.headers.get("content-type"),
            /event-stream/,
          );
        }
      },
    );
    await scenario(
      "repeated answers replay; changed answers and foreign users are rejected",
      async () => {
        const calls = { ...counts };
        const replay = await json(
          `/interviews/${session.interviewId}/answer`,
          {
            cookie: owner.cookie,
            body: { answer: firstAnswer, questionId: firstQuestion.id },
          },
          202,
        );
        assert.deepEqual(replay, firstRun);
        await json(
          `/interviews/${session.interviewId}/answer`,
          {
            cookie: owner.cookie,
            body: { answer: "changed", questionId: firstQuestion.id },
          },
          409,
        );
        for (const suffix of ["", "/events", "/stream"])
          await json(
            `/interviews/evaluations/${firstRun.id}${suffix}`,
            { cookie: stranger.cookie },
            404,
          );
        await json(
          `/interviews/evaluations/${firstRun.id}/retry`,
          { cookie: stranger.cookie, method: "POST" },
          404,
        );
        await json(
          `/reports/interviews/${session.interviewId}`,
          { cookie: stranger.cookie },
          404,
        );
        await json(
          `/interviews/${session.interviewId}/answer`,
          {
            cookie: stranger.cookie,
            body: { answer: firstAnswer, questionId: firstQuestion.id },
          },
          404,
        );
        assert.deepEqual(counts, calls);
      },
    );
    await scenario(
      "four turns complete; nullable and demo scores do not enter capability averages",
      async () => {
        let current = firstRun.evaluation;
        for (let number = 2; number <= 4; number++) {
          modelEnabled = number !== 4;
          const answer =
            number === 3 ? "insufficient-fixture" : `fixture-answer-${number}`;
          const run = await json(
            `/interviews/${session.interviewId}/answer`,
            {
              cookie: owner.cookie,
              body: { answer, questionId: current.nextQuestion.id },
            },
            202,
          );
          const finished = await waitRun(run.id, owner.cookie, "completed");
          completedRuns.push(finished);
          current = finished.evaluation;
          if (number === 3) {
            assert.equal(current.score, null);
            assert.equal(current.rubric.judgedCriteria, 3);
          }
          if (number === 4) {
            assert.equal(current.provider, "local-mock");
            assert.equal(current.score, null);
            assert.equal(current.rubric, undefined);
          }
        }
        assert.equal(current.completed, true);
        assert.equal(
          await json(`/interviews/active?projectId=${project.id}`, {
            cookie: owner.cookie,
          }),
          null,
        );
        const history = await json(
          `/reports/interviews/${session.interviewId}`,
          { cookie: owner.cookie },
        );
        assert.equal(history.answers.length, 4);
        assert.equal(history.scoredQuestions, 2);
        assert.equal(history.unjudgedQuestions, 1);
        assert.equal(history.demoQuestions, 1);
        assert.equal(history.averageScore, 6.1);
        assert.deepEqual(
          history.answers.map((answer) => answer.runId),
          completedRuns.map((run) => run.id),
        );
        const report = await json(`/reports/projects/${project.id}`, {
          cookie: owner.cookie,
        });
        assert.equal(report.completedInterviews, 1);
        assert.equal(report.averageScore, 6.1);
        assert.equal(report.answeredQuestions, 4);
        assert.equal(report.scoredQuestions, 2);
        assert.equal(report.unjudgedQuestions, 1);
        assert.equal(report.demoQuestions, 1);
      },
    );
    await scenario(
      "memory has evidence sources, adapts new practice, isolates users and clears without deleting history",
      async () => {
        modelEnabled = true;
        const memory = await json(`/training-memory?projectId=${project.id}`, {
          cookie: owner.cookie,
        });
        assert.equal(memory.observations.length, 11);
        assert.ok(memory.focus.length);
        assert.ok(
          memory.observations.every(
            (item) =>
              item.source.evidenceIds.length &&
              item.source.paths.length &&
              item.source.commitSha === project.commitSha,
          ),
        );
        assert.ok(
          memory.observations.every(
            (item) => item.source.runId !== completedRuns[3].id,
          ),
        );
        const isolated = await json(
          `/training-memory?projectId=${project.id}`,
          { cookie: stranger.cookie },
        );
        assert.equal(isolated.observations.length, 0);
        const practice = await json(
          "/interviews/start",
          { cookie: owner.cookie, body: { projectId: project.id } },
          201,
        );
        assert.ok(practice.practiceFocus.length);
        assert.ok(practice.practiceFocus.length <= 2);
        assert.equal(practice.question.difficulty, "进阶");
        await json(
          "/training-memory/clear",
          { cookie: owner.cookie, method: "POST" },
          201,
        );
        const cleared = await json(`/training-memory?projectId=${project.id}`, {
          cookie: owner.cookie,
        });
        assert.equal(cleared.observations.length, 0);
        assert.equal(cleared.focus.length, 0);
        assert.equal(
          (
            await json(`/reports/interviews/${session.interviewId}`, {
              cookie: owner.cookie,
            })
          ).answers.length,
          4,
        );
        assert.equal(
          (
            await json(`/interviews/active?projectId=${project.id}`, {
              cookie: owner.cookie,
            })
          ).question.id,
          practice.question.id,
        );
      },
    );
    await scenario(
      "logout revokes access to state, events and memory",
      async () => {
        await json(
          "/auth/logout",
          { cookie: owner.cookie, method: "POST" },
          201,
        );
        for (const path of [
          "/auth/me",
          `/interviews/evaluations/${firstRun.id}`,
          `/interviews/evaluations/${firstRun.id}/stream`,
          `/training-memory?projectId=${project.id}`,
        ]) {
          await json(path, { cookie: owner.cookie }, 401);
        }
        assert.equal(counts.remoteReads, 0);
      },
    );
  },
);
