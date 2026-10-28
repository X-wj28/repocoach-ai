const assert = require("node:assert/strict");
const test = require("node:test");
const { ReportStore } = require("../dist/report/report.store.js");

test("a completed newest session does not resume an older unfinished session", async () => {
  let lookup;
  const store = new ReportStore({
    interview: {
      findFirst: async (query) => {
        lookup = query;
        return {
          id: "new-complete",
          status: "COMPLETED",
          questions: [],
          currentQuestion: 4,
        };
      },
    },
  });
  assert.equal(await store.getActiveInterview("project", "owner"), null);
  assert.deepEqual(lookup.where, { projectId: "project", userId: "owner" });
  assert.deepEqual(lookup.orderBy, { startedAt: "desc" });
});

function fixture() {
  const interviews = [];
  const answers = [];
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  let transactionQueue = Promise.resolve();
  const prisma = {
    failInsert: false,
    async $transaction(callback) {
      const result = transactionQueue.then(async () => {
        const before = structuredClone({ interviews, answers });
        try {
          return await callback(prisma);
        } catch (error) {
          interviews.splice(0, interviews.length, ...before.interviews);
          answers.splice(0, answers.length, ...before.answers);
          throw error;
        }
      });
      transactionQueue = result.catch(() => undefined);
      return result;
    },
    interview: {
      async create({ data }) {
        const row = {
          ...data,
          currentQuestion: 0,
          status: "IN_PROGRESS",
          startedAt: new Date(),
          completedAt: null,
        };
        interviews.push(row);
        return row;
      },
      async updateMany({ where, data }) {
        const rows = interviews.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      async findMany({ where, take }) {
        return interviews
          .filter((row) => matches(row, where))
          .slice(0, take)
          .map((row) => ({
            ...row,
            answers: answers.filter((answer) => answer.interviewId === row.id),
          }));
      },
      async count({ where }) {
        return interviews.filter((row) => matches(row, where)).length;
      },
      async findFirst({ where }) {
        const row = interviews.find((row) => matches(row, where));
        return row
          ? {
              ...row,
              answers: answers.filter(
                (answer) => answer.interviewId === row.id,
              ),
            }
          : null;
      },
    },
    interviewAnswer: {
      async create({ data }) {
        if (prisma.failInsert) throw new Error("answer insert failed");
        if (
          answers.some(
            (row) =>
              row.interviewId === data.interviewId &&
              row.questionNumber === data.questionNumber,
          )
        )
          throw new Error("unique constraint");
        const row = {
          ...data,
          id: `answer-${answers.length}`,
          answeredAt: new Date(),
        };
        answers.push(row);
        return row;
      },
      async findFirst({ where }) {
        const { interview, ...answerWhere } = where;
        return (
          answers.find(
            (row) =>
              matches(row, answerWhere) &&
              interviews.some(
                (owner) =>
                  owner.id === row.interviewId && matches(owner, interview),
              ),
          ) ?? null
        );
      },
      async findMany({ where }) {
        return answers.filter((row) =>
          interviews.some(
            (owner) =>
              owner.id === row.interviewId && matches(owner, where.interview),
          ),
        );
      },
    },
  };
  const store = new ReportStore(prisma);
  const question = {
    id: "question-test",
    prompt: "如何处理提交状态？",
    contextPath: "apps/web/app/page.tsx",
    dimension: "engineering",
    difficulty: "进阶",
  };
  async function create(id = "interview-test") {
    await store.createInterview({
      id,
      userId: "user-test",
      projectId: "github-user-project",
      projectName: "project",
      projectUrl: "https://github.com/user/project",
      jobDescription: "前端实习生",
      totalQuestions: 1,
      questions: [question],
      projectContext: {
        id: "github-user-project",
        name: "project",
        url: "https://github.com/user/project",
        stack: ["React"],
        readmePreview: "snapshot",
        files: [],
      },
    });
  }
  function input(provider = "deepseek", interviewId = "interview-test") {
    return {
      interviewId,
      userId: "user-test",
      questionNumber: 1,
      question,
      answer: "使用明确的 loading、success 和 error 状态。",
      completed: true,
      questions: [question],
      evaluation: {
        interviewId,
        projectId: "github-user-project",
        score: provider === "deepseek" ? 8.2 : 10,
        strengths: ["状态划分清晰"],
        improvements: ["补充超时处理"],
        provider,
        completed: true,
        questionNumber: 1,
        totalQuestions: 1,
        note: "feedback",
        nextQuestionSource: "none",
      },
    };
  }
  return { store, prisma, interviews, answers, create, input };
}

test("persists an answer, its exact response and the next state in one transaction", async () => {
  const f = fixture();
  await f.create();
  const input = f.input();
  assert.deepEqual(await f.store.recordAnswer(input), input.evaluation);
  assert.equal(f.interviews[0].currentQuestion, 1);
  assert.equal(f.interviews[0].status, "COMPLETED");
  const recorded = await f.store.getRecordedAnswer(
    input.interviewId,
    input.userId,
    input.question.id,
  );
  assert.deepEqual(recorded.evaluation, input.evaluation);
  const report = await f.store.getProjectReport(
    "github-user-project",
    "user-test",
  );
  assert.equal(report.readinessScore, 82);
  assert.equal(report.answeredQuestions, 1);
  assert.equal(report.scoredQuestions, 1);
  assert.equal(report.completedInterviews, 1);
  assert.equal(
    report.dimensions.find((item) => item.key === "engineering").score,
    82,
  );
  const detail = await f.store.getInterviewDetail(
    "interview-test",
    "user-test",
  );
  assert.equal(detail.averageScore, 8.2);
  assert.equal(detail.answers[0].contextPath, "apps/web/app/page.tsx");
  assert.deepEqual(detail.answers[0].improvements, ["补充超时处理"]);
});

test("an answer insert failure rolls back the turn advancement", async () => {
  const f = fixture();
  await f.create();
  f.prisma.failInsert = true;
  await assert.rejects(f.store.recordAnswer(f.input()), /answer insert failed/);
  assert.equal(f.interviews[0].currentQuestion, 0);
  assert.equal(f.interviews[0].status, "IN_PROGRESS");
  assert.equal(f.answers.length, 0);
  f.prisma.failInsert = false;
  await f.store.recordAnswer(f.input());
  assert.equal(f.answers.length, 1);
});

test("competing commits replay the winner instead of advancing twice", async () => {
  const f = fixture();
  await f.create();
  const results = await Promise.all([
    f.store.recordAnswer(f.input()),
    f.store.recordAnswer(f.input()),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(f.answers.length, 1);
  assert.equal(f.interviews[0].currentQuestion, 1);
  await assert.rejects(
    f.store.recordAnswer({ ...f.input(), answer: "changed answer" }),
    (error) => error.getStatus() === 409,
  );
});

test("the turn update and replay are scoped to the authenticated owner", async () => {
  const f = fixture();
  await f.create();
  await assert.rejects(
    f.store.recordAnswer({ ...f.input(), userId: "other-user" }),
    (error) => error.getStatus() === 409,
  );
  assert.equal(f.interviews[0].currentQuestion, 0);
  await f.store.recordAnswer(f.input());
  assert.equal(
    await f.store.getRecordedAnswer(
      "interview-test",
      "other-user",
      "question-test",
    ),
    null,
  );
  assert.equal(
    (await f.store.getProjectReport("github-user-project", "other-user"))
      .answeredQuestions,
    0,
  );
});

test("demo scores stay in history and do not affect capability averages", async () => {
  const f = fixture();
  await f.create();
  await f.create("interview-demo");
  await f.store.recordAnswer(f.input());
  await f.store.recordAnswer(f.input("local-mock", "interview-demo"));
  const report = await f.store.getProjectReport(
    "github-user-project",
    "user-test",
  );
  assert.equal(report.answeredQuestions, 2);
  assert.equal(report.scoredQuestions, 1);
  assert.equal(report.demoQuestions, 1);
  assert.equal(report.readinessScore, 82);
  assert.equal(
    report.recentSessions.find((session) => session.id === "interview-demo")
      .averageScore,
    0,
  );
  const demoDetail = await f.store.getInterviewDetail(
    "interview-demo",
    "user-test",
  );
  assert.equal(demoDetail.averageScore, 0);
  assert.equal(demoDetail.scoredQuestions, 0);
  assert.equal(demoDetail.answers[0].score, 10);
});

test("a report with only demo answers has no model capability score", async () => {
  const f = fixture();
  await f.create();
  await f.store.recordAnswer(f.input("local-mock"));
  const report = await f.store.getProjectReport(
    "github-user-project",
    "user-test",
  );
  assert.equal(report.hasData, false);
  assert.equal(report.readinessScore, 0);
  assert.equal(report.demoQuestions, 1);
  assert.deepEqual(report.strengths, []);
  assert.match(report.summary, /规则演示反馈/);
});
