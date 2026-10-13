const { config } = require("dotenv");
const { resolve } = require("node:path");
const assert = require("node:assert/strict");
const { DeepSeekService } = require("../dist/llm/deepseek.service.js");
const { EvidenceRuntime } = require("../dist/agent/evidence-runtime.js");
const { parseJsonResponse } = require("../dist/llm/agent-prompts.js");

config({ path: resolve(__dirname, "../../../.env") });

async function main() {
  const model = new DeepSeekService();
  assert.ok(model.enabled, "Configure DEEPSEEK_API_KEY to run the opt-in provider smoke test.");
  // A synthetic public fixture avoids uploading local or user repository content.
  const project = {
    id: "smoke-fixture", name: "Synthetic request fixture", url: "https://github.com/example/synthetic-fixture",
    stack: ["TypeScript"], readmePreview: "Synthetic smoke fixture, no user data.",
    files: [{ path: "src/request.ts", language: "TypeScript", size: 150,
      snippet: "export async function request(url: string) {\n  const response = await fetch(url);\n  if (!response.ok) throw new Error('HTTP failure');\n  return response.json();\n}" }],
  };
  const runtime = new EvidenceRuntime(model, { readSnapshotFile() { throw new Error("Remote reads are not used in this fixture."); } });
  const result = await runtime.run(project, [
    { role: "system", content: "先调用 read_file 阅读 src/request.ts。只有取得工具结果后才评价回答，并指出代码实际没有实现的内容。最终只返回 JSON：{\"score\":0到10的数字,\"strengths\":[\"理由\"],\"improvements\":[\"理由\"]}。不得编造代码。" },
    { role: "user", content: "我说这个函数已经有请求超时、自动重试和 HTTP 错误处理。请查证这段回答是否准确。" },
  ]);
  const assessment = result.content ? parseJsonResponse(result.content) : null;
  assert.equal(result.trace.outcome, "completed", `Provider run ended with ${result.trace.outcome}.`);
  assert.ok(result.trace.tools.some((tool) => tool.name === "read_file" && tool.status === "ok"), "The live provider must actually request code evidence.");
  assert.ok(assessment && typeof assessment.score === "number" && assessment.score >= 0 && assessment.score <= 10);
  assert.ok(Array.isArray(assessment.improvements));
  console.log(JSON.stringify({ fixture: project.name, assessment, trace: result.trace }, null, 2));
}
main().catch(() => {
  console.error("Live evidence smoke test failed. Check model configuration, connectivity, or tool-call support; no credentials are logged.");
  process.exitCode = 1;
});
