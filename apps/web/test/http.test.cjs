const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");

// Compile the actual dependency-free browser helper; no copied implementation.
const compiled = ts.transpileModule(
  readFileSync(resolve(__dirname, "../lib/http.ts"), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const exported = {};
new Function("exports", compiled)(exported);
const { requestJson } = exported;

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((done) => server.close(done));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

for (const status of [200, 502]) {
  test(
    `request timeout includes a stalled ${status} response body after headers arrive`,
    { timeout: 5000 },
    async (t) => {
      let headersSent = false;
      const url = await serve(t, (_req, res) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.write('{"message":');
        headersSent = true;
        // Leave the body unfinished until the client's timeout cancels the read.
      });
      await assert.rejects(requestJson(url, undefined, 200), /响应超时/);
      assert.equal(headersSent, true);
    },
  );
}

test("completed JSON requests and validation errors keep their response meaning", async (t) => {
  const url = await serve(t, (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/invalid") {
      res.writeHead(400);
      res.end(JSON.stringify({ message: ["题目不能为空", "回答不能为空"] }));
    } else res.end(JSON.stringify({ active: null }));
  });
  assert.deepEqual(await requestJson(url), { active: null });
  await assert.rejects(
    requestJson(`${url}/invalid`),
    /题目不能为空；回答不能为空/,
  );
});

test("a non-JSON success response produces a readable error", async (t) => {
  const url = await serve(t, (_req, res) =>
    res.end("<html>proxy response</html>"),
  );
  await assert.rejects(requestJson(url), /返回了无效数据/);
});
