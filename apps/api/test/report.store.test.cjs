const assert = require("node:assert/strict");
const test = require("node:test");

test("persists an answer and builds a project report", async () => {
  const interviews = [];
  const answers = [];
  const prisma = {
    interview: {
      async create({ data }) {
        const row = {
          ...data,
          status: "IN_PROGRESS",
          startedAt: new Date(),
          completedAt: null,
        };
        interviews.push(row);
        return row;
      },
      async update({ where, data }) {
        Object.assign(
          interviews.find((item) => item.id === where.id),
          data,
        );
      },
      async findMany({ where, take }) {
        return interviews
          .filter(
            (item) =>
              item.projectId === where.projectId &&
              item.userId === where.userId,
          )
          .slice(0, take)
          .map((item) => ({
            ...item,
            answers: answers
              .filter((answer) => answer.interviewId === item.id)
              .map(({ score }) => ({ score })),
          }));
      },
      async count({ where }) {
        return interviews.filter(
          (item) =>
            item.projectId === where.projectId &&
            item.userId === where.userId &&
            item.status === where.status,
        ).length;
      },
      async findFirst({ where }) {
        const item = interviews.find(
          (interview) =>
            interview.id === where.id && interview.userId === where.userId,
        );
        return item
          ? {
              ...item,
              answers: answers.filter(
                (answer) => answer.interviewId === item.id,
              ),
            }
          : null;
      },
    },
    interviewAnswer: {
      async create({ data }) {
        const row = { ...data, id: "answer-test", answeredAt: new Date() };
        answers.push(row);
        return row;
      },
      async findMany({ where }) {
        const matchingInterviewIds = interviews
          .filter(
            (item) =>
              item.projectId === where.interview.projectId &&
              item.userId === where.interview.userId,
          )
          .map((item) => item.id);
        return answers
          .filter((answer) => matchingInterviewIds.includes(answer.interviewId))
          .map(
            ({ dimension, score, strengths, improvements, contextPath }) => ({
              dimension,
              score,
              strengths,
              improvements,
              contextPath,
            }),
          );
      },
    },
  };
  const { ReportStore } = require("../dist/report/report.store.js");
  const store = new ReportStore(prisma);

  await store.createInterview({
    id: "interview-test",
    userId: "user-test",
    projectId: "github-user-project",
    projectName: "project",
    projectUrl: "https://github.com/user/project",
    jobDescription: "前端开发实习生",
    totalQuestions: 4,
  });
  await store.recordAnswer({
    interviewId: "interview-test",
    questionNumber: 1,
    question: {
      id: "question-test",
      prompt: "如何处理提交状态？",
      contextPath: "apps/web/app/page.tsx",
      dimension: "engineering",
      difficulty: "进阶",
    },
    answer: "使用明确的 loading、success 和 error 状态。",
    evaluation: {
      score: 8.2,
      strengths: ["状态划分清晰"],
      improvements: ["补充超时处理"],
      provider: "deepseek",
    },
    completed: true,
  });

  const report = await store.getProjectReport(
    "github-user-project",
    "user-test",
  );
  assert.equal(report.readinessScore, 82);
  assert.equal(report.answeredQuestions, 1);
  assert.equal(report.completedInterviews, 1);
  assert.equal(
    report.dimensions.find((item) => item.key === "engineering").score,
    82,
  );

  const detail = await store.getInterviewDetail("interview-test", "user-test");
  assert.equal(detail.averageScore, 8.2);
  assert.equal(detail.answers[0].contextPath, "apps/web/app/page.tsx");
  assert.deepEqual(detail.answers[0].improvements, ["补充超时处理"]);
});
