const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../../../..");
const directory = path.join(root, "data", "browser-acceptance-" + randomUUID());
fs.mkdirSync(directory, { recursive: true });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const { findBrowser, freePort, waitForDevTools } = require("./runtime.cjs");
let appOrigin, apiOrigin;
const project = {
  id: "workbench-fixture",
  name: "repocoach-ai",
  url: "https://github.com/X-wj28/repocoach-ai",
  visibility: "public",
  stack: ["TypeScript", "Next.js", "NestJS"],
  analyzedFiles: 14,
  status: "synced",
  commitSha: "stale-project-snapshot",
};
const user = {
  id: "workbench-review",
  name: "演示用户",
  email: "workbench@example.invalid",
  createdAt: "2026-10-19T02:00:00Z",
};
const snippet = fs
  .readFileSync(path.join(root, "apps/api/src/agent/rubric.ts"), "utf8")
  .split(/\r?\n/)
  .slice(130, 147)
  .join("\n");
const question = {
  id: "q1",
  prompt: "为什么有一项“无法判断”时，不应该直接生成总分？",
  contextPath: "apps/api/src/agent/rubric.ts",
  dimension: "engineering",
  difficulty: "进阶",
  evidence: { startLine: 131, endLine: 147, snippet },
};
const nextQuestion = {
  ...question,
  id: "q2",
  prompt: "如果评分服务暂时不可用，如何复用已经保存的代码依据？",
  contextPath: "apps/api/src/agent/evaluation.worker.ts",
  evidence: {
    startLine: 45,
    endLine: 48,
    snippet:
      "wake(delayMs = 50) {\n  if (this.stopping) return;\n  this.wakeRequested = true;\n}",
  },
};
const evidence = {
  items: [{ id: "ev1", path: question.contextPath, ...question.evidence }],
  commitSha: "d82d511f06147de90547b6a3632eedf971028686",
  coverage: "bounded-prefixes",
};
const rubric = {
  version: "code-interview-v1",
  promptVersion: "rubric-grader-v2",
  verdict: "partial",
  judgedCriteria: 4,
  criteria: [
    {
      key: "correctness",
      score: 3,
      reason: "准确区分无法判断和低分，并说明了四项评分均可判断的总分条件。",
      evidenceIds: ["ev1"],
    },
    {
      key: "code_evidence",
      score: 3,
      reason: "引用了 judgedCriteria 与服务端固定权重计算。",
      evidenceIds: ["ev1"],
    },
    {
      key: "tradeoffs",
      score: 2,
      reason: "说明了谨慎评分的收益，对可比较样本减少的代价展开不足。",
      evidenceIds: ["ev1"],
    },
    {
      key: "failure_boundaries",
      score: 2,
      reason: "可以补充部分评分未知、引用缺失和重试时的验证方式。",
      evidenceIds: ["ev1"],
    },
  ],
};
const trace = {
  runId: "run-fixture",
  commitSha: evidence.commitSha,
  snapshot: "pinned",
  outcome: "completed",
  durationMs: 4200,
  modelCalls: 2,
  promptTokens: 2000,
  completionTokens: 600,
  filesRead: [question.contextPath],
  tools: [
    {
      name: "search_code",
      status: "no-match-in-loaded-content",
      durationMs: 13,
      outputCharacters: 30,
      query: "unloaded_method",
    },
    {
      name: "read_file",
      status: "ok",
      durationMs: 240,
      outputCharacters: 1000,
      path: question.contextPath,
    },
    {
      name: "read_file",
      status: "outside-loaded-prefix",
      durationMs: 0,
      outputCharacters: 50,
      path: "apps/api/src/not-saved.ts",
    },
  ],
};
const evaluation = {
  interviewId: "interview-fixture",
  projectId: project.id,
  score: 6.5,
  strengths: ["能够结合源码说明评分条件。"],
  improvements: ["补充可比较样本减少时的报告展示与验证。"],
  nextQuestion,
  questionNumber: 2,
  totalQuestions: 4,
  provider: "deepseek",
  note: "仅用于本地浏览器验收的固定数据，不调用真实模型。",
  rubric,
  evidence,
  trace,
};
let run = null,
  savedAnswer = "",
  scenario = "writing",
  retryRequests = 0;
const baseEvents = [
  ["run.created", {}],
  ["evidence.started", {}],
  ["tool.started", { name: "read_file", step: 1 }],
  [
    "tool.finished",
    {
      name: "read_file",
      step: 1,
      path: question.contextPath,
      status: "ok",
      durationMs: 240,
    },
  ],
  [
    "tool.finished",
    {
      name: "read_file",
      step: 2,
      path: "apps/api/src/not-saved.ts",
      status: "outside-loaded-prefix",
      durationMs: 0,
    },
  ],
  ["evidence.selected", {}],
  ["evaluation.started", { attempt: 1 }],
  ["run.failed", {}],
];
let events = baseEvents.map(([type, payload], index) => ({
  sequence: index + 1,
  type,
  payload,
  createdAt: `2026-10-19T02:32:${String(index + 1).padStart(2, "0")}Z`,
}));
const report = {
  projectId: project.id,
  hasData: false,
  readinessScore: 0,
  averageScore: 0,
  answeredQuestions: 0,
  scoredQuestions: 0,
  demoQuestions: 0,
  completedInterviews: 0,
  coveredTopics: 0,
  summary: "尚未有可比较评分。",
  dimensions: [],
  strengths: [],
  improvements: [],
  nextActions: [],
  recentSessions: [],
};

let failReport = 0,
  delayReport = 0,
  reportReads = 0,
  failMemory = 0,
  startRequests = 0;
let reportMemory = null,
  switchedProject = false;
let memoryReads = 0,
  delayMemory = 0,
  mismatchMemory = false,
  clearRequests = 0,
  failClear = 0,
  delayClear = 0;
let failActive = 0,
  activeReads = 0,
  noActive = false,
  failStart = 0,
  delayStart = 0,
  delaySubmit = 0,
  failSubmit = 0,
  failAnalyze = 0;
let authFailures = 0,
  authStatus = 503,
  authUser = user,
  submitRequests = 0;
const initialEvaluation = structuredClone(evaluation);
const secondEvidence = {
  items: [
    { id: "ev1", path: nextQuestion.contextPath, ...nextQuestion.evidence },
  ],
  coverage: "bounded-prefixes",
  commitSha: "2222222222222222222222222222222222222222",
};
const historyAnswers = [
  {
    runId: "run-history-1",
    questionNumber: 1,
    question: question.prompt,
    contextPath: question.contextPath,
    dimension: "engineering",
    difficulty: "进阶",
    answer:
      "证据不足时，null 不等于零分。只有四项可判断，才生成加权总分；引用当时保存的片段，并说明无法比较的边界。",
    score: 6.5,
    strengths: initialEvaluation.strengths,
    improvements: initialEvaluation.improvements,
    provider: "deepseek",
    answeredAt: "2026-10-19T02:32:00Z",
    rubric: initialEvaluation.rubric,
    evidence: initialEvaluation.evidence,
    trace: initialEvaluation.trace,
  },
  {
    runId: "run-history-2",
    questionNumber: 2,
    question: nextQuestion.prompt,
    contextPath: nextQuestion.contextPath,
    dimension: "engineering",
    difficulty: "深入",
    answer:
      "先保存回答与依据，再进入评分。评分服务失败后只重试评分，保留当前题号。还需要验证并发重试与进程恢复。",
    score: null,
    strengths: ["能区分取证与评分两个阶段。"],
    improvements: ["现有片段不足以证明完整恢复过程，需要补充持久化实现。"],
    provider: "deepseek",
    answeredAt: "2026-10-19T02:35:00Z",
    rubric: {
      ...initialEvaluation.rubric,
      judgedCriteria: 3,
      criteria: initialEvaluation.rubric.criteria.map((item, index) =>
        index === 0
          ? {
              ...item,
              score: null,
              reason: "只读到局部片段，无法验证完整恢复流程。",
              evidenceIds: [],
            }
          : item,
      ),
    },
    evidence: secondEvidence,
  },
  {
    questionNumber: 3,
    question: "如何说明这个旧版训练记录的状态？",
    contextPath: "legacy/interview.ts",
    dimension: "react",
    difficulty: "基础",
    answer: "旧记录保留原始回答与整体反馈，缺少的源码和四项评分应明确说明。",
    score: 5,
    strengths: ["能够说明已有记录。"],
    improvements: ["补充边界。"],
    provider: "deepseek",
    answeredAt: "2026-10-19T02:38:00Z",
  },
  {
    questionNumber: 4,
    question: "演示模式的反馈能否计入能力评分？",
    contextPath: "demo/example.ts",
    dimension: "performance",
    difficulty: "基础",
    answer: "演示可以帮助体验流程，但应独立标注，不计入模型均分。",
    score: 9.8,
    strengths: ["提供了演示回答。"],
    improvements: ["需要真实模型评价。"],
    provider: "local-mock",
    answeredAt: "2026-10-19T02:41:00Z",
  },
];
const historyDetail = {
  id: "history-A",
  projectId: project.id,
  projectName: "repocoach-ai",
  projectUrl: project.url,
  jobDescription: "工程可靠性",
  status: "completed",
  totalQuestions: 4,
  averageScore: 5.8,
  scoredQuestions: 2,
  demoQuestions: 1,
  unjudgedQuestions: 1,
  startedAt: "2026-10-19T02:30:00Z",
  completedAt: "2026-10-19T02:42:00Z",
  answers: historyAnswers,
};
let failNextHistory = true,
  delayNextHistory = 0,
  summaryOverride = null,
  wrongHistoryProject = false,
  emptyNextB = false,
  historyReads = 0,
  historyEventReads = 0;
