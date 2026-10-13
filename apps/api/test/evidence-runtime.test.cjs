const assert = require("node:assert/strict");
const test = require("node:test");
const { EvidenceRuntime } = require("../dist/agent/evidence-runtime.js");
const { EvidenceToolSession } = require("../dist/agent/evidence-tools.js");
const { AgentService } = require("../dist/agent/agent.service.js");
const {
  planInterviewQuestions,
  restoreProjectContext,
} = require("../dist/agent/interview-planner.js");

const sha = "a".repeat(40);
const project = {
  id: "github-example-repo",
  name: "repo",
  url: "https://github.com/example/repo",
  stack: ["React"],
  readmePreview: "Pinned fixture",
  files: [
    {
      path: "src/App.tsx",
      size: 50,
      language: "TSX",
      snippet: "export const App = () => fetch('/items');",
    },
  ],
  commitSha: sha,
  manifest: [
    "src/App.tsx",
    "src/lib/request.ts",
    "src/lib/errors.ts",
    "src/lib/state.ts",
  ].map((path) => ({ path, sha, size: 100 })),
  treeTruncated: false,
};
function call(name, args, id = name) {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: typeof args === "string" ? args : JSON.stringify(args),
    },
  };
}
function source(path) {
  return {
    path,
    size: 100,
    language: "TypeScript",
    snippet:
      "export async function request() {\n  try { return await fetch('/items'); }\n  catch (error) { throw new Error('request failed'); }\n}",
  };
}
function session(
  snapshot = project,
  github = { readSnapshotFile: async (_project, path) => source(path) },
) {
  return new EvidenceToolSession(
    snapshot,
    github,
    new AbortController().signal,
  );
}

test("a tool loop discovers and reads a file outside the initial context", async () => {
  let requests = 0;
  const github = {
    async readSnapshotFile(snapshot, path) {
      requests++;
      assert.equal(snapshot.commitSha, sha);
      assert.equal(path, "src/lib/request.ts");
      return source(path);
    },
  };
  let rounds = 0;
  const runtime = new EvidenceRuntime(
    {
      async complete(messages, options) {
        assert.equal(options.tools.length, 3);
        rounds++;
        if (rounds === 1)
          return {
            content: "",
            toolCalls: [call("search_code", { query: "request" }, "search-1")],
          };
        if (rounds === 2) {
          assert.match(messages.at(-1).content, /src\/lib\/request.ts/);
          return {
            content: "",
            toolCalls: [
              call(
                "read_file",
                { path: "src/lib/request.ts", startLine: 1, endLine: 4 },
                "read-1",
              ),
            ],
          };
        }
        const observation = JSON.parse(messages.at(-1).content);
        assert.equal(observation.status, "ok");
        assert.match(observation.snippet, /request failed/);
        assert.equal(messages.at(-1).tool_call_id, "read-1");
        return {
          content: '{"score":8}',
          usage: { prompt_tokens: 80, completion_tokens: 8 },
        };
      },
    },
    github,
  );
  const result = await runtime.run(project, [
    { role: "user", content: "Explain error handling" },
  ]);
  assert.equal(requests, 1);
  assert.equal(result.trace.outcome, "completed");
  assert.equal(result.trace.modelCalls, 3);
  assert.equal(result.trace.promptTokens, 80);
  assert.deepEqual(
    result.trace.tools.map((item) => item.status),
    ["ok", "ok"],
  );
  assert.deepEqual(result.trace.filesRead, ["src/lib/request.ts"]);
  assert.equal(
    project.files.length,
    1,
    "The original snapshot must not mutate.",
  );
  assert.equal(result.project.files.length, 2);
});

test("unregistered tools and unsafe or excluded paths cannot fetch anything", async () => {
  let reads = 0;
  const tools = session(project, {
    async readSnapshotFile() {
      reads++;
      throw new Error("should not read");
    },
  });
  for (const request of [
    call("shell", { command: "whoami" }),
    ...[
      "../secret",
      "C:/data",
      "https://example.com/a.ts",
      "src\\a.ts",
      ".env",
      "secrets.json",
      "node_modules/a.ts",
      "src/%2e%2e/a.ts",
    ].map((path) => call("read_file", { path })),
  ]) {
    assert.equal(JSON.parse(await tools.execute(request)).status, "denied");
  }
  assert.equal(reads, 0);
});

