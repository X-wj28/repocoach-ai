const assert = require("node:assert/strict");
const test = require("node:test");

test("starts an interview without waiting for DeepSeek", async () => {
  let modelCalls = 0;
  const projectContext = {
    id: "github-user-project",
    name: "project",
    url: "https://github.com/user/project",
    stack: ["Next.js", "React", "TypeScript"],
    readmePreview: "A project",
    files: [
      {
        path: "app/products/page.tsx",
        size: 120,
        language: "TSX",
        snippet: "'use client'; fetch('/api/products');",
      },
    ],
  };
  const github = {
    async getProjectContext() {
      return projectContext;
    },
  };
  const deepSeek = {
    enabled: true,
    async complete() {
      modelCalls += 1;
      return null;
    },
  };
  const created = [];
  const reportStore = {
    async createInterview(interview) {
      created.push(interview);
    },
  };
  const { AgentService } = require("../dist/agent/agent.service.js");
  const service = new AgentService(github, deepSeek, reportStore);

  const result = await service.startInterview(
    projectContext.id,
    "前端开发实习生",
    projectContext.url,
    "user-test",
  );

  assert.equal(modelCalls, 0);
  assert.equal(result.provider, "context-planner");
  assert.equal(result.question.contextPath, "app/products/page.tsx");
  assert.match(result.question.prompt, /数据获取/);
  assert.equal(created.length, 1);
});

test("restores an interview session after an API restart", async () => {
  const projectContext = {
    id: "github-user-project",
    name: "project",
    url: "https://github.com/user/project",
    stack: ["React"],
    readmePreview: "A project",
    files: [],
  };
  const github = {
    async getProjectContext() {
      return projectContext;
    },
  };
  const savedQuestion = {
    id: "saved-question",
    prompt: "请说明这个组件的状态边界。",
    contextPath: "app/page.tsx",
    dimension: "react",
    difficulty: "基础",
  };
  const progress = [];
  const reportStore = {
    async getInterviewState() {
      return {
        id: "interview-saved",
        projectId: projectContext.id,
        jobDescription: "前端开发实习生",
        currentQuestion: 0,
        questions: [savedQuestion],
      };
    },
    async updateInterviewState(...args) {
      progress.push(args);
    },
    async recordAnswer() {},
  };
  const deepSeek = { enabled: false };
  const { AgentService } = require("../dist/agent/agent.service.js");
  const service = new AgentService(github, deepSeek, reportStore);

  const result = await service.evaluateAnswer("interview-saved", "使用局部状态，并在需要共享时提升。", "user-test");

  assert.equal(result.questionNumber, 1);
  assert.equal(progress.length, 1);
  assert.equal(progress[0][0], "interview-saved");
});
