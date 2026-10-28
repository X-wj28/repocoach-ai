const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const exported = {};
new Function(
  "exports",
  ts.transpileModule(
    readFileSync(
      require("node:path").resolve(__dirname, "../lib/session-summary.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
)(exported);
const { summarizeInterview } = exported;
const answer = (
  questionNumber,
  score,
  provider = "deepseek",
  criteria = [],
) => ({
  questionNumber,
  score,
  provider,
  rubric: { criteria },
  evidence: { items: [{ id: "ev1" }] },
});
const criterion = (key, score, ids = ["ev1"]) => ({
  key,
  score,
  reason: "解释对应代码的恢复边界。",
  evidenceIds: ids,
});
test("session totals use saved model answers, include zero, and exclude demo and missing scores", () => {
  const input = {
    averageScore: 9.9,
    scoredQuestions: 99,
    answers: [
      answer(4, 10, "local-mock"),
      answer(2, null),
      answer(3, 8),
      answer(1, 0),
    ],
  };
  const summary = summarizeInterview(input);
  assert.equal(summary.average, 4);
  assert.equal(summary.scoredCount, 2);
  assert.equal(summary.unjudgedCount, 1);
  assert.equal(summary.demoCount, 1);
  assert.deepEqual(
    summary.answers.map((a) => a.questionNumber),
    [1, 2, 3, 4],
  );
  assert.equal(input.answers[0].questionNumber, 4);
});
test("practice suggestions require judged low criteria and saved citations, with at most one per question", () => {
  const summary = summarizeInterview({
    answers: [
      answer(1, 4, "deepseek", [
        criterion("correctness", 2),
        criterion("tradeoffs", 0),
      ]),
      answer(2, null, "deepseek", [
        criterion("failure_boundaries", 1),
        criterion("correctness", null),
      ]),
      answer(3, 1, "deepseek", [criterion("correctness", 0, ["not-saved"])]),
      answer(4, 1, "local-mock", [criterion("correctness", 0)]),
    ],
  });
  assert.deepEqual(
    summary.priorities.map((i) => [i.questionNumber, i.label, i.score]),
    [
      [1, "技术取舍", 0],
      [2, "失败边界", 1],
    ],
  );
  assert.equal(summary.evidenceGap.questionNumber, 2);
});
test("missing and malformed scores never become zero or practice priorities", () => {
  const summary = summarizeInterview({
    answers: [
      answer(1, null),
      answer(2, NaN),
      answer(3, 11),
      answer(4, 5, "local-mock"),
    ],
  });
  assert.equal(summary.average, null);
  assert.equal(summary.unjudgedCount, 3);
  assert.equal(summary.demoCount, 1);
  assert.deepEqual(summary.priorities, []);
  assert.equal(summary.evidenceGap.questionNumber, 1);
  const empty = summarizeInterview({ answers: [] });
  assert.equal(empty.average, null);
  assert.equal(empty.evidenceGap, null);
  assert.deepEqual(empty.answers, []);
});