test("malformed JSON, additional arguments, and oversized line ranges are rejected", async () => {
  const tools = session();
  for (const request of [
    call("search_code", "not-json"),
    call("search_code", []),
    call("search_code", { query: "" }),
    call("search_code", { query: "x", url: "https://evil" }),
    call("read_file", { path: "src/App.tsx", startLine: 2, endLine: 200 }),
    call("read_file", { path: "src/App.tsx", startLine: "1" }),
  ]) {
    assert.equal(
      JSON.parse(await tools.execute(request)).status,
      "invalid-arguments",
    );
  }
});

test("search reports its incomplete coverage instead of claiming global absence", async () => {
  const tools = session({ ...project, treeTruncated: true });
  const result = JSON.parse(
    await tools.execute(call("search_code", { query: "nonexistent" })),
  );
  assert.equal(result.status, "no-match-in-loaded-content");
  assert.equal(result.scope, "indexed-paths-and-loaded-prefixes");
  assert.equal(result.indexTruncated, true);
  assert.equal(result.loadedFiles, 1);
  const missing = JSON.parse(
    await tools.execute(call("read_file", { path: "src/not-indexed.ts" })),
  );
  assert.equal(missing.status, "not-indexed");
  assert.equal(missing.indexTruncated, true);
});

test("legacy snapshots allow saved files and decline new remote reads", async () => {
  const tools = session({
    ...project,
    commitSha: undefined,
    manifest: undefined,
  });
  assert.equal(
    JSON.parse(await tools.execute(call("read_file", { path: "src/App.tsx" })))
      .status,
    "ok",
  );
  assert.equal(
    JSON.parse(
      await tools.execute(call("read_file", { path: "src/lib/request.ts" })),
    ).status,
    "legacy-snapshot",
  );
});

test("remote reads are cached within a turn and capped at two new files", async () => {
  let reads = 0;
  const tools = session(project, {
    async readSnapshotFile(_project, path) {
      reads++;
      return source(path);
    },
  });
  for (const path of [
    "src/lib/request.ts",
    "src/lib/request.ts",
    "src/lib/errors.ts",
  ])
    assert.equal(
      JSON.parse(await tools.execute(call("read_file", { path }))).status,
      "ok",
    );
  assert.equal(
    JSON.parse(
      await tools.execute(call("read_file", { path: "src/lib/state.ts" })),
    ).status,
    "read-budget",
  );
  assert.equal(reads, 2);
});

test("tool network failure is an observation and the model can finish with limited evidence", async () => {
  let rounds = 0;
  const runtime = new EvidenceRuntime(
    {
      async complete(messages) {
        if (rounds++ === 0)
          return {
            content: "",
            toolCalls: [call("read_file", { path: "src/lib/request.ts" })],
          };
        assert.equal(JSON.parse(messages.at(-1).content).status, "read-failed");
        return { content: "Evidence unavailable" };
      },
    },
    {
      async readSnapshotFile() {
        throw new Error(
          "Network failure containing a secret must not enter observations",
        );
      },
    },
  );
  const result = await runtime.run(project, [
    { role: "user", content: "test" },
  ]);
  assert.equal(result.trace.outcome, "completed");
  assert.equal(result.trace.tools[0].status, "read-failed");
  assert.deepEqual(result.trace.filesRead, []);
  assert.ok(!JSON.stringify(result).includes("containing a secret"));
});

test("after six requests the runtime forces a final response and never executes extras", async () => {
  let rounds = 0;
  const runtime = new EvidenceRuntime(
    {
      async complete(_messages, options) {
        rounds++;
        if (rounds === 1)
          return {
            content: "",
            toolCalls: Array.from({ length: 8 }, (_, i) =>
              call("search_code", { query: "App" }, `call-${i}`),
            ),
          };
        assert.equal(options.toolChoice, "none");
        assert.equal(options.jsonOutput, true);
        assert.match(_messages.at(-1).content, /系统要求的最终 JSON/);
        return {
          content: "",
          toolCalls: [call("read_file", { path: "src/App.tsx" })],
        };
      },
    },
    {
      async readSnapshotFile() {
        throw new Error("should not read");
      },
    },
  );
  const result = await runtime.run(project, [
    { role: "user", content: "test" },
  ]);
  assert.equal(result.trace.outcome, "budget-exhausted");
  assert.equal(result.content, null);
  assert.equal(result.trace.modelCalls, 2);
  assert.equal(
    result.trace.tools.filter((tool) => tool.status === "ok").length,
    6,
  );
  assert.equal(
    result.trace.tools.filter((tool) => tool.status === "tool-budget").length,
    2,
  );
});

