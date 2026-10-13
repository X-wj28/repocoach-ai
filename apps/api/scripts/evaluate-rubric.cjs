const { resolve } = require("node:path");
const { mkdirSync, writeFileSync } = require("node:fs");
const assert = require("node:assert/strict");
const cases = require("../evals/rubric-cases.cjs");
const {
  createEvidenceBundle,
  RUBRIC_VERSION,
  SCORING_PROMPT_VERSION,
} = require("../dist/agent/rubric.js");
const { RubricScorer } = require("../dist/agent/rubric-scorer.js");
const { DeepSeekService } = require("../dist/llm/deepseek.service.js");
require("dotenv").config({ path: resolve(__dirname, "../../../.env") });
function input(item, model) {
  const project = {
    id: item.task,
    name: "Synthetic evaluation fixture",
    url: "https://github.com/example/fixture",
    stack: ["TypeScript"],
    readmePreview: "Synthetic fixture, no user data.",
    files: [
      {
        path: item.path,
        size: Buffer.byteLength(item.code),
        language: "TypeScript",
        snippet: item.code,
      },
    ],
  };
  const question = {
    id: item.id,
    prompt: item.question,
    contextPath: item.path,
    dimension: "engineering",
    difficulty: "进阶",
  };
  return {
    answer: item.answer,
    question,
    jobDescription: "软件工程：结合真实代码解释取舍与验证",
    evidence: createEvidenceBundle(project, question),
    model,
  };
}
function verdict(result, expected) {
  const rubric = result.rubric;
  return (
    (rubric.score !== null) === expected.comparable &&
    (expected.minScore === undefined || rubric.score >= expected.minScore) &&
    (expected.maxScore === undefined ||
      (rubric.score !== null && rubric.score <= expected.maxScore)) &&
    (expected.maxCorrectness === undefined ||
      rubric.criteria.find((c) => c.key === "correctness").score <=
        expected.maxCorrectness)
  );
}
async function main() {
  assert.equal(cases.length, 20);
  assert.equal(new Set(cases.map((c) => c.id)).size, 20);
  for (const item of cases) {
    assert.ok(item.question && item.code && item.answer);
    assert.equal(item.reviewStatus, "unreviewed");
    assert.ok(input(item, "fixture").evidence.items.length);
  }
  if (!process.argv.includes("--live")) {
    console.log(
      JSON.stringify({
        dataset: "rubric-provisional-v1",
        samples: cases.length,
        fixtureValidation: "passed",
        humanReviewed: 0,
        modelCalls: 0,
      }),
    );
    return;
  }
  const model = new DeepSeekService();
  assert.ok(
    model.enabled,
    "Configure a model key for optional live evaluation.",
  );
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = arg ? Number(arg.split("=")[1]) : 20;
  assert.ok(Number.isInteger(limit) && limit >= 1 && limit <= 20);
  const scorer = new RubricScorer(model);
  const rows = [];
  for (const item of cases.slice(0, limit)) {
    try {
      const result = await scorer.score(input(item, model.modelId));
      rows.push({
        id: item.id,
        task: item.task,
        category: item.category,
        expected: item.expected,
        result,
        expectedMatch: verdict(result, item.expected),
      });
    } catch (error) {
      rows.push({
        id: item.id,
        task: item.task,
        category: item.category,
        errorCode: error.code ?? "EVALUATION_FAILED",
        expectedMatch: false,
      });
    }
    console.log(
      JSON.stringify({
        id: item.id,
        valid: !!rows.at(-1).result,
        score: rows.at(-1).result?.rubric.score,
        expectedMatch: rows.at(-1).expectedMatch,
      }),
    );
  }
  const valid = rows.filter((r) => r.result);
  const latencies = valid
    .map((r) => r.result.scoring.durationMs)
    .sort((a, b) => a - b);
  const pairs = [];
  for (const task of new Set(rows.map((r) => r.task))) {
    const good = rows.find((r) => r.task === task && r.category === "excellent")
      ?.result?.rubric.score;
    for (const category of ["vague", "incorrect", "injection"]) {
      const weak = rows.find((r) => r.task === task && r.category === category)
        ?.result?.rubric.score;
      if (typeof good === "number" && typeof weak === "number")
        pairs.push(good > weak);
    }
  }
  const report = {
    createdAt: new Date().toISOString(),
    datasetVersion: "rubric-provisional-v1",
    rubricVersion: RUBRIC_VERSION,
    promptVersion: SCORING_PROMPT_VERSION,
    model: model.modelId,
    humanReviewed: 0,
    samples: rows.length,
    validOutputs: valid.length,
    schemaAndReferenceRate: valid.length / rows.length,
    provisionalExpectationRate:
      rows.filter((r) => r.expectedMatch).length / rows.length,
    pairwiseOrder: {
      passed: pairs.filter(Boolean).length,
      total: pairs.length,
    },
    latencyMs: {
      median: latencies[Math.floor(latencies.length / 2)] ?? null,
      p95:
        latencies[
          Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)
        ] ?? null,
    },
    tokens: {
      prompt: valid.reduce((s, r) => s + r.result.scoring.promptTokens, 0),
      completion: valid.reduce(
        (s, r) => s + r.result.scoring.completionTokens,
        0,
      ),
    },
    rows,
  };
  const dir = resolve(__dirname, "../../../data/evals");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `rubric-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, rows: undefined, artifact: file }));
  if (valid.length !== rows.length) process.exitCode = 1;
}
main().catch(() => {
  console.error("Rubric evaluation failed; no credentials are logged.");
  process.exitCode = 1;
});