report.recentSessions = ["history-A", "history-B"].map((id) => ({
  id,
  projectName: project.name,
  status: "completed",
  questionCount: 4,
  scoredQuestions: 2,
  averageScore: 5.8,
  startedAt: historyDetail.startedAt,
  completedAt: historyDetail.completedAt,
}));
const streams = new Set();
function makeRun(phase, status) {
  return {
    id: "run-fixture",
    interviewId: "interview-fixture",
    questionId: "q1",
    answer: savedAnswer,
    phase,
    status,
    retryable: status === "failed",
    attempts: { evidence: 1, scoring: retryRequests + 1 },
    failureCode: status === "failed" ? "PROVIDER_ERROR" : null,
    evaluation: status === "completed" ? evaluation : null,
    lastEventSeq: events.length,
  };
}
function broadcast() {
  for (const response of streams)
    response.write(`event: run-state\ndata: ${JSON.stringify(run)}\n\n`);
}
function complete() {
  run = makeRun("completed", "completed");
  events.push({
    sequence: events.length + 1,
    type: "evaluation.finished",
    payload: {},
    createdAt: "2026-10-19T02:32:20Z",
  });
  broadcast();
}
const api = http.createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", appOrigin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Last-Event-ID",
  );
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const url = new URL(request.url, apiOrigin);
  const json = (value) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(value));
  };
  if (url.pathname.endsWith("/auth/me")) {
    if (authFailures > 0) {
      authFailures--;
      response.statusCode = authStatus;
      return json({ message: "验收：登录服务暂时不可用" });
    }
    return json({ user: authUser });
  }
  if (url.pathname.endsWith("/auth/logout")) return json({ success: true });
  if (url.pathname.endsWith("/auth/login")) return json({ user: authUser });
  if (url.pathname.includes("/reports/interviews/")) {
    historyReads++;
    const id = url.pathname.split("/").at(-1);
    const slow = delayNextHistory;
    delayNextHistory = 0;
    const fail = failNextHistory;
    failNextHistory = false;
    const snapshot = structuredClone(summaryOverride ?? historyDetail);
    await delay(slow || 80);
    if (fail) {
      response.statusCode = 503;
      return json({ message: "复盘接口暂时不可用，请重新加载。" });
    }
    const detail = snapshot;
    detail.id = id;
    if (wrongHistoryProject) detail.projectId = "incorrect-project";
    if (id === "history-B") {
      detail.projectName = "repocoach-history-B";
      if (emptyNextB) {
        detail.answers = [];
        detail.averageScore = 0;
        detail.scoredQuestions = 0;
        detail.demoQuestions = 0;
        detail.unjudgedQuestions = 0;
        detail.status = "in_progress";
      }
    }
    return json(detail);
  }
  if (url.pathname.includes("/reports/projects/")) {
    reportReads++;
    const ms = delayReport;
    delayReport = 0;
    const result = structuredClone(report),
      failing = failReport > 0;
    if (failing) failReport--;
    if (switchedProject) {
      result.projectId = "project-B";
      result.averageScore = 2;
      result.readinessScore = 20;
      result.summary = "项目 B 独立的评分";
      result.recentSessions = [];
    }
    if (ms) await delay(ms);
    if (failing) {
      response.statusCode = 503;
      return json({ message: "验收：报告读取暂时失败" });
    }
    return json(result);
  }
  if (url.pathname.endsWith("/projects/analyze")) {
    if (failAnalyze > 0) {
      failAnalyze--;
      response.statusCode = 503;
      return json({ message: "验收：仓库服务暂时不可用" });
    }
    switchedProject = true;
    return json({
      ...project,
      id: "project-B",
      name: "another-project",
      url: "https://github.com/example/another-project",
    });
  }
  if (url.pathname.endsWith("/interviews/start")) {
    startRequests++;
    const ms = delayStart;
    delayStart = 0;
    if (ms) await delay(ms);
    if (failStart > 0) {
      failStart--;
      response.statusCode = 503;
      return json({ message: "验收：训练启动暂时失败" });
    }
    return json({
      interviewId: "new-focused-interview",
      projectId: project.id,
      question: {
        ...nextQuestion,
        prompt: "本次重点练习失败边界：说明恢复行为并给出验证方法。",
      },
      questionNumber: 1,
      totalQuestions: 4,
      practiceFocus: [
        {
          criterion: "failure_boundaries",
          label: "失败边界",
          dimension: "engineering",
          sourceInterviewId: "history-A",
          sourceQuestionNumber: 2,
          contextPath: nextQuestion.contextPath,
        },
      ],
    });
  }
  if (url.pathname.endsWith("/training-memory/clear")) {
    clearRequests++;
    const ms = delayClear;
    delayClear = 0;
    if (ms) await delay(ms);
    if (failClear > 0) {
      failClear--;
      response.statusCode = 503;
      return json({ message: "验收：清除暂时失败" });
    }
    const cleared = reportMemory?.observations.length ?? 0;
    if (reportMemory)
      reportMemory = {
        ...reportMemory,
        focus: [],
        observations: [],
        practiced: 0,
      };
    return json({ cleared, historyRetained: true });
  }
  if (url.pathname.endsWith("/training-memory")) {
    memoryReads++;
    const ms = delayMemory;
    delayMemory = 0;
    const fail = failMemory > 0;
    if (fail) failMemory--;
    const result = structuredClone(
      reportMemory ?? {
        projectId: project.id,
        window: 40,
        observations: [],
        focus: [],
        practiced: 0,
        note: "验收数据",
      },
    );
    result.projectId = mismatchMemory
      ? "incorrect-project"
      : (url.searchParams.get("projectId") ?? project.id);
    if (ms) await delay(ms);
    if (fail) {
      response.statusCode = 503;
      return json({ message: "Memory unavailable in fixture" });
    }
    return json(result);
  }
  if (url.pathname.endsWith("/interviews/active")) {
    activeReads++;
    if (failActive > 0) {
      failActive--;
      response.statusCode = 503;
      return json({ message: "验收：进度读取暂时失败" });
    }
    if (noActive || switchedProject) return json(null);
    return json({
      interviewId: "interview-fixture",
      projectId: project.id,
      question,
      questionNumber: 1,
      totalQuestions: 4,
      pendingRun: run,
    });
  }
  if (url.pathname.endsWith("/answer")) {
    let body = "";
    for await (const chunk of request) body += chunk;
    submitRequests++;
    const answer = JSON.parse(body).answer,
      ms = delaySubmit;
    delaySubmit = 0;
    if (ms) await delay(ms);
    if (failSubmit > 0) {
      failSubmit--;
      response.statusCode = 503;
      return json({ message: "验收：回答提交暂时失败" });
    }
    savedAnswer = answer;
    run = makeRun("scoring", "failed");
    return json(run);
  }
  if (url.pathname.endsWith("/retry")) {
    retryRequests++;
    run = makeRun("scoring", "running");
    json(run);
    setTimeout(complete, 1400);
    return;
  }
  if (url.pathname.endsWith("/events")) {
    if (url.pathname.includes("run-history-")) historyEventReads++;
    const after = Number(url.searchParams.get("after") || 0),
      batch = events.filter((event) => event.sequence > after).slice(0, 3),
      next = batch.at(-1)?.sequence ?? after;
    return json({
      run,
      events: batch,
      next,
      hasMore: events.some((event) => event.sequence > next),
    });
  }
  if (url.pathname.endsWith("/stream")) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    events.forEach((event) =>
      response.write(
        `id: ${event.sequence}\nevent: evaluation-event\ndata: ${JSON.stringify(event)}\n\n`,
      ),
    );
    response.write(`event: run-state\ndata: ${JSON.stringify(run)}\n\n`);
    streams.add(response);
    request.on("close", () => streams.delete(response));
    return;
  }
  if (url.pathname.endsWith("/run-fixture")) return json(run);
  response.statusCode = 404;
  json({ message: "Unknown fixture endpoint" });
});
const profile = path.join(directory, `app-profile-${randomUUID()}`);
fs.mkdirSync(profile);
let app, browser, socket;
async function main() {
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  apiOrigin = "http://127.0.0.1:" + api.address().port;
  const appPort = await freePort();
  appOrigin = "http://127.0.0.1:" + appPort;
  const browserExecutable = findBrowser();
  const output = fs.openSync(
    path.join(directory, "app-preview-server.log"),
    "w",
  );
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "apps/web",
      "-p",
      String(appPort),
      "-H",
      "127.0.0.1",
    ],
    { cwd: root, windowsHide: true, stdio: ["ignore", output, output] },
  );
  let appReady = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(appOrigin, { signal: AbortSignal.timeout(1500) })).ok) {
        appReady = true;
        break;
      }
    } catch {}
    if (app.exitCode !== null) break;
    await delay(500);
  }
  assert.ok(
    appReady,
    "Production frontend did not start; inspect app-preview-server.log.",
  );
  const browserLog = fs.openSync(
    path.join(directory, "browser-launch.log"),
    "w",
  );
  browser = spawn(
    browserExecutable,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      ...(process.platform === "linux" &&
      (process.getuid?.() === 0 || process.env.BROWSER_NO_SANDBOX === "true")
        ? ["--no-sandbox"]
        : []),
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { windowsHide: true, stdio: ["ignore", browserLog, browserLog] },
  );
  fs.closeSync(browserLog);
  browser.on("error", (error) => {
    console.error(error.message);
  });
  const port = await waitForDevTools(browser, profile);
  const target = (
    await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  ).find((item) => item.type === "page");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map(),
    errors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id);
      if (item) {
        pending.delete(message.id);
        clearTimeout(item.timer);
        message.error
          ? item.reject(Error(message.error.message))
          : item.resolve(message.result);
      }
    } else if (message.method === "Runtime.exceptionThrown")
      errors.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
  });
  socket.addEventListener("close", () => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(Error("Browser connection closed."));
    }
    pending.clear();
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("Browser command timed out: " + method));
      }, 20000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    assert.ok(
      !result.exceptionDetails,
      JSON.stringify(result.exceptionDetails),
    );
    return result.result.value;
  };
  const until = async (expression, label) => {
    for (let i = 0; i < 60; i++) {
      if (await evaluate(expression)) return;
      await delay(200);
    }
    console.log(
      "Timeout diagnostic",
      label,
      await evaluate(
        'JSON.stringify({dialogs:[...document.querySelectorAll("dialog")].map(d=>({open:d.open,label:d.getAttribute("aria-label"),text:d.textContent.slice(0,150)})),active:document.activeElement?.outerHTML.slice(0,350)})',
      ),
    );
    await shot("review-timeout.png");
    throw Error("Timed out: " + label);
  };
  const shot = async (name) => {
    const result = await call("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(directory, name),
      Buffer.from(result.data, "base64"),
    );
  };
  const reload = async () => {
    const before = await evaluate("window.__acceptanceDocument");
    await call("Page.reload");
    await until(
      `window.__acceptanceDocument!==${JSON.stringify(before)} && document.readyState==='complete'`,
      "new document loaded",
    );
  };
  const close = async (remaining = 0) => {
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
    await until(
      'document.querySelectorAll("dialog[open]").length===' + remaining,
      "dialog closes",
    );
  };
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(()=>{window.__acceptanceDocument=crypto.randomUUID();const stored=${JSON.stringify({ project, jobDescription: "工程可靠性与 Agent 应用开发" })};localStorage.setItem('repocoach-workspace-v1:workbench-review',JSON.stringify(stored));const rewrite=url=>String(url).replace(/^https?:\\/\\/[^/]+\\/api\\/v1/,${JSON.stringify(apiOrigin + "/api/v1")});const originalFetch=window.fetch;window.fetch=(url,init)=>originalFetch(rewrite(url),init);const OriginalEventSource=window.EventSource;window.EventSource=class extends OriginalEventSource{constructor(url,options){super(rewrite(url),options);}};})()`,
  });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", { url: appOrigin });
  await until(
    '!!document.querySelector(".training-workbench textarea")',
    "writing UI",
  );
  await evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent==="面试训练").click()',
  );
  await until(
    '!!document.querySelector("textarea[name=answer]")',
    "training page",
  );
  await evaluate(
    `(()=>{const input=document.querySelector('textarea[name=answer]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'证据不足时 null 不等于零分。只有四项可判断，才能计算加权总分；同时保留源码引用，让用户核对。还应说明可比较样本减少的代价与异常验证。');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await delay(200);
  await shot("workbench-app-writing.png");
  const draft = await evaluate('document.querySelector("textarea").value');
  await evaluate(
    'document.querySelector(".question-source").focus();document.querySelector(".question-source").click()',
  );
  await until(
    '!!document.querySelector("dialog[open] .source-code")',
    "question source drawer",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".source-version").textContent.includes("版本号未提供")',
    ),
  );
  assert.ok(
    await evaluate(
      '!document.querySelector(".source-version").textContent.includes("stale-project")',
    ),
  );
  for (let i = 0; i < 10; i++) {
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    assert.ok(
      await evaluate(
        'document.querySelector("dialog").contains(document.activeElement)',
      ),
    );
  }
  await close();
  assert.ok(
    await evaluate(
      'document.activeElement.classList.contains("question-source")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelector("textarea").value'),
    draft,
  );
  await evaluate(
    'document.querySelector("textarea").closest("form").requestSubmit()',
  );
  await until('!!document.querySelector(".pending-failed")', "failed scoring");
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll(".run-stages li")].map(e=>e.dataset.state)',
    ),
    ["completed", "completed", "completed", "failed", "waiting"],
  );
  assert.ok(await evaluate('!document.querySelector(".workbench-score")'));
  await shot("workbench-app-retry.png");
  await evaluate(
    'document.querySelector(".workbench-actions button").focus();document.querySelector(".workbench-actions button").click()',
  );
  await until(
    'document.querySelectorAll(".timeline-expanded li").length===8',
    "paginated event history",
  );
  await evaluate(
    '[...document.querySelectorAll(".timeline-expanded .event-source-link")].find(b=>b.textContent.includes("not-saved")).click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".inspector-empty").textContent.includes("没有可展示") && !document.querySelector(".source-code")',
    ),
  );
  await evaluate('document.querySelector(".source-list button").click()');
  assert.ok(await evaluate('!!document.querySelector(".source-code")'));
  await close();
  await evaluate(
    'document.querySelector(".pending-failed .primary-button").click()',
  );
  await until(
    'document.querySelector(".run-stages li:nth-child(4)").dataset.state==="active"',
    "retrying scoring",
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".run-stages li:nth-child(3)").dataset.state',
    ),
    "completed",
  );
  await until(
    '!!document.querySelector(".workbench-feedback")',
    "completed feedback",
  );
  assert.equal(retryRequests, 1);
  assert.equal(
    await evaluate(
      'document.querySelector(".workbench-score").textContent.trim()',
    ),
    "6.5/ 10",
  );
  await shot("workbench-app-feedback.png");
  await evaluate(
    'document.querySelector(".evidence-link").focus();document.querySelector(".evidence-link").click()',
  );
  await until(
    '!!document.querySelector("dialog[open] .source-reason")',
    "rubric code reference",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".source-version").textContent.includes("d82d511f0614")',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".source-line span").textContent==="131"',
    ),
  );
  await shot("workbench-app-source.png");
  await close();
  await evaluate('document.querySelector(".workbench-actions button").click()');
  await until('!!document.querySelector(".process-stats")', "completed trace");
  assert.ok(
    await evaluate(
      'document.querySelector(".process-tools").textContent.includes("已加载内容中未匹配")',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelectorAll(".process-tools article").length===3',
    ),
  );
  await shot("workbench-app-process.png");
  await close();
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(200);
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await shot("workbench-app-mobile.png");
  await evaluate('document.querySelector(".evidence-link").click()');
  await delay(100);
  assert.ok(
    await evaluate(
      'document.documentElement.scrollWidth<=innerWidth && document.querySelector("dialog").scrollWidth<=390',
    ),
  );
  await shot("workbench-app-mobile-source.png");
  await close();
  await evaluate(
    'document.querySelector(".workbench-feedback .full-button").click()',
  );
  await until(
    '!!document.querySelector("textarea[name=answer]")',
    "next question",
  );
  assert.equal(await evaluate('document.querySelector("textarea").value'), "");
  assert.ok(
    await evaluate(
      'document.querySelector(".workbench-question h3").textContent.includes("复用已经保存")',
    ),
  );
  assert.ok(await evaluate('!document.querySelector("dialog[open]")'));
  await evaluate('document.querySelector(".question-source").click()');
  assert.ok(
    await evaluate(
      'document.querySelector(".source-file-title code").textContent.endsWith("evaluation.worker.ts")',
    ),
  );
  await close();
  // Restore a running task with no in-memory events; the server phase must suffice.
  run = makeRun("scoring", "running");
  await reload();
  await until(
    '!!document.querySelector(".training-workbench")',
    "restored task",
  );
  assert.deepEqual(
    await evaluate(
      '[...document.querySelectorAll(".run-stages li")].map(e=>e.dataset.state)',
    ),
    ["completed", "completed", "completed", "active", "waiting"],
  );
  evaluation.score = null;
  evaluation.rubric.judgedCriteria = 3;
  evaluation.rubric.criteria[3] = {
    ...evaluation.rubric.criteria[3],
    score: null,
    evidenceIds: [],
  };
  complete();
  await until(
    '!!document.querySelector(".workbench-feedback")',
    "unjudged feedback",
  );
  assert.equal(
    await evaluate('document.querySelector(".workbench-score").textContent'),
    "无法判断",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".rubric-details section:last-child").textContent.includes("无法判断")',
    ),
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".rubric-details section:last-child .rubric-meter .filled").length',
    ),
    0,
  );

  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    'document.querySelectorAll(".session-table .table-row-button")[0].focus();document.querySelectorAll(".session-table .table-row-button")[0].click()',
  );
  await until('!!document.querySelector(".history-error")', "history error");
  assert.equal(
    await evaluate('document.querySelectorAll("dialog[open]").length'),
    1,
  );
  await evaluate('document.querySelector(".history-error button").click()');
  await until(
    'document.querySelectorAll(".history-questions button").length===4',
    "history retry",
  );
  assert.equal(
    historyEventReads,
    0,
    "Event history is loaded only when requested",
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".history-answer").length'),
    1,
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".history-summary").textContent.includes("5.8")',
    ),
  );
  await shot("workbench-review-desktop.png");
  await evaluate(
    'document.querySelector(".history-answer .evidence-link").focus()',
  );
  const reviewScroll = await evaluate(
    'document.querySelector(".history-content").scrollTop',
  );
  await evaluate(
    'document.querySelector(".history-answer .evidence-link").click()',
  );
  await until(
    'document.querySelectorAll("dialog[open]").length===2',
    "nested source drawer",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".source-version").textContent.includes("d82d511f0614")',
    ),
  );
  for (let i = 0; i < 10; i++) {
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    assert.ok(
      await evaluate(
        'document.querySelector(".workbench-drawer").contains(document.activeElement)',
      ),
    );
  }
  await shot("workbench-review-source.png");
  await close(1);
  assert.ok(
    await evaluate(
      'document.activeElement.classList.contains("evidence-link")',
    ),
  );
  assert.equal(await evaluate("document.body.style.overflow"), "hidden");
  assert.ok(
    Math.abs(
      (await evaluate('document.querySelector(".history-content").scrollTop')) -
        reviewScroll,
    ) < 2,
  );
  await evaluate(
    'document.querySelector(".history-detail-actions button").click()',
  );
  await until(
    'document.querySelectorAll(".timeline-expanded li").length>=8',
    "history events",
  );
  assert.ok(historyEventReads > 0);
  await close(1);
  await evaluate(
    'document.querySelectorAll(".history-questions button")[1].click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".history-answer-score").textContent==="无法判断"',
    ),
  );
  await evaluate(
    'document.querySelector(".history-answer .evidence-link").click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".source-file-title code").textContent.endsWith("evaluation.worker.ts")',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".source-version").textContent.includes("222222222222")',
    ),
  );
  await close(1);
  await evaluate(
    'document.querySelectorAll(".history-questions button")[2].click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".history-feedback-note").textContent.includes("旧记录没有保存四项评分")',
    ),
  );
  await evaluate(
    'document.querySelectorAll(".history-detail-actions button")[1].click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".inspector-empty").textContent.includes("此记录未保存源码片段")',
    ),
  );
  await close(1);
  const readsBeforeLegacy = historyEventReads;
  await evaluate(
    'document.querySelector(".history-detail-actions button").click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".inspector-empty").textContent.includes("此记录未保存阶段事件")',
    ),
  );
  assert.equal(historyEventReads, readsBeforeLegacy);
  await close(1);
  await evaluate(
    'document.querySelectorAll(".history-questions button")[3].click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".history-answer-score").textContent.includes("不计分") && !document.querySelector(".history-answer").textContent.includes("9.8")',
    ),
  );
  const downloadDir = path.join(directory, "review-download-" + randomUUID());
  fs.mkdirSync(downloadDir);
  await call("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadDir,
  });
  await evaluate(
    'document.querySelector(".history-header-actions .ghost-button").click()',
  );
  for (
    let i = 0;
    i < 30 && !fs.readdirSync(downloadDir).some((file) => file.endsWith(".md"));
    i++
  )
    await delay(100);
  const exported = fs.readFileSync(
    path.join(
      downloadDir,
      fs.readdirSync(downloadDir).find((file) => file.endsWith(".md")),
    ),
    "utf8",
  );
  assert.equal((exported.match(/## 第 [1-4] 题/g) || []).length, 4);
  assert.ok(
    exported.includes("无法判断") &&
      exported.includes("规则演示分（不计入能力评分）"),
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await evaluate(
    'document.querySelectorAll(".history-questions button")[0].click()',
  );
  assert.ok(
    await evaluate(
      'document.documentElement.scrollWidth<=innerWidth && document.querySelector(".interview-review-dialog").scrollWidth<=390 && document.querySelector(".history-content").scrollWidth<=document.querySelector(".history-content").clientWidth',
    ),
  );
  await shot("workbench-review-mobile.png");
  await evaluate(
    'document.querySelector(".history-answer .evidence-link").click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".workbench-drawer").scrollWidth<=390',
    ),
  );
  await shot("workbench-review-mobile-source.png");
  await close(1);
  await close(0);
  assert.equal(await evaluate("document.body.style.overflow"), "");
  assert.ok(
    await evaluate(
      'document.activeElement.classList.contains("table-row-button")',
    ),
  );
  const oldReads = historyReads;
  delayNextHistory = 650;
  await evaluate(
    'document.querySelectorAll(".session-table .table-row-button")[0].click()',
  );
  for (let i = 0; i < 20 && historyReads === oldReads; i++) await delay(50);
  await evaluate(
    'document.querySelector("button[aria-label=关闭复盘]").click()',
  );
  await evaluate(
    'document.querySelectorAll(".session-table .table-row-button")[1].click()',
  );
  await until(
    'document.querySelector("#review-modal-title")?.textContent==="repocoach-history-B"',
    "second record",
  );
  await delay(750);
  assert.equal(
    await evaluate('document.querySelector("#review-modal-title").textContent'),
    "repocoach-history-B",
  );
  await close(0);
  emptyNextB = true;
  await evaluate(
    'document.querySelectorAll(".session-table .table-row-button")[1].click()',
  );
  await until(
    '!!document.querySelector(".history-content .history-status")',
    "empty saved record",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".history-content").textContent.includes("尚未保存回答")',
    ),
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".history-questions button:disabled").length',
    ),
    4,
  );
  await close(0);
  assert.equal(await evaluate("document.body.style.overflow"), "");
  assert.equal(errors.length, 0, errors.join("\n"));
  fs.writeFileSync(
    path.join(directory, "review-checks.json"),
    JSON.stringify(
      {
        productionFrontendWithFixedAPI: true,
        historyErrorRetry: true,
        questionNavigation: true,
        lazyEventFetch: true,
        nestedDialogFocusAndEscape: true,
        reviewScrollPreserved: true,
        perQuestionSourceAndRevision: true,
        nullAndDemoScores: true,
        legacyEmptyStates: true,
        markdownExportAllAnswers: true,
        mobileNoOverflow: true,
        lateResponseIgnored: true,
        emptyReview: true,
        bodyScrollRestored: true,
        uncaughtBrowserErrors: errors.length,
      },
      null,
      2,
    ) + "\n",
  );
  fs.writeFileSync(
    path.join(directory, "app-workbench-checks.json"),
    JSON.stringify(
      {
        fixtureBackedProductionUI: true,
        draftPreserved: true,
        focusTrapAndEscape: true,
        paginatedEvents: true,
        sourceReferenceAndRevision: true,
        missingSourceExplicit: true,
        phaseRetry: true,
        streamCompletion: true,
        nextQuestionReset: true,
        restoredRun: true,
        nullScorePreserved: true,
        mobileNoOverflow: true,
        uncaughtBrowserErrors: errors.length,
      },
      null,
      2,
    ) + "\n",
  );

  const reportData = {
    projectId: project.id,
    hasData: true,
    readinessScore: 57,
    averageScore: 5.7,
    answeredQuestions: 15,
    scoredQuestions: 12,
    demoQuestions: 2,
    unjudgedQuestions: 1,
    completedInterviews: 5,
    coveredTopics: 7,
    summary: "React 基础表现相对稳定，下一阶段优先强化工程化。",
    dimensions: [
      {
        key: "react",
        label: "React 基础",
        color: "teal",
        score: 78,
        answerCount: 4,
        feedback: "可以结合真实组件说明状态设计；继续补充不同交互下的验证。",
      },
      {
        key: "nextjs",
        label: "Next.js 应用",
        color: "blue",
        score: 0,
        answerCount: 0,
        feedback: "尚未覆盖",
      },
      {
        key: "engineering",
        label: "工程化",
        color: "amber",
        score: 42,
        answerCount: 7,
        feedback:
          "对异常恢复与并发边界的解释还不完整，建议从已有执行链路入手。",
      },
      {
        key: "performance",
        label: "性能意识",
        color: "rose",
        score: 65,
        answerCount: 1,
        feedback: "已有一次性能分析回答，可增加不同场景验证。",
      },
    ],
    strengths: [],
    improvements: [],
    nextActions: [],
    recentSessions: [7.8, 0, 6.4, null, 5.5, 4.2].map((value, index) => ({
      id: index === 0 ? "history-B" : "history-A",
      projectName: project.name,
      status: index === 0 ? "in_progress" : "completed",
      questionCount: [3, 1, 4, 2, 2, 3][index],
      scoredQuestions: value === null ? 0 : [3, 1, 4, 0, 2, 2][index],
      averageScore: value ?? 0,
      startedAt:
        "2026-10-" + String(21 - index).padStart(2, "0") + "T02:00:00Z",
      completedAt: null,
    })),
  };
  // Unique IDs and times are important for selecting actual sessions.
  reportData.recentSessions.forEach((session, index) => {
    if (index > 1) session.id = "trend-" + index;
  });
  Object.assign(report, structuredClone(reportData));
  reportMemory = {
    projectId: project.id,
    window: 40,
    practiced: 3,
    note: "固定验收观察，不调用模型",
    observations: [{ id: "ob1" }],
    focus: [
      {
        id: "weak-eng",
        criterion: "failure_boundaries",
        dimension: "engineering",
        label: "失败边界",
        score: 1,
        reason:
          "评分失败后的回答与依据已保存，但没有解释并发重试怎样避免重复写入。",
        createdAt: "2026-10-20T02:00:00Z",
        source: {
          runId: "run-history-2",
          interviewId: "history-A",
          questionNumber: 2,
          commitSha: secondEvidence.commitSha,
          evidenceIds: ["ev1"],
          paths: [nextQuestion.contextPath],
        },
      },
      {
        id: "weak-react",
        criterion: "tradeoffs",
        dimension: "react",
        label: "技术取舍",
        score: 2,
        reason: "可以说明本地状态与共享状态的选择依据，以及增加复杂度的代价。",
        createdAt: "2026-10-20T03:00:00Z",
        source: {
          runId: "run-history-1",
          interviewId: "history-A",
          questionNumber: 1,
          commitSha: evidence.commitSha,
          evidenceIds: ["ev1"],
          paths: [question.contextPath],
        },
      },
      {
        id: "weak-perf",
        criterion: "code_evidence",
        dimension: "performance",
        label: "代码依据",
        score: 2,
        reason: "描述了优化意图，但没有结合具体调用链解释数据如何支撑结论。",
        createdAt: "2026-10-19T03:00:00Z",
        source: {
          runId: "run-history-1",
          interviewId: "history-A",
          questionNumber: 1,
          commitSha: evidence.commitSha,
          evidenceIds: ["ev1"],
          paths: [question.contextPath],
        },
      },
    ],
  };
  reportMemory.observations = structuredClone(reportMemory.focus);
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    '[...document.querySelectorAll(".nav-item")].find(b=>b.textContent.includes("能力报告")).click()',
  );
  await until(
    'document.querySelectorAll(".insight-chart-point").length===6 && document.querySelectorAll(".insight-practice-card").length===3',
    "report data and memory",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".insight-score").textContent.includes("5.7")',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".insight-dimension[aria-pressed=true]").textContent.includes("工程化")',
    ),
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".insight-chart-plot polyline").length',
    ),
    2,
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".insight-chart-point[data-missing=true]").length',
    ),
    1,
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".insight-chart-point")[4].textContent',
    ),
    "0.0",
  );
  await evaluate('document.querySelectorAll(".insight-dimension")[1].click()');
  assert.ok(
    await evaluate(
      'document.querySelectorAll(".insight-dimension")[1].textContent.includes("—")',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".insight-dimension-detail").textContent.includes("不把它排为低分项")',
    ),
  );
  await evaluate(
    'document.querySelectorAll(".insight-filter button")[1].click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".insight-plan-empty").textContent.includes("不代表该维度已经掌握")',
    ),
  );
  await evaluate('document.querySelectorAll(".insight-dimension")[2].click()');
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".insight-practice-card").length',
    ),
    1,
  );
  await evaluate(
    'document.querySelector(".insight-practice-card > button").focus();document.querySelector(".insight-practice-card > button").click()',
  );
  await until(
    'document.querySelector(".history-questions button[aria-pressed=true]")?.textContent.includes("第 2 题")',
    "direct source question",
  );
  await evaluate(
    'document.querySelector(".history-answer .evidence-link").click()',
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".source-file-title code").textContent.includes("evaluation.worker.ts")',
    ),
  );
  await close(1);
  await close(0);
  assert.ok(
    await evaluate(
      'document.activeElement.matches(".insight-practice-card > button")',
    ),
  );
  await evaluate(
    'document.querySelectorAll(".insight-filter button")[0].click()',
  );
  await evaluate(
    'document.querySelectorAll(".insight-chart-point")[2].focus()',
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    text: String.fromCharCode(13),
    unmodifiedText: String.fromCharCode(13),
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  await until(
    'document.querySelector(".insight-session-detail").textContent.includes("保留为空缺")',
    "keyboard-select no-score session",
  );
  await evaluate(
    'document.querySelectorAll(".insight-chart-point")[5].click()',
  );
  await evaluate(
    '[...document.querySelectorAll(".insight-session-actions button")].find(b=>b.textContent.includes("查看复盘")).click()',
  );
  await until(
    'document.querySelector("#review-modal-title")?.textContent==="repocoach-history-B"',
    "trend to review",
  );
  await close(0);
  await evaluate("window.scrollTo(0,0)");
  await shot("report-insights-desktop.png");
  // A failed refresh keeps the last loaded data, with an explicit stale-data banner.
  failReport = 1;
  await evaluate('document.querySelector(".insight-refresh").click()');
  await until(
    '!!document.querySelector(".insight-load-error")',
    "refresh error",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".insight-load-error").textContent.includes("上次读取") && document.querySelector(".insight-score").textContent.includes("5.7")',
    ),
  );
  await evaluate(
    'document.querySelector(".insight-load-error button").click()',
  );
  await until(
    '!document.querySelector(".insight-load-error") && !document.querySelector(".insight-refresh").disabled',
    "refresh recovery",
  );
  failMemory = 1;
  await evaluate('document.querySelector(".insight-refresh").click()');
  await until(
    '!!document.querySelector(".insight-inline-status[role=alert]")',
    "memory error",
  );
  assert.ok(await evaluate('!document.querySelector(".insight-plan-empty")'));
  await evaluate(
    'document.querySelector(".insight-inline-status button").click()',
  );
  await until(
    'document.querySelectorAll(".insight-practice-card").length===3',
    "memory retry",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(400);
  await evaluate("window.scrollTo(0,0)");
  await shot("report-insights-mobile.png");
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await evaluate(
    'document.querySelector(".insight-practice").scrollIntoView()',
  );
  await shot("report-insights-mobile-plan.png");
  assert.ok(
    await evaluate(
      '[...document.querySelectorAll(".insight-chart-point")].every(b=>b.getBoundingClientRect().width>=30)',
    ),
  );
  await evaluate(
    'document.querySelector(".insight-practice-footer button").click()',
  );
  await until(
    '!!document.querySelector(".restart-training-dialog")',
    "new training confirmation",
  );
  await evaluate(
    'document.querySelector(".restart-training-dialog .primary-button").click()',
  );
  await until(
    'document.querySelector(".workbench-question")?.textContent.includes("本次重点练习失败边界")',
    "start focused training",
  );
  assert.equal(startRequests, 1);
  assert.ok(
    await evaluate(
      'document.querySelector(".practice-focus").textContent.includes("失败边界")',
    ),
  );
  // A fresh load failure is an error, never a fabricated zero score or an empty-data success.
  failReport = 2;
  await reload();
  await until(
    'document.querySelector(".signal-summary")?.textContent.includes("报告更新未完成")',
    "initial report error",
  );
  await evaluate(
    '[...document.querySelectorAll(".nav-item")].find(b=>b.textContent.includes("能力报告")).click()',
  );
  await until(
    '!!document.querySelector(".insight-load-error")',
    "initial report retry entry",
  );
  assert.ok(
    await evaluate(
      '!document.querySelector(".insight-score") && !document.querySelector(".insight-overview")',
    ),
  );
  await evaluate(
    'document.querySelector(".insight-load-error button").click()',
  );
  await until(
    '!!document.querySelector(".insight-overview")',
    "initial error recovery",
  );
  // No-score projects retain records and a truthful no-score graph.
  report.hasData = false;
  report.scoredQuestions = 0;
  report.averageScore = 0;
  report.readinessScore = 0;
  report.demoQuestions = 14;
  report.unjudgedQuestions = 1;
  report.dimensions.forEach((d) => {
    d.score = 0;
    d.answerCount = 0;
  });
  report.recentSessions.forEach((s) => {
    s.scoredQuestions = 0;
    s.averageScore = 9.8;
  });
  reportMemory = { ...reportMemory, focus: [], observations: [], practiced: 0 };
  await until(
    '!document.querySelector(".insight-refresh").disabled',
    "refresh enabled",
  );
  await evaluate('document.querySelector(".insight-refresh").click()');
  await until(
    'document.querySelectorAll(".insight-chart-point[data-missing=true]").length===6',
    "demo-only gaps",
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".insight-chart-plot polyline").length',
    ),
    0,
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".insight-score").textContent.startsWith("—") && !document.querySelector(".capability-lab").textContent.includes("9.8")',
    ),
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".insight-dimension strong").length',
    ),
    4,
  );
  await evaluate("window.scrollTo(0,0)");
  await shot("report-insights-no-score.png");
  Object.assign(report, structuredClone(reportData));
  await evaluate('document.querySelector(".insight-refresh").click()');
  await until(
    'document.querySelector(".insight-score")?.textContent.includes("5.7")',
    "restore report",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await until(
    '!document.querySelector(".insight-refresh").disabled',
    "ready for delayed refresh",
  );
  const readBefore = reportReads;
  delayReport = 1000;
  await evaluate('document.querySelector(".insight-refresh").click()');
  for (let i = 0; i < 20 && reportReads === readBefore; i++) await delay(20);
  await evaluate('document.querySelector(".workspace-switcher").click()');
  await evaluate(
    '(()=>{const el=document.querySelector("#repo-url");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,"https://github.com/example/another-project");el.dispatchEvent(new Event("input",{bubbles:true}));})()',
  );
  await evaluate('document.querySelector(".modal-card form").requestSubmit()');
  await until(
    'document.querySelector(".insight-score")?.textContent.includes("2.0")',
    "new project independent report",
  );
  await delay(1100);
  assert.ok(
    await evaluate(
      'document.querySelector(".insight-score").textContent.includes("2.0") && document.querySelector(".capability-lab .page-heading").textContent.includes("another-project")',
    ),
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  fs.writeFileSync(
    path.join(directory, "report-checks.json"),
    JSON.stringify(
      {
        productionFrontendWithFixedAPI: true,
        dimensionSelection: true,
        unmeasuredNotZero: true,
        gapsAndRealZero: true,
        keyboardChartSelection: true,
        trendToReview: true,
        practiceToExactQuestion: true,
        sourceDrawerFromPractice: true,
        refreshRetainsLastReport: true,
        initialLoadErrorDistinct: true,
        memoryFailureRetry: true,
        mobileNoOverflow: true,
        startUsesServerFocus: true,
        demoScoresExcluded: true,
        projectSwitchIgnoresLateResponse: true,
        uncaughtBrowserErrors: 0,
      },
      null,
      2,
    ) + "\n",
  );

  // Session reliability: exercise the production React UI, not only storage helpers.
  const setAnswer = async (text) => {
    await evaluate(
      `(()=>{const el=document.querySelector('textarea[name=answer]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await delay(50);
  };

  const reloadWriting = async () => {
    switchedProject = false;
    noActive = false;
    run = null;
    await reload();
    await until(
      '!!document.querySelector("textarea[name=answer]")',
      "restored writing session",
    );
  };
  const switchProject = async () => {
    await evaluate('document.querySelector(".workspace-switcher").click()');
    await evaluate(
      '(()=>{const el=document.querySelector("#repo-url");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,"https://github.com/example/another-project");el.dispatchEvent(new Event("input",{bubbles:true}));})()',
    );
    await evaluate(
      'document.querySelector(".project-import-dialog form").requestSubmit()',
    );
    await until(
      'document.querySelector(".workspace-switcher strong")?.textContent==="another-project"',
      "switch project",
    );
  };
  await reloadWriting();
  const durableDraft =
    "刷新后继续解释：先保存回答与依据，再重试失败的评分；跨项目请求不能覆盖当前训练。";
  await setAnswer(durableDraft);
  await until(
    'document.querySelector(".answer-draft-status")?.textContent.includes("尚未提交")',
    "draft status",
  );
  await reload();
  await until(
    `document.querySelector('textarea[name=answer]')?.value===${JSON.stringify(durableDraft)}`,
    "draft survives reload",
  );
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").maxLength'),
    5000,
  );
  await shot("session-draft-restored.png");
  failActive = 1;
  const startsBeforeRecovery = startRequests;
  await reload();
  await until(
    'document.querySelector(".training-state")?.textContent.includes("暂时无法恢复训练")',
    "restore failure",
  );
  assert.ok(
    await evaluate(
      '!document.querySelector("textarea[name=answer]") && document.querySelector(".page-heading > button").disabled',
    ),
  );
  await shot("session-recovery-error.png");
  await evaluate('document.querySelector(".training-state button").click()');
  await until(
    `document.querySelector('textarea[name=answer]')?.value===${JSON.stringify(durableDraft)}`,
    "retry restores draft",
  );
  assert.equal(startRequests, startsBeforeRecovery);
  await evaluate('document.querySelector(".page-heading > button").click()');
  await until(
    '!!document.querySelector(".restart-training-dialog")',
    "protect unfinished session",
  );
  await close();
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").value'),
    durableDraft,
  );
  failStart = 1;
  delayStart = 300;
  const startsBeforeFailure = startRequests;
  await evaluate('document.querySelector(".page-heading > button").click()');
  await evaluate(
    '(()=>{const button=document.querySelector(".restart-training-dialog .primary-button");button.click();button.click();})()',
  );
  await until(
    'document.querySelector(".notice-banner")?.textContent.includes("原题和草稿仍保留")',
    "failed start preserves session",
  );
  assert.equal(startRequests, startsBeforeFailure + 1);
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").value'),
    durableDraft,
  );
  const storageOverride = await call("Page.addScriptToEvaluateOnNewDocument", {
    source:
      'const originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith("repocoach-drafts-"))throw new DOMException("Quota exceeded","QuotaExceededError");return originalSetItem.call(this,key,value);};',
  });
  await reload();
  await until(
    '!!document.querySelector("textarea[name=answer]")',
    "blocked storage session",
  );
  await setAnswer("存储不可用时保留当前输入，明确提示复制回答。");
  await until(
    'document.querySelector(".answer-draft-status")?.textContent.includes("复制")',
    "storage fallback warning",
  );
  await shot("session-storage-fallback.png");
  assert.ok(
    await evaluate(
      'document.querySelector("textarea[name=answer]").value.includes("保留当前输入")',
    ),
  );
  await call("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: storageOverride.identifier,
  });
  await reloadWriting();
  await setAnswer(durableDraft);
  failSubmit = 1;
  const submitsBefore = submitRequests;
  await evaluate(
    'document.querySelector("textarea[name=answer]").closest("form").requestSubmit()',
  );
  await until(
    'document.querySelector(".notice-banner")?.textContent.includes("回答已保留")',
    "failed submit retains draft",
  );
  assert.equal(submitRequests, submitsBefore + 1);
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").value'),
    durableDraft,
  );
  await reload();
  await until(
    `document.querySelector('textarea[name=answer]')?.value===${JSON.stringify(durableDraft)}`,
    "submit failure survives reload",
  );
  // A server-acknowledged answer takes precedence over any stale local draft.
  savedAnswer = "这是服务器已保存的回答，不应被旧的本机草稿覆盖。";
  run = makeRun("scoring", "failed");
  await reload();
  await until(
    '!!document.querySelector(".pending-failed")',
    "restored immutable answer",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".workbench-saved-answer").textContent.includes("服务器已保存的回答")',
    ),
  );
  assert.ok(await evaluate('!document.querySelector("textarea[name=answer]")'));
  Object.assign(evaluation, structuredClone(initialEvaluation));
  run = makeRun("completed", "completed");
  await reload();
  await until(
    '!!document.querySelector(".workbench-feedback")',
    "restored completed feedback",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".workbench-score").textContent.includes("6.5")',
    ),
  );
  // Polling must finish the same run when SSE is unsupported.
  const noStream = await call("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.EventSource=undefined;",
  });
  run = makeRun("scoring", "running");
  await reload();
  await until(
    'document.querySelector(".run-stages li:nth-child(4)")?.dataset.state==="active"',
    "polling restored run",
  );
  assert.ok(
    await evaluate('document.querySelector(".page-heading > button").disabled'),
  );
  complete();
  await until(
    '!!document.querySelector(".workbench-feedback")',
    "polling completion without SSE",
  );
  await call("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: noStream.identifier,
  });
  // Late submission and start responses must never populate a different project.
  await reloadWriting();
  await setAnswer(durableDraft);
  delaySubmit = 1000;
  const beforeDelayedSubmit = submitRequests;
  await evaluate(
    'document.querySelector("textarea[name=answer]").closest("form").requestSubmit()',
  );
  for (let i = 0; i < 40 && submitRequests === beforeDelayedSubmit; i++)
    await delay(25);
  assert.equal(submitRequests, beforeDelayedSubmit + 1);
  await switchProject();
  await until(
    'document.querySelector(".training-state")?.textContent.includes("准备开始")',
    "new project without previous run",
  );
  await delay(1100);
  assert.ok(
    await evaluate(
      '!!document.querySelector(".training-state") && !document.querySelector(".pending-failed") && !document.querySelector(".workbench-question")',
    ),
  );
  await reloadWriting();
  delayStart = 1000;
  const beforeDelayedStart = startRequests;
  await evaluate('document.querySelector(".page-heading > button").click()');
  await evaluate(
    'document.querySelector(".restart-training-dialog .primary-button").click()',
  );
  for (let i = 0; i < 40 && startRequests === beforeDelayedStart; i++)
    await delay(25);
  await switchProject();
  await until(
    'document.querySelector(".training-state")?.textContent.includes("准备开始")',
    "new project during old start",
  );
  await delay(1100);
  assert.ok(
    await evaluate(
      '!document.querySelector(".workbench-question") && document.querySelector(".workspace-switcher strong").textContent==="another-project"',
    ),
  );
  await reloadWriting();
  failAnalyze = 1;
  await evaluate('document.querySelector(".workspace-switcher").click()');
  await evaluate(
    'document.querySelector(".project-import-dialog form").requestSubmit()',
  );
  await until(
    'document.querySelector(".project-import-dialog .import-error")?.textContent.includes("仓库服务")',
    "import error visible inside dialog",
  );
  assert.ok(
    await evaluate(
      '!document.querySelector(".project-import-dialog input").disabled',
    ),
  );
  await shot("session-import-error.png");
  await close();
  authFailures = 1;
  authStatus = 503;
  await reload();
  await until(
    '!!document.querySelector(".auth-recovery")',
    "auth outage recovery instead of logout",
  );
  assert.ok(await evaluate('!document.querySelector(".auth-form")'));
  await evaluate('document.querySelector(".auth-recovery button").click()');
  await until(
    '!!document.querySelector("textarea[name=answer]")',
    "auth recovery",
  );
  // Logging out removes this account's local drafts; another account starts isolated.
  await setAnswer("退出时应删除此账号的本机草稿。");
  await evaluate(
    'document.querySelector("button[aria-label=退出登录]").click()',
  );
  await until('!!document.querySelector(".auth-form")', "logout");
  assert.equal(
    await evaluate(
      'localStorage.getItem("repocoach-drafts-v1:workbench-review")',
    ),
    null,
  );
  authUser = { ...user, id: "another-account", name: "另一账号" };
  await evaluate(
    `localStorage.setItem('repocoach-workspace-v1:another-account',${JSON.stringify(JSON.stringify({ project, jobDescription: "测试账号隔离" }))})`,
  );
  await evaluate(
    '(()=>{for(const [selector,value]of[["input[type=email]","another@gmail.com"],["input[type=password]","TestOnly123!"]]){const el=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));}})()',
  );
  await evaluate('document.querySelector(".auth-form").requestSubmit()');
  await until(
    '!!document.querySelector("textarea[name=answer]")',
    "new account workspace",
  );
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").value'),
    "",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".user-row").textContent.includes("另一账号")',
    ),
  );
  authFailures = 1;
  authStatus = 401;
  await reload();
  await until(
    '!!document.querySelector(".auth-form")',
    "401 correctly requests login",
  );
  authUser = user;
  noActive = true;
  await reload();
  await until(
    'document.querySelector(".training-state")?.textContent.includes("准备开始")',
    "empty session honest CTA",
  );
  assert.ok(
    await evaluate(
      '!document.querySelector(".workbench-question") && !document.querySelector("textarea[name=answer]")',
    ),
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await shot("session-empty-mobile.png");
  assert.equal(errors.length, 0, errors.join("\n"));
  fs.writeFileSync(
    path.join(directory, "session-checks.json"),
    JSON.stringify(
      {
        productionFrontendWithFixedAPI: true,
        draftSurvivesReload: true,
        answerLimit: true,
        restoreErrorRetry: true,
        startFailurePreservesDraft: true,
        duplicateStartBlocked: true,
        storageFailureExplicit: true,
        submitFailureRetainsDraft: true,
        serverAnswerOverridesDraft: true,
        completedRunRestored: true,
        pollingWithoutSSE: true,
        pendingRunBlocksNewStart: true,
        lateSubmitIgnoredAfterProjectSwitch: true,
        lateStartIgnoredAfterProjectSwitch: true,
        importErrorInsideDialog: true,
        authOutageDistinctFromLogout: true,
        logoutClearsDrafts: true,
        accountIsolation: true,
        unauthorizedRequestsLogin: true,
        emptySessionNotFabricated: true,
        mobileNoOverflow: true,
        uncaughtBrowserErrors: 0,
      },
      null,
      2,
    ) + "\n",
  );
  // Answer coaching and training plan feedback use the same production UI.
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    'localStorage.removeItem("repocoach-drafts-v1:workbench-review")',
  );
  await reloadWriting();
  await evaluate(
    '[...document.querySelectorAll(".nav-item")].find(b=>b.textContent.includes("面试训练")).click()',
  );
  await until(
    '!!document.querySelector(".answer-outline-toggle")',
    "answer coaching entry",
  );
  await evaluate('document.querySelector(".answer-outline-toggle").click()');
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".answer-outline-grid > div").length',
    ),
    4,
  );
  await evaluate('document.querySelector(".answer-outline-insert").click()');
  await until(
    'document.querySelector("textarea[name=answer]").value.includes("失败边界与验证")',
    "insert blank outline",
  );
  assert.ok(
    await evaluate('document.querySelector(".answer-outline-insert").disabled'),
  );
  const coachedAnswer =
    "先给出判断，结合真实文件解释实现，再说明方案代价和失败时如何验证。";
  await setAnswer(coachedAnswer);
  await evaluate('document.querySelector(".answer-outline-insert").click()');
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").value'),
    coachedAnswer,
  );
  await evaluate(
    'document.querySelector(".answer-clear").focus();document.querySelector(".answer-clear").click()',
  );
  await until(
    '!!document.querySelector(".answer-clear-dialog[open]")',
    "confirm clearing answer",
  );
  assert.ok(
    await evaluate('document.activeElement.textContent.includes("保留回答")'),
  );
  await close();
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").value'),
    coachedAnswer,
  );
  assert.ok(await evaluate('document.activeElement.matches(".answer-clear")'));
  await evaluate('document.querySelector(".answer-clear").click();');
  await evaluate('document.querySelector(".answer-confirm-clear").click()');
  await until(
    'document.querySelector("textarea[name=answer]").value === ""',
    "clear confirmed",
  );
  await reload();
  await until(
    '!!document.querySelector("textarea[name=answer]")',
    "cleared draft after reload",
  );
  await evaluate(
    '[...document.querySelectorAll(".nav-item")].find(b=>b.textContent.includes("面试训练")).click()',
  );
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").value'),
    "",
  );
  await setAnswer(coachedAnswer);
  await evaluate(
    'window.__originalClipboard = Object.getOwnPropertyDescriptor(navigator,"clipboard");Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__copiedAnswer=text;}}});document.querySelector(".answer-copy").click()',
  );
  await until(
    'document.querySelector(".answer-copy-status")?.textContent.includes("已复制")',
    "copy answer",
  );
  assert.equal(await evaluate("window.__copiedAnswer"), coachedAnswer);
  await evaluate(
    'Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw Error("denied");}}});document.querySelector(".answer-copy").click()',
  );
  await until(
    'document.querySelector(".answer-copy-status")?.textContent.includes("已选中")',
    "clipboard denial fallback",
  );
  assert.ok(
    await evaluate(
      '(()=>{const el=document.querySelector("textarea[name=answer]");return el.selectionStart===0&&el.selectionEnd===el.value.length;})()',
    ),
  );
  await evaluate(
    'if(window.__originalClipboard)Object.defineProperty(navigator,"clipboard",window.__originalClipboard);else delete navigator.clipboard;',
  );
  const beforeShortcut = submitRequests;
  await evaluate(
    'document.querySelector("textarea[name=answer]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",ctrlKey:true,isComposing:true,bubbles:true}));document.querySelector("textarea[name=answer]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",metaKey:true,keyCode:229,bubbles:true}));document.querySelector("textarea[name=answer]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));',
  );
  await delay(200);
  assert.equal(submitRequests, beforeShortcut);
  failSubmit = 1;
  await evaluate(
    'document.querySelector("textarea[name=answer]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",ctrlKey:true,bubbles:true}));',
  );
  await until(
    'document.querySelector(".notice-banner")?.textContent.includes("回答已保留")',
    "shortcut submit failure retains answer",
  );
  assert.equal(submitRequests, beforeShortcut + 1);
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").value'),
    coachedAnswer,
  );
  await evaluate('document.querySelector(".answer-outline-toggle").click()');
  await evaluate(
    'document.querySelector(".workbench-answer").scrollIntoView({block:"start"})',
  );
  await shot("answer-coaching-desktop.png");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await until(
    'document.querySelector(".sidebar").getBoundingClientRect().right<=1',
    "mobile sidebar transition settled",
  );
  await evaluate(
    'document.querySelector(".workbench-answer").scrollIntoView({block:"start"})',
  );
  await shot("answer-coaching-mobile.png");
  failSubmit = 1;
  await evaluate(
    'document.querySelector("textarea[name=answer]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",metaKey:true,bubbles:true}));',
  );
  for (let i = 0; i < 40 && submitRequests === beforeShortcut + 1; i++)
    await delay(25);
  await until(
    '!document.querySelector("textarea[name=answer]").disabled',
    "meta shortcut request settled",
  );
  assert.equal(submitRequests, beforeShortcut + 2);
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // Loading, failure and account-wide clear must have distinct visible states.
  const observation = {
    id: "experience-observation",
    criterion: "failure_boundaries",
    dimension: "engineering",
    label: "失败边界",
    score: 1,
    reason: "补充持久化后重试的边界与验证方法。",
    createdAt: "2026-10-28T00:00:00Z",
    source: {
      runId: "run-history-2",
      interviewId: "history-A",
      questionNumber: 2,
      commitSha: secondEvidence.commitSha,
      evidenceIds: ["ev1"],
      paths: [nextQuestion.contextPath],
    },
  };
  reportMemory = {
    projectId: project.id,
    window: 40,
    practiced: 0,
    observations: [observation],
    focus: [observation],
    note: "固定验收观察，不调用模型",
  };
  const trainingNav = async () => {
    await evaluate(
      '[...document.querySelectorAll(".nav-item")].find(b=>b.textContent.includes("面试训练")).click()',
    );
  };
  await trainingNav();
  await until(
    '!!document.querySelector(".memory-refresh")',
    "training plan entry",
  );
  await until(
    '!document.querySelector(".memory-refresh").disabled',
    "training plan initially loaded",
  );
  failMemory = 1;
  delayMemory = 500;
  await evaluate('document.querySelector(".memory-refresh").click()');
  await until(
    'document.querySelector(".memory-load-state")?.textContent.includes("正在读取")',
    "memory loading visible",
  );
  await until(
    '!!document.querySelector(".memory-load-error")',
    "memory load error visible",
  );
  assert.ok(await evaluate('!document.querySelector(".memory-empty")'));
  await evaluate('document.querySelector(".memory-load-error button").click()');
  await until(
    'document.querySelectorAll(".memory-item").length===1',
    "memory reload recovery",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".memory-overview").textContent.includes("1 项优先练习")',
    ),
  );
  mismatchMemory = true;
  await evaluate('document.querySelector(".memory-refresh").click()');
  await until(
    'document.querySelector(".memory-load-error")?.textContent.includes("不一致")',
    "mismatched memory rejected",
  );
  mismatchMemory = false;
  await evaluate('document.querySelector(".memory-load-error button").click()');
  await until(
    'document.querySelectorAll(".memory-item").length===1',
    "matching memory restored",
  );
  await evaluate('document.querySelector(".memory-item button").click()');
  await until(
    'document.querySelector(".history-questions button[aria-pressed=true]")?.textContent.includes("第 2 题")',
    "training plan opens source question",
  );
  await close();
  failClear = 1;
  await evaluate('document.querySelector(".memory-clear").click()');
  await evaluate(
    'document.querySelector(".memory-confirm .primary-button").click()',
  );
  await until(
    '!!document.querySelector(".memory-clear-error")',
    "clear error visible and retryable",
  );
  await until(
    '!document.querySelector(".memory-refresh").disabled',
    "clear failure reload settled",
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".memory-item").length'),
    1,
  );
  const beforeMemory = memoryReads;
  delayMemory = 1100;
  await evaluate('document.querySelector(".memory-refresh").click()');
  for (let i = 0; i < 40 && memoryReads === beforeMemory; i++) await delay(25);
  assert.ok(memoryReads > beforeMemory);
  const beforeClear = clearRequests;
  delayClear = 200;
  await evaluate(
    '(()=>{const button=document.querySelector(".memory-confirm .primary-button");button.click();button.click();})()',
  );
  await until(
    '!!document.querySelector(".memory-success")',
    "clear completion feedback",
  );
  await until(
    '!document.querySelector(".memory-load-state")',
    "cleared plan reload",
  );
  await delay(1200);
  assert.equal(clearRequests, beforeClear + 1);
  assert.equal(
    await evaluate('document.querySelectorAll(".memory-item").length'),
    0,
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".memory-success").textContent.includes("1 条") && document.querySelector(".memory-success").textContent.includes("复盘仍保留")',
    ),
  );
  assert.equal(
    await evaluate('document.querySelector("textarea[name=answer]").value'),
    coachedAnswer,
  );
  await evaluate(
    'document.querySelector(".training-memory").scrollIntoView({block:"start"})',
  );
  await shot("training-memory-feedback.png");
  await evaluate(
    '[...document.querySelectorAll(".nav-item")].find(b=>b.textContent.includes("能力报告")).click()',
  );
  await until(
    '!!document.querySelector(".insight-plan-empty")',
    "report reflects cleared training memory",
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".insight-practice-card").length',
    ),
    0,
  );
  // A clear that completes after leaving the training page still refreshes the report.
  reportMemory = {
    ...reportMemory,
    observations: [observation],
    focus: [observation],
  };
  await trainingNav();
  await until(
    'document.querySelectorAll(".memory-item").length===1',
    "memory before navigation race",
  );
  const clearBeforeNavigation = clearRequests;
  delayClear = 700;
  await evaluate('document.querySelector(".memory-clear").click()');
  await evaluate(
    'document.querySelector(".memory-confirm .primary-button").click()',
  );
  for (let i = 0; i < 40 && clearRequests === clearBeforeNavigation; i++)
    await delay(25);
  await evaluate(
    '[...document.querySelectorAll(".nav-item")].find(b=>b.textContent.includes("能力报告")).click()',
  );
  await until(
    'document.querySelectorAll(".insight-practice-card").length===1',
    "report reads while clear pending",
  );
  await until(
    '!!document.querySelector(".insight-plan-empty") && !document.querySelector(".insight-inline-status")',
    "clear updates report after panel unmount",
  );
  assert.equal(clearRequests, clearBeforeNavigation + 1);
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".insight-practice-card").length',
    ),
    0,
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  fs.writeFileSync(
    path.join(directory, "experience-checks.json"),
    JSON.stringify(
      {
        productionFrontendWithFixedAPI: true,
        outlineInsertion: true,
        existingAnswerProtected: true,
        clearConfirmationAndFocus: true,
        clearRemovesDraft: true,
        copySuccessAndFallback: true,
        compositionAndPlainEnterDoNotSubmit: true,
        controlAndMetaEnterSubmit: true,
        failedShortcutKeepsAnswer: true,
        mobileNoOverflow: true,
        memoryLoadingAndErrorRetry: true,
        mismatchedMemoryRejected: true,
        memoryLinksExactQuestion: true,
        clearFailureRetainsMemory: true,
        duplicateClearBlocked: true,
        lateMemoryResponseIgnored: true,
        clearCountAndHistoryNotice: true,
        currentAnswerPreserved: true,
        reportReflectsClearedMemory: true,
        clearWhileNavigatingUpdatesReport: true,
        uncaughtBrowserErrors: 0,
      },
      null,
      2,
    ) + "\n",
  );
  // Finish a restored final question, then keep this session distinct from cumulative data.
  Object.assign(report, structuredClone(reportData));
  Object.assign(evaluation, structuredClone(initialEvaluation));
  delete evaluation.nextQuestion;
  evaluation.completed = true;
  evaluation.questionNumber = 4;
  run = makeRun("completed", "completed");
  noActive = false;
  switchedProject = false;
  authUser = user;
  failNextHistory = true;
  summaryOverride = structuredClone(historyDetail);
  emptyNextB = false;
  const startsBeforeSummary = startRequests;
  const submitsBeforeSummary = submitRequests;
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await reload();
  await until(
    'document.querySelector(".workbench-feedback .primary-button")?.textContent.includes("查看本次小结")',
    "completed question summary entry",
  );
  await evaluate(
    'document.querySelector(".workbench-feedback .primary-button").click()',
  );
  await until(
    '!!document.querySelector(".summary-retry")',
    "summary read failure",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".summary-export").disabled && !document.querySelector(".session-summary-stats")',
    ),
  );
  await evaluate('document.querySelector(".summary-retry").click()');
  await until(
    '!!document.querySelector(".session-summary-stats")',
    "summary read retry",
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".session-question-card").length',
    ),
    4,
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".summary-average").textContent.startsWith("5.8")',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".session-summary-stats").textContent.includes("无法判断 1") && document.querySelector(".session-summary-stats").textContent.includes("演示 1")',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".summary-evidence-gap").textContent.includes("第 2 题")',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelectorAll(".session-question-meter[data-missing=true]").length === 2',
    ),
  );
  assert.equal(startRequests, startsBeforeSummary);
  assert.equal(submitRequests, submitsBeforeSummary);
  await shot("session-summary-desktop.png");
  await evaluate(
    '(()=>{const b=document.querySelectorAll(".session-question-card")[1];b.focus();b.click();})()',
  );
  await until(
    'document.querySelector(".history-questions button[aria-pressed=true]")?.textContent.includes("第 2 题") && document.querySelector(".history-answer h3")?.textContent.includes("评分")',
    "summary opens exact question",
  );
  assert.equal(
    await evaluate('document.querySelectorAll("dialog[open]").length'),
    2,
  );
  await evaluate(
    'document.querySelector(".history-answer .question-source").click()',
  );
  await until(
    '!!document.querySelector("dialog[open] .source-code")',
    "source from summary review",
  );
  assert.equal(
    await evaluate('document.querySelectorAll("dialog[open]").length'),
    3,
  );
  await close(2);
  assert.ok(await evaluate('document.body.style.overflow === "hidden"'));
  await close(1);
  assert.ok(
    await evaluate(
      'document.activeElement===document.querySelectorAll(".session-question-card")[1]',
    ),
  );
  await evaluate(
    '(()=>{window.__summaryBlob=null;window.__originalCreateObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{window.__summaryBlob=blob;return window.__originalCreateObjectURL(blob);};document.querySelector(".summary-export").click();})()',
  );
  await until("!!window.__summaryBlob", "summary export generated");
  assert.ok(
    (await evaluate("window.__summaryBlob.text()")).includes(
      historyAnswers[1].answer,
    ),
  );
  await evaluate("URL.createObjectURL=window.__originalCreateObjectURL");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert.ok(
    await evaluate(
      'document.documentElement.scrollWidth<=innerWidth && document.querySelector(".session-summary-dialog").scrollWidth<=innerWidth',
    ),
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".session-summary-footer").getBoundingClientRect().bottom<=innerHeight+1',
    ),
  );
  await shot("session-summary-mobile.png");
  await evaluate(
    'document.querySelector(".session-summary-scroll").scrollTop=9999',
  );
  await shot("session-summary-mobile-practice.png");
  await close();
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  wrongHistoryProject = true;
  await evaluate(
    'document.querySelector(".workbench-feedback .primary-button").click()',
  );
  await until(
    '!!document.querySelector(".summary-retry")',
    "wrong project rejected in summary",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".session-summary-dialog").textContent.includes("当前项目不一致") && !document.querySelector(".session-question-card")',
    ),
  );
  wrongHistoryProject = false;
  await evaluate('document.querySelector(".summary-retry").click()');
  await until(
    '!!document.querySelector(".session-question-card")',
    "correct project summary retry",
  );
  await close();

  // Closing a delayed read must not revive old cards over a newly opened empty session.
  const readsBeforeSummary = historyReads;
  delayNextHistory = 1000;
  await evaluate(
    'document.querySelector(".workbench-feedback .primary-button").click()',
  );
  for (let i = 0; i < 30 && historyReads === readsBeforeSummary; i++)
    await delay(20);
  assert.ok(historyReads > readsBeforeSummary);
  await close();
  summaryOverride = {
    ...structuredClone(historyDetail),
    answers: [],
    status: "in_progress",
  };
  await evaluate(
    'document.querySelector(".workbench-feedback .primary-button").click()',
  );
  await until(
    'document.querySelector(".session-summary-empty")?.textContent.includes("没有已保存回答")',
    "empty saved session summary",
  );
  await delay(1150);
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".session-question-card").length',
    ),
    0,
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".summary-average").textContent.startsWith("—")',
    ),
  );
  await close();

  summaryOverride = {
    ...structuredClone(historyDetail),
    answers: [historyAnswers[3]],
  };
  await evaluate(
    'document.querySelector(".workbench-feedback .primary-button").click()',
  );
  await until(
    '!!document.querySelector(".session-question-card")',
    "demo-only summary",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".summary-average").textContent.startsWith("—") && document.querySelector(".session-question-card").textContent.includes("演示 · 不计分")',
    ),
  );
  await evaluate('document.querySelector(".summary-report").click()');
  await until(
    '!!document.querySelector(".capability-lab") && !document.querySelector(".session-summary-dialog")',
    "summary to cumulative report",
  );
  summaryOverride = structuredClone(historyDetail);
  await evaluate(
    '[...document.querySelectorAll(".insight-session-actions button")].find(b=>b.textContent.includes("本次小结")).click()',
  );
  await until(
    '!!document.querySelector(".session-summary-stats")',
    "reopen summary from history trend",
  );
  failStart = 1;
  await evaluate('document.querySelector(".summary-start").click()');
  await until(
    '[...document.querySelectorAll(".notice-banner")].some(el=>el.textContent.includes("原题和草稿仍保留"))',
    "summary restart fails safely",
  );
  assert.equal(startRequests, startsBeforeSummary + 1);
  assert.ok(
    await evaluate(
      'document.querySelector(".workbench-feedback").textContent.includes("查看本次小结")',
    ),
  );
  await evaluate(
    'document.querySelector(".workbench-feedback .primary-button").click()',
  );
  await until(
    '!!document.querySelector(".session-summary-stats")',
    "summary preserved after failed start",
  );
  await evaluate('document.querySelector(".summary-start").click()');
  await until(
    'document.querySelector(".workbench-question")?.textContent.includes("本次重点练习失败边界")',
    "next training uses server focus from summary",
  );
  assert.equal(startRequests, startsBeforeSummary + 2);
  assert.equal(submitRequests, submitsBeforeSummary);
  await setAnswer("下一次训练已经写好的回答，取消重开后仍然保留。");
  await evaluate(
    '[...document.querySelectorAll(".nav-item")].find(b=>b.textContent.includes("能力报告")).click()',
  );
  await until(
    '!!document.querySelector(".insight-session-actions")',
    "report while next training unfinished",
  );
  await evaluate(
    '[...document.querySelectorAll(".insight-session-actions button")].find(b=>b.textContent.includes("本次小结")).click()',
  );
  await until(
    '!!document.querySelector(".session-summary-stats")',
    "historical summary while training unfinished",
  );
  await evaluate('document.querySelector(".summary-start").click()');
  await until(
    '!!document.querySelector(".restart-training-dialog[open]")',
    "summary respects unfinished training confirmation",
  );
  assert.equal(startRequests, startsBeforeSummary + 2);
  await evaluate(
    '[...document.querySelectorAll(".restart-training-dialog button")].find(b=>b.textContent.includes("继续当前训练")).click()',
  );
  await until(
    'document.querySelector("textarea[name=answer]")?.value.includes("下一次训练已经写好的回答")',
    "cancel restart retains current draft",
  );
  evaluation.provider = "local-mock";
  run = makeRun("completed", "completed");
  summaryOverride = {
    ...structuredClone(historyDetail),
    answers: [historyAnswers[3]],
  };
  await reload();
  await until(
    'document.querySelector(".workbench-feedback .primary-button")?.textContent.includes("查看本次小结")',
    "saved rule demonstration can open summary",
  );
  await evaluate(
    'document.querySelector(".workbench-feedback .primary-button").click()',
  );
  await until(
    '!!document.querySelector(".session-summary-stats")',
    "saved demonstration summary loaded",
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".summary-average").textContent.startsWith("—")',
    ),
  );
  await close();
  assert.equal(errors.length, 0, errors.join("\n"));
  fs.writeFileSync(
    path.join(directory, "summary-checks.json"),
    JSON.stringify(
      {
        productionFrontendWithFixedAPI: true,
        completedQuestionEntry: true,
        readFailureRetry: true,
        mixedScoresExcludedFromAverage: true,
        perQuestionReviewAndFocus: true,
        threeDialogSourceStack: true,
        exportContainsSavedAnswer: true,
        mobileNoOverflowAndVisibleActions: true,
        wrongProjectRejected: true,
        lateClosedReadIgnored: true,
        emptySessionAndDemoNotZero: true,
        evidenceGapNotWeakness: true,
        cumulativeReportEntry: true,
        failedRestartPreservesCompletedSession: true,
        nextTrainingUsesServerFocus: true,
        unfinishedTrainingRequiresConfirmationAndKeepsDraft: true,
        savedDemonstrationSummaryWithoutModelScore: true,
        noDuplicateEvaluationOnSummaryRead: true,
        uncaughtBrowserErrors: 0,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Browser acceptance passed (production frontend; isolated fixed API; no external model calls).",
  );
  console.log("Artifacts: " + directory);
  await call("Browser.close");
}
main()
  .catch((error) => {
    console.error(error.stack);
    console.error("Artifacts: " + directory);
    process.exitCode = 1;
  })
  .finally(() => {
    socket?.close();
    browser?.kill();
    app?.kill();
    for (const response of streams) response.destroy();
    api.closeAllConnections();
    api.close();
  });