test("endless tool rounds stop after four model calls", async () => {
  const runtime = new EvidenceRuntime(
    {
      async complete() {
        return {
          content: "",
          toolCalls: [call("search_code", { query: "App" })],
        };
      },
    },
    { readSnapshotFile() {} },
  );
  const result = await runtime.run(project, []);
  assert.equal(result.trace.modelCalls, 4);
  assert.equal(result.trace.tools.length, 3);
  assert.equal(result.trace.outcome, "budget-exhausted");
});

test(
  "the whole run deadline aborts a provider call and preserves a trace",
  { timeout: 2000 },
  async () => {
    const runtime = new EvidenceRuntime(
      {
        complete(_messages, options) {
          return new Promise((_resolve, reject) =>
            options.signal.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            ),
          );
        },
      },
      { readSnapshotFile() {} },
    );
    const result = await runtime.run(project, [], 20);
    assert.equal(result.trace.outcome, "budget-exhausted");
    assert.equal(result.trace.modelCalls, 1);
  },
);

test("a truncated prefix distinguishes an unavailable range from an empty file", async () => {
  const tools = session({
    ...project,
    files: [{ ...project.files[0], truncated: true }],
  });
  const result = JSON.parse(
    await tools.execute(
      call("read_file", { path: "src/App.tsx", startLine: 50, endLine: 60 }),
    ),
  );
  assert.equal(result.status, "outside-loaded-prefix");
  assert.deepEqual([...tools.filesRead], []);
});

test("escaped code still respects serialized observation and cumulative output limits", async () => {
  const tools = session({
    ...project,
    files: [{ ...project.files[0], snippet: '"'.repeat(3500) }],
  });
  let total = 0;
  let exhausted = false;
  for (let i = 0; i < 8; i++) {
    const content = await tools.execute(
      call("read_file", { path: "src/App.tsx" }),
    );
    const observation = JSON.parse(content);
    assert.ok(content.length <= 5000);
    total += observation.status === "output-budget" ? 0 : content.length;
    exhausted ||= observation.status === "output-budget";
  }
  assert.ok(total <= 20000);
  assert.ok(exhausted);
});

test("follow-up evidence and fetched context are committed together and restored", async () => {
  let round = 0;
  let committed;
  const questions = planInterviewQuestions(project);
  const service = new AgentService(
    {
      async readSnapshotFile(_snapshot, path) {
        return source(path);
      },
    },
    {
      enabled: true,
      async complete() {
        if (round++ === 0)
          return {
            content: "",
            toolCalls: [call("read_file", { path: "src/lib/request.ts" })],
          };
        return {
          content: JSON.stringify({
            score: 8,
            strengths: ["状态清晰"],
            improvements: ["补充超时边界"],
            nextQuestion: {
              prompt: "解释 request 的异常边界",
              contextPath: "src/lib/request.ts",
              dimension: "engineering",
              difficulty: "深入",
              evidence: { snippet: "fabricated source" },
            },
          }),
        };
      },
    },
    {
      async getRecordedAnswer() {
        return null;
      },
      async getInterviewState() {
        return {
          id: "interview-fixture",
          projectId: project.id,
          currentQuestion: 0,
          status: "IN_PROGRESS",
          jobDescription: "FE",
          questions,
          projectContext: project,
        };
      },
      async recordAnswer(input) {
        committed = input;
        return input.evaluation;
      },
    },
  );
  const result = await service.evaluateAnswer(
    "interview-fixture",
    "说明错误恢复边界",
    "user",
    questions[0].id,
  );
  assert.equal(result.provider, "deepseek");
  assert.equal(result.nextQuestion.contextPath, "src/lib/request.ts");
  assert.match(result.nextQuestion.evidence.snippet, /request failed/);
  assert.ok(!result.nextQuestion.evidence.snippet.includes("fabricated"));
  assert.equal(restoreProjectContext(committed.projectContext).commitSha, sha);
  assert.equal(committed.projectContext.files.length, 2);
  assert.equal(committed.evaluation.trace.tools[0].status, "ok");
});
