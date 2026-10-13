const assert = require("node:assert/strict");
const test = require("node:test");
const { DeepSeekService } = require("../dist/llm/deepseek.service.js");

function setup(t, timeout = "1000") {
  const previous = {
    key: process.env.DEEPSEEK_API_KEY,
    timeout: process.env.DEEPSEEK_TIMEOUT_MS,
    fetch: global.fetch,
  };
  process.env.DEEPSEEK_API_KEY = "test-provider-key";
  process.env.DEEPSEEK_TIMEOUT_MS = timeout;
  t.after(() => {
    if (previous.key === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous.key;
    if (previous.timeout === undefined) delete process.env.DEEPSEEK_TIMEOUT_MS;
    else process.env.DEEPSEEK_TIMEOUT_MS = previous.timeout;
    global.fetch = previous.fetch;
  });
  return new DeepSeekService();
}

test(
  "model request timeout includes a stalled response body",
  { timeout: 2000 },
  async (t) => {
    const service = setup(t, "20");
    global.fetch = async (_url, init) => ({
      ok: true,
      json: () =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          ),
        ),
    });
    await assert.rejects(
      service.complete([{ role: "user", content: "test" }]),
      /请求超时/,
    );
  },
);

test("model output is validated after reading the body", async (t) => {
  const service = setup(t);
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { choices: [{ message: { content: " " } }] };
    },
  });
  await assert.rejects(
    service.complete([{ role: "user", content: "test" }]),
    /没有返回有效内容/,
  );
});

test("tool messages round-trip through DeepSeek without requiring text in a tool call", async (t) => {
  const service = setup(t);
  const toolCall = {
    id: "read-1",
    type: "function",
    function: { name: "read_file", arguments: '{"path":"src/app.ts"}' },
  };
  let sent;
  global.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: { content: null, tool_calls: [toolCall] },
              finish_reason: "tool_calls",
            },
          ],
        };
      },
    };
  };
  const tools = [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read",
        parameters: { type: "object" },
      },
    },
  ];
  const result = await service.complete(
    [{ role: "user", content: "Read code" }],
    { tools },
  );
  assert.deepEqual(result.toolCalls, [toolCall]);
  assert.equal(result.content, "");
  assert.equal(sent.tool_choice, "auto");
  assert.deepEqual(sent.thinking, { type: "disabled" });
  const messages = [
    { role: "assistant", content: null, tool_calls: result.toolCalls },
    { role: "tool", tool_call_id: "read-1", content: '{"status":"ok"}' },
  ];
  await service.complete(messages, { tools, toolChoice: "none" });
  assert.deepEqual(sent.messages, messages);
  assert.equal(sent.tool_choice, "none");
});

test("duplicate call IDs and truncated model output are rejected", async (t) => {
  const service = setup(t);
  const tools = [
    {
      type: "function",
      function: { name: "read_file", description: "Read", parameters: {} },
    },
  ];
  const call = {
    id: "same",
    type: "function",
    function: { name: "read_file", arguments: "{}" },
  };
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [{ message: { content: null, tool_calls: [call, call] } }],
      };
    },
  });
  await assert.rejects(service.complete([], { tools }), /无效的工具调用/);
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          { finish_reason: "length", message: { content: '{"score":' } },
        ],
      };
    },
  });
  await assert.rejects(service.complete([], { tools }), /长度限制/);
});

test("the parent run signal cancels a model request before its provider timeout", async (t) => {
  const service = setup(t);
  global.fetch = (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      ),
    );
  const controller = new AbortController();
  const request = service.complete([], { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, /请求超时/);
});
