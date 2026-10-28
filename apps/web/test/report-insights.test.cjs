const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const exported = {};
new Function(
  "exports",
  ts.transpileModule(
    readFileSync(
      require("node:path").resolve(__dirname, "../lib/report-insights.ts"),
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
const { initialReportDimension, sessionTrend, trendSegments } = exported;

test("missing dimensions are not ranked as zero-scoring weaknesses; a measured zero is", () => {
  assert.equal(
    initialReportDimension({
      dimensions: [
        { key: "react", score: 0, answerCount: 0 },
        { key: "engineering", score: 60, answerCount: 4 },
      ],
    }),
    "engineering",
  );
  assert.equal(
    initialReportDimension({
      dimensions: [
        { key: "react", score: 0, answerCount: 1 },
        { key: "engineering", score: 60, answerCount: 4 },
      ],
    }),
    "react",
  );
});
test("session trend preserves no-score gaps and real zero scores without mutating API order", () => {
  const sessions = [
    {
      id: "new",
      startedAt: "2026-10-21T00:00:00Z",
      scoredQuestions: 1,
      averageScore: 0,
    },
    {
      id: "gap",
      startedAt: "2026-10-20T00:00:00Z",
      scoredQuestions: 0,
      averageScore: 9.8,
    },
    {
      id: "old",
      startedAt: "2026-10-19T00:00:00Z",
      scoredQuestions: 2,
      averageScore: 6,
    },
  ];
  const points = sessionTrend(sessions);
  assert.deepEqual(
    points.map((point) => point.value),
    [6, null, 0],
  );
  assert.deepEqual(trendSegments(points), [[0], [2]]);
  assert.equal(sessions[0].id, "new");
  assert.deepEqual(trendSegments(sessionTrend([sessions[1]])), []);
});
test("adjacent scored sessions connect, but missing sessions split the curve", () => {
  const points = [4, 5, null, 6, 7, null].map((value) => ({ value }));
  assert.deepEqual(trendSegments(points), [
    [0, 1],
    [3, 4],
  ]);
});
