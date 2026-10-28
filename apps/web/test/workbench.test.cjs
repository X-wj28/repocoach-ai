const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const compiled = ts.transpileModule(
  readFileSync(resolve(__dirname, "../lib/workbench.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const exported = {};
new Function("exports", compiled)(exported);
const { getRunStages } = exported;
const run = (phase, status) => ({ phase, status });

test("an unsaved answer or an in-flight submission never claims persistence", () => {
  assert.deepEqual(getRunStages(null), [
    "waiting",
    "waiting",
    "waiting",
    "waiting",
    "waiting",
  ]);
  assert.deepEqual(getRunStages(null, true), [
    "active",
    "waiting",
    "waiting",
    "waiting",
    "waiting",
  ]);
});
test("evidence failure preserves the answer but does not claim a saved checkpoint", () => {
  assert.deepEqual(getRunStages(run("evidence", "failed")), [
    "completed",
    "failed",
    "waiting",
    "waiting",
    "waiting",
  ]);
});
test("scoring failure and retry retain the saved evidence, without declaring feedback complete", () => {
  assert.deepEqual(getRunStages(run("scoring", "failed")), [
    "completed",
    "completed",
    "completed",
    "failed",
    "waiting",
  ]);
  assert.deepEqual(getRunStages(run("scoring", "pending")), [
    "completed",
    "completed",
    "completed",
    "waiting",
    "waiting",
  ]);
  assert.deepEqual(getRunStages(run("scoring", "running")), [
    "completed",
    "completed",
    "completed",
    "active",
    "waiting",
  ]);
});
test("a restored run can display saved progress without relying on SSE history", () => {
  assert.deepEqual(getRunStages(run("scoring", "running")), [
    "completed",
    "completed",
    "completed",
    "active",
    "waiting",
  ]);
  assert.deepEqual(getRunStages(run("completed", "completed")), [
    "completed",
    "completed",
    "completed",
    "completed",
    "completed",
  ]);
});
