const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function moduleAt(file) {
  const exported = {};
  new Function(
    "exports",
    ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )(exported);
  return exported;
}
const { readDraft, writeDraft, clearUserDrafts, DRAFT_TTL_MS } =
  moduleAt("../lib/drafts.ts");
const { readWorkspace, writeWorkspace } = moduleAt(
  "../lib/workspace-storage.ts",
);
const identity = { projectId: "p1", interviewId: "i1", questionId: "q1" };
function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}
test("drafts are isolated by account, project, interview and question, including logout cleanup", () => {
  const store = storage();
  assert.equal(
    writeDraft(store, "alice", identity, "pending answer", 1000),
    true,
  );
  assert.equal(
    readDraft(store, "alice", identity, 1001).answer,
    "pending answer",
  );
  for (const changed of [
    { projectId: "p2" },
    { interviewId: "i2" },
    { questionId: "q2" },
  ])
    assert.equal(
      readDraft(store, "alice", { ...identity, ...changed }, 1001).answer,
      "",
    );
  assert.equal(readDraft(store, "bob", identity, 1001).answer, "");
  writeDraft(store, "bob", identity, "bob draft", 1000);
  clearUserDrafts(store, "alice");
  assert.equal(readDraft(store, "alice", identity, 1001).answer, "");
  assert.equal(readDraft(store, "bob", identity, 1001).answer, "bob draft");
});
test("expired and corrupt drafts cannot restore; confirmed submissions remove their draft", () => {
  const store = storage();
  writeDraft(store, "alice", identity, "old", 1000);
  assert.equal(
    readDraft(store, "alice", identity, 1000 + DRAFT_TTL_MS).answer,
    "",
  );
  store.values.set("repocoach-drafts-v1:alice", "broken JSON");
  assert.equal(readDraft(store, "alice", identity).answer, "");
  assert.equal(writeDraft(store, "alice", identity, "new answer"), true);
  assert.equal(writeDraft(store, "alice", identity, ""), true);
  assert.equal(readDraft(store, "alice", identity).answer, "");
});
test("unavailable browser storage returns a recoverable state rather than crashing", () => {
  const blocked = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("quota");
    },
    removeItem() {
      throw Error("blocked");
    },
  };
  assert.equal(readDraft(blocked, "alice", identity).available, false);
  assert.equal(writeDraft(blocked, "alice", identity, "keep in memory"), false);
  assert.doesNotThrow(() => clearUserDrafts(blocked, "alice"));
  assert.equal(readWorkspace(blocked, "alice"), null);
  assert.equal(writeWorkspace(blocked, "alice", {}, ""), false);
});
test("malformed cached workspace data cannot be rendered as a valid project", () => {
  const store = storage();
  const project = {
    id: "p",
    name: "demo",
    url: "https://github.com/example/demo",
    visibility: "public",
    stack: ["TypeScript"],
    analyzedFiles: 4,
    status: "synced",
  };
  writeWorkspace(store, "alice", project, "JD");
  assert.deepEqual(readWorkspace(store, "alice"), {
    project,
    jobDescription: "JD",
  });
  for (const changed of [
    { stack: null },
    { analyzedFiles: "4" },
    { url: "javascript:alert(1)" },
    { status: "unknown" },
  ]) {
    writeWorkspace(store, "alice", { ...project, ...changed }, "");
    assert.equal(readWorkspace(store, "alice"), null);
  }
  writeWorkspace(
    store,
    "alice",
    {
      ...project,
      description: { invalid: true },
      keyFiles: [
        null,
        { path: "src/a.ts", size: 42, language: "TypeScript" },
        { path: {} },
      ],
    },
    "JD",
  );
  const restored = readWorkspace(store, "alice");
  assert.equal(restored.project.description, undefined);
  assert.deepEqual(restored.project.keyFiles, [
    { path: "src/a.ts", size: 42, language: "TypeScript" },
  ]);
});
