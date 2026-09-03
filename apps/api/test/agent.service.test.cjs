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
