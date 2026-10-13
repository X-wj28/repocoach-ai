const assert = require("node:assert/strict");
const test = require("node:test");
const { AgentService } = require("../dist/agent/agent.service.js");
const {
  planInterviewQuestions,
  selectEvidenceContext,
} = require("../dist/agent/interview-planner.js");

const project = {
  id: "github-user-project",
  name: "project",
  url: "https://github.com/user/project",
  stack: ["Next.js", "React"],
  readmePreview: "Original training snapshot",
  files: [
    {
      path: "app/page.tsx",
      size: 100,
      language: "TSX",
      snippet:
        "'use client';\n// original source\nconst data = fetch('/api/items');\nexport default function Page() {}",
    },
    {
      path: "components/Cart.tsx",
      size: 100,
      language: "TSX",
      snippet: "const [cart, setCart] = useState([]);",
    },
    {
      path: "components/List.tsx",
      size: 100,
      language: "TSX",
      snippet: "const rows = items.map(renderItem);",
    },
    {
      path: "lib/api.ts",
      size: 100,
      language: "TypeScript",
      snippet: "try { load(); } catch (error) { showError(error); }",
    },
  ],
};

function fixture(
  modelOutput = {
    score: 7.5,
    strengths: ["说明了执行位置"],
    improvements: ["补充验证方法"],
    nextQuestion: null,
  },
) {
  const state = {
    id: "interview-test",
    projectId: project.id,
    userId: "user-test",
    status: "IN_PROGRESS",
    currentQuestion: 0,
    questions: planInterviewQuestions(project),
    projectContext: structuredClone(project),
    jobDescription: "前端实习生",
  };
  const records = new Map();
  const calls = { model: 0, github: 0, writes: 0 };
  const github = {
    async getProjectContext() {
      calls.github += 1;
      return { ...project, readmePreview: "Changed repository" };
    },
  };
  const model = {
    enabled: true,
    async complete(messages) {
      calls.model += 1;
      model.messages = messages;
      return { content: JSON.stringify(modelOutput) };
    },
  };
  const store = {
    failWrite: false,
    async getRecordedAnswer(id, userId, questionId) {
      return userId === state.userId && id === state.id
        ? (records.get(questionId) ?? null)
        : null;
    },
    async getInterviewState(id, userId) {
      return userId === state.userId && id === state.id
        ? structuredClone(state)
        : null;
    },
    async recordAnswer(input) {
      if (store.failWrite) throw new Error("database unavailable");
      calls.writes += 1;
      const evaluation = JSON.parse(JSON.stringify(input.evaluation));
      records.set(input.question.id, { answer: input.answer, evaluation });
      state.currentQuestion = input.questionNumber;
      state.questions = structuredClone(input.questions);
      if (input.completed) state.status = "COMPLETED";
      return evaluation;
    },
  };
  const service = new AgentService(github, model, store);
  const submit = (
    answer = "使用服务端缓存，并测量延迟。",
    questionId = state.questions[0].id,
    userId = state.userId,
  ) => service.evaluateAnswer(state.id, answer, userId, questionId);
  return { service, store, model, github, state, calls, records, submit };
}

test("all planned questions cite saved files and reproducible code lines", () => {
  const questions = planInterviewQuestions(project);
  assert.equal(questions.length, 4);
  assert.equal(new Set(questions.map((question) => question.id)).size, 4);
  for (const question of questions) {
    const file = project.files.find(
      (item) => item.path === question.contextPath,
    );
    assert.ok(file);
    const { startLine, endLine, snippet } = question.evidence;
    assert.equal(
      snippet,
      file.snippet
        .split("\n")
        .slice(startLine - 1, endLine)
        .join("\n"),
    );
  }
  assert.deepEqual(planInterviewQuestions({ ...project, files: [] }), []);
});

test("evidence selection prioritizes the current and planned source files", () => {
  const questions = planInterviewQuestions(project);
  const context = selectEvidenceContext(project, questions[2], questions[3]);
  assert.equal(context.files[0].path, questions[2].contextPath);
  assert.equal(context.files[1].path, questions[3].contextPath);
  assert.ok(context.files.length <= 4);
});

test("a restored interview uses its original snapshot for real model scoring", async () => {
  const f = fixture();
  const result = await f.submit();
  assert.equal(result.provider, "deepseek");
  assert.equal(f.calls.model, 1);
  assert.equal(f.calls.github, 0);
  assert.match(f.model.messages[1].content, /Original training snapshot/);
  assert.match(f.model.messages[1].content, /original source/);
});

test("missing model follow-up keeps the planned question and does not end early", async () => {
  const f = fixture();
  const next = structuredClone(f.state.questions[1]);
  const result = await f.submit();
  assert.equal(result.completed, false);
  assert.deepEqual(result.nextQuestion, next);
  assert.equal(result.nextQuestionSource, "context-planner");
});

