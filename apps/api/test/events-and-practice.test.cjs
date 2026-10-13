const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const { parseEventCursor } = require("../dist/agent/evaluation-events");
const {
  EvaluationStreamService,
  sseFrame,
} = require("../dist/agent/evaluation-stream.service");
const { applyPracticeFocus } = require("../dist/agent/practice-planner");
const { EvidenceRuntime } = require("../dist/agent/evidence-runtime");

test("event cursors reject malformed, negative, fractional and excessive values", () => {
  assert.equal(parseEventCursor(undefined), 0);
  assert.equal(parseEventCursor("12"), 12);
  for (const bad of ["-1", "1.1", "1e3", "01", "2147483648", "x\nid:99"])
    assert.throws(() => parseEventCursor(bad));
  assert.equal(
    sseFrame("evaluation-event", { path: "one\ntwo" }, 2),
    'id: 2\nevent: evaluation-event\ndata: {"path":"one\\ntwo"}\n\n',
  );
});
test("stream pages are scoped to the user and bounded by the observed state sequence", async () => {
  let eventWhere;
  const service = new EvaluationStreamService(
    {
      evaluationRun: {
        async findFirst(input) {
          assert.equal(input.where.interview.userId, "owner");
          return { id: "run", status: "COMPLETED", lastEventSeq: 3 };
        },
      },
      evaluationEvent: {
        async findMany(input) {
          eventWhere = input.where;
          return [{ sequence: 3, type: "evaluation.finished" }];
        },
      },
    },
    {},
  );
  const page = await service.list("run", "owner", 2);
  assert.deepEqual(eventWhere.sequence, { gt: 2, lte: 3 });
  assert.equal(page.hasMore, false);
  await assert.rejects(service.list("run", "owner", 4), /游标/);
  await assert.rejects(
    new EvaluationStreamService(
      {
        evaluationRun: {
          async findFirst() {
            return null;
          },
        },
      },
      {},
    ).list("run", "other", 0),
    /找不到/,
  );
});
class Response extends EventEmitter {
  frames = "";
  destroyed = false;
  setHeader() {}
  flushHeaders() {}
  write(frame) {
    this.frames += frame;
    return true;
  }
  end() {
    this.ended = true;
    this.emit("close");
  }
}
test("a terminal SSE stream replays only missing events, sends state, and releases connections", async () => {
  const service = new EvaluationStreamService({}, {});
  service.list = async (_run, _user, after) => ({
    run: { status: "completed", lastEventSeq: 3 },
    events: [{ sequence: 3, type: "evaluation.finished", payload: {} }],
    hasMore: false,
  });
  const response = new Response();
  await service.serve("run", "owner", 2, response, "session");
  assert.match(response.frames, /id: 3\nevent: evaluation-event/);
  assert.match(response.frames, /event: run-state/);
  assert.equal(response.ended, true);
  assert.equal(service.connections.size, 0);
  assert.equal(response.listenerCount("close"), 0);
});
test("disconnecting an active stream releases backpressure waits and its connection slot", async () => {
  const service = new EvaluationStreamService({}, {});
  let reads = 0;
  service.list = async () => {
    reads++;
    return {
      run: { status: "running", lastEventSeq: 1 },
      events: [],
      hasMore: false,
    };
  };
  const response = new Response();
  response.write = () => false;
  const pending = service.serve("run", "owner", 0, response, "session");
  await new Promise((r) => setTimeout(r, 10));
  response.destroyed = true;
  response.emit("close");
  await pending;
  assert.equal(reads, 1);
  assert.equal(service.connections.size, 0);
  assert.equal(response.listenerCount("close"), 0);
});
test("personalized practice preserves current source evidence and ignores absent dimensions", () => {
  const questions = ["nextjs", "react", "engineering"].map((dimension, i) => ({
    id: `q${i}`,
    dimension,
    prompt: "分析当前代码",
    difficulty: "深入",
    contextPath: `src/${dimension}.ts`,
    evidence: { snippet: "real source" },
  }));
  const input = [
    {
      criterion: "code_evidence",
      dimension: "react",
      label: "代码依据",
      score: 1,
      source: {
        interviewId: "prior",
        questionNumber: 2,
        paths: ["obsolete.ts"],
      },
    },
    {
      criterion: "tradeoffs",
      dimension: "performance",
      label: "技术取舍",
      score: 0,
      source: { interviewId: "prior", questionNumber: 3, paths: [] },
    },
  ];
  const result = applyPracticeFocus(questions, input);
  assert.equal(result.questions[0].id, "q1");
  assert.equal(result.questions[0].difficulty, "基础");
  assert.equal(result.questions[0].contextPath, "src/react.ts");
  assert.deepEqual(result.questions[0].evidence, questions[1].evidence);
  assert.equal(result.focus[0].sourceInterviewId, "prior");
  assert.equal(result.focus.length, 1);
  assert.equal(questions[1].difficulty, "深入");
});
test("a failed progress checkpoint prevents any model call or silent provider fallback", async () => {
  let calls = 0;
  const runtime = new EvidenceRuntime(
    {
      async complete() {
        calls++;
        return { content: "{}" };
      },
    },
    {},
  );
  await assert.rejects(
    runtime.run({ files: [] }, [], 45000, async () => {
      throw new Error("event store failed");
    }),
    /event store failed/,
  );
  assert.equal(calls, 0);
});

test("a revoked session closes an existing stream and releases its slot", async (t) => {
  let now = 0,
    checks = 0;
  t.mock.method(Date, "now", () => now);
  const service = new EvaluationStreamService(
    {},
    {
      async findByToken() {
        checks++;
        return null;
      },
    },
  );
  service.list = async () => ({
    run: { status: "running", lastEventSeq: 1 },
    events: [],
    hasMore: false,
  });
  const response = new Response();
  const original = response.write.bind(response);
  response.write = (frame) => {
    const result = original(frame);
    if (frame.includes("event: run-state")) now = 6000;
    return result;
  };
  await service.serve("run", "owner", 0, response, "revoked");
  assert.equal(checks, 1);
  assert.equal(response.ended, true);
  assert.equal(service.connections.size, 0);
});

test("per-user streaming limits are checked before headers are sent", async () => {
  const service = new EvaluationStreamService({}, {});
  service.list = async () => ({
    run: { status: "running", lastEventSeq: 1 },
    events: [],
    hasMore: false,
  });
  service.connections.set("owner", 3);
  const response = new Response();
  await assert.rejects(
    service.serve("run", "owner", 0, response, "session"),
    (e) => e.getStatus() === 429,
  );
  assert.equal(response.frames, "");
  assert.equal(service.connections.get("owner"), 3);
});
