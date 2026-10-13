const assert = require("node:assert/strict");
const test = require("node:test");
const { EvaluationWorker } = require("../dist/agent/evaluation.worker");
test("continuous status polling cannot postpone a pending queue claim", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  let claims = 0;
  const worker = new EvaluationWorker(
    {
      async claim() {
        claims++;
        return null;
      },
      async nextLeaseDelay() {
        return undefined;
      },
    },
    {},
    {},
    {},
  );
  t.after(() => worker.onModuleDestroy());
  worker.wake(50);
  t.mock.timers.tick(40);
  worker.wake(50);
  t.mock.timers.tick(10);
  assert.equal(claims, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(worker.timer, undefined);
  t.mock.timers.tick(1000);
  assert.equal(claims, 1);
});
test("new work can bring a delayed recovery claim forward", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  let claims = 0;
  const worker = new EvaluationWorker(
    {
      async claim() {
        claims++;
        return null;
      },
      async nextLeaseDelay() {
        return undefined;
      },
    },
    {},
    {},
    {},
  );
  t.after(() => worker.onModuleDestroy());
  worker.wake(30000);
  t.mock.timers.tick(100);
  worker.wake(50);
  t.mock.timers.tick(49);
  assert.equal(claims, 0);
  t.mock.timers.tick(1);
  assert.equal(claims, 1);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(30000);
  assert.equal(claims, 1);
});
test("an empty queue stops database polling until an explicit wake", async (t) => {
  let claims = 0;
  const worker = new EvaluationWorker(
    {
      async claim() {
        claims++;
        return null;
      },
      async nextLeaseDelay() {
        return undefined;
      },
    },
    {},
    {},
    {},
  );
  t.after(() => worker.onModuleDestroy());
  await worker.tick();
  assert.equal(claims, 1);
  assert.equal(worker.timer, undefined);
  worker.wake(5);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(claims, 2);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(claims, 2);
});
test("a wake arriving while a stage runs is retained and schedules another claim", async (t) => {
  let finish;
  const worker = new EvaluationWorker(
    {
      async claim() {
        return { id: "run" };
      },
    },
    {},
    {},
    {},
  );
  t.after(() => worker.onModuleDestroy());
  worker.process = () => new Promise((r) => (finish = r));
  const pending = worker.tick();
  await new Promise((r) => setTimeout(r, 0));
  worker.wake();
  assert.equal(worker.wakeRequested, true);
  finish();
  await pending;
  assert.ok(worker.timer);
  assert.equal(worker.busy, false);
});