test("an invented model path cannot become a persisted question", async () => {
  const f = fixture({
    score: 8,
    strengths: [],
    improvements: [],
    nextQuestion: {
      prompt: "解释不存在的组件",
      contextPath: "src/store/cart.ts",
      dimension: "react",
      difficulty: "基础",
    },
  });
  const result = await f.submit();
  assert.equal(result.provider, "deepseek");
  assert.equal(result.nextQuestion.contextPath, "components/Cart.tsx");
  assert.equal(result.nextQuestionSource, "context-planner");
  assert.ok(
    !f.state.questions.some(
      (question) => question.contextPath === "src/store/cart.ts",
    ),
  );
});

test("valid model follow-ups receive evidence from the server, ignoring forged evidence", async () => {
  const f = fixture({
    score: 8,
    strengths: [],
    improvements: [],
    nextQuestion: {
      prompt: "为什么共享购物车状态？",
      contextPath: "components/Cart.tsx",
      dimension: "react",
      difficulty: "进阶",
      evidence: { snippet: "forged source", startLine: 999 },
    },
  });
  const result = await f.submit();
  assert.equal(result.nextQuestionSource, "model");
  assert.equal(result.nextQuestion.evidence.snippet, project.files[1].snippet);
  assert.equal(result.nextQuestion.evidence.startLine, 1);
});

test("database failure propagates without advancing or silently replacing a model score", async () => {
  const f = fixture();
  f.store.failWrite = true;
  await assert.rejects(f.submit(), /database unavailable/);
  assert.equal(f.state.currentQuestion, 0);
  assert.equal(f.records.size, 0);
  assert.equal(f.calls.model, 1);
  f.store.failWrite = false;
  const result = await f.submit();
  assert.equal(result.provider, "deepseek");
  assert.equal(f.state.currentQuestion, 1);
  assert.equal(f.calls.writes, 1);
});

test("a committed answer is replayed after restart without another model call", async () => {
  const f = fixture();
  const questionId = f.state.questions[0].id;
  const first = await f.submit();
  const restarted = new AgentService(f.github, f.model, f.store);
  const replay = await restarted.evaluateAnswer(
    f.state.id,
    "使用服务端缓存，并测量延迟。",
    f.state.userId,
    questionId,
  );
  assert.deepEqual(replay, first);
  assert.equal(f.calls.model, 1);
  assert.equal(f.calls.writes, 1);
  assert.equal(f.state.currentQuestion, 1);
  await assert.rejects(
    f.submit("不同的回答", questionId),
    (error) => error.getStatus() === 409,
  );
});

test("a commit between the replay lookup and state lookup still returns its saved response", async () => {
  const f = fixture();
  const questionId = f.state.questions[0].id;
  const first = await f.submit();
  const originalLookup = f.store.getRecordedAnswer;
  let lookups = 0;
  f.store.getRecordedAnswer = async (...args) =>
    ++lookups === 1 ? null : originalLookup(...args);
  const replay = await f.submit("使用服务端缓存，并测量延迟。", questionId);
  assert.deepEqual(replay, first);
  assert.equal(lookups, 2);
  assert.equal(f.calls.model, 1);
});

test("stale questions, completed interviews and another user's session are rejected before scoring", async () => {
  const f = fixture();
  await assert.rejects(
    f.submit("回答", "outdated-question"),
    (error) => error.getStatus() === 409,
  );
  await assert.rejects(
    f.submit("回答", f.state.questions[0].id, "other-user"),
    (error) => error.getStatus() === 404,
  );
  f.state.status = "COMPLETED";
  await assert.rejects(f.submit(), (error) => error.getStatus() === 409);
  assert.equal(f.calls.model, 0);
  assert.equal(f.calls.writes, 0);
});

test("invalid model scores and feedback produce clearly marked demo feedback", async (t) => {
  for (const output of [
    { score: 30, strengths: [], improvements: [] },
    { score: 8, strengths: [{}], improvements: [] },
    { score: null, strengths: [], improvements: [] },
  ]) {
    await t.test(JSON.stringify(output), async () => {
      const f = fixture(output);
      const result = await f.submit();
      assert.equal(result.provider, "local-mock");
      assert.match(result.note, /不计入能力评分/);
      assert.equal(result.completed, false);
    });
  }
});

test("the final question finishes exactly once and accepts a retry", async () => {
  const f = fixture();
  f.state.currentQuestion = 3;
  const questionId = f.state.questions[3].id;
  const result = await f.submit("测试失败边界", questionId);
  assert.equal(result.completed, true);
  assert.equal(result.nextQuestion, undefined);
  assert.equal(result.nextQuestionSource, "none");
  assert.equal(f.state.status, "COMPLETED");
  assert.deepEqual(await f.submit("测试失败边界", questionId), result);
  assert.equal(f.calls.model, 1);
});
