const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

test("persists an answer and builds a project report", () => {
  const directory = mkdtempSync(join(tmpdir(), "repocoach-report-"));
  process.env.REPOCOACH_DB_PATH = join(directory, "test.db");
  const { ReportStore } = require("../dist/report/report.store.js");
  const { DatabaseService } = require("../dist/database/database.service.js");
  const database = new DatabaseService();
  const store = new ReportStore(database);

  try {
    store.createInterview({
      id: "interview-test",
      userId: "user-test",
      projectId: "github-user-project",
      projectName: "project",
      projectUrl: "https://github.com/user/project",
      jobDescription: "前端开发实习生",
      totalQuestions: 4
    });
    store.recordAnswer({
      interviewId: "interview-test",
      questionNumber: 1,
      question: {
        id: "question-test",
        prompt: "如何处理提交状态？",
        contextPath: "apps/web/app/page.tsx",
        dimension: "engineering",
        difficulty: "进阶"
      },
      answer: "使用明确的 loading、success 和 error 状态。",
      evaluation: {
        score: 8.2,
        strengths: ["状态划分清晰"],
        improvements: ["补充超时处理"],
        provider: "deepseek"
      },
      completed: true
    });

    const report = store.getProjectReport("github-user-project", "user-test");
    assert.equal(report.readinessScore, 82);
    assert.equal(report.answeredQuestions, 1);
    assert.equal(report.completedInterviews, 1);
    assert.equal(report.dimensions.find((item) => item.key === "engineering").score, 82);

    const detail = store.getInterviewDetail("interview-test", "user-test");
    assert.equal(detail.averageScore, 8.2);
    assert.equal(detail.answers[0].contextPath, "apps/web/app/page.tsx");
    assert.deepEqual(detail.answers[0].improvements, ["补充超时处理"]);
  } finally {
    database.onModuleDestroy();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.REPOCOACH_DB_PATH;
  }
});
