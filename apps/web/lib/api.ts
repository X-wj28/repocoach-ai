import { requestJson } from "./http";

export type Project = {
  id: string;
  name: string;
  url: string;
  visibility: "public";
  stack: string[];
  analyzedFiles: number;
  status: "synced" | "analyzing";
  jobDescription?: string;
  description?: string | null;
  defaultBranch?: string;
  owner?: string;
  readmePreview?: string;
  keyFiles?: Array<{ path: string; size: number; language: string }>;
  treeTruncated?: boolean;
  commitSha?: string;
  indexedFiles?: number;
};

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type Question = {
  id: string;
  prompt: string;
  contextPath: string;
  dimension: "react" | "nextjs" | "engineering" | "performance";
  difficulty: "基础" | "进阶" | "深入";
  evidence?: { startLine: number; endLine: number; snippet: string };
};

export type EvidenceTrace = {
  runId: string;
  commitSha?: string;
  snapshot: "pinned" | "legacy";
  outcome: "completed" | "provider-error" | "budget-exhausted" | "invalid-output";
  durationMs: number;
  modelCalls: number;
  promptTokens: number;
  completionTokens: number;
  filesRead: string[];
  tools: Array<{ name: string; status: string; durationMs: number; outputCharacters: number; path?: string; query?: string }>;
};

export type Evaluation = {
  interviewId: string;
  projectId?: string;
  score: number | null;
  strengths: string[];
  improvements: string[];
  nextQuestion?: Question;
  questionNumber?: number;
  totalQuestions?: number;
  completed?: boolean;
  provider: string;
  note: string;
  nextQuestionSource?: "model" | "context-planner" | "none";
  trace?: EvidenceTrace;
  rubric?: { version: string; promptVersion: string; verdict: string; judgedCriteria: number; criteria: Array<{ key: "correctness" | "code_evidence" | "tradeoffs" | "failure_boundaries"; score: number | null; reason: string; evidenceIds: string[] }> };
  evidence?: { items: Array<{ id: string; path: string; startLine: number; endLine: number; snippet: string }>; coverage: string; commitSha?: string };
};

export type EvaluationRun = { id: string; interviewId: string; questionId: string; answer: string; phase: "evidence" | "scoring" | "completed"; status: "pending" | "running" | "failed" | "completed";
  retryable: boolean; attempts: { evidence: number; scoring: number }; failureCode: string | null; evaluation: Evaluation | null; lastEventSeq: number };

export type RunEvent = { sequence: number; type: string; payload: Record<string, string | number | boolean | null | string[]>; createdAt: string };
export type EventPage = { run: EvaluationRun; events: RunEvent[]; next: number; hasMore: boolean };
export type MemoryObservation = { id: string; criterion: string; dimension: string; label: string; score: number; reason: string; createdAt: string;
  source: { runId: string; interviewId: string; questionNumber: number; commitSha: string | null; evidenceIds: string[]; paths: string[] } };
export type TrainingMemory = { projectId: string; window: number; observations: MemoryObservation[]; focus: MemoryObservation[]; practiced: number; note: string };
export type PracticeFocus = { criterion: string; label: string; dimension: string; sourceInterviewId: string; sourceQuestionNumber: number; contextPath: string };

export type CapabilityReport = {
  projectId: string;
  hasData: boolean;
  readinessScore: number;
  averageScore: number;
  answeredQuestions: number;
  scoredQuestions: number;
  demoQuestions: number;
  unjudgedQuestions?: number;
  completedInterviews: number;
  coveredTopics: number;
  summary: string;
  dimensions: Array<{
    key: Question["dimension"];
    label: string;
    color: "teal" | "blue" | "amber" | "rose";
    score: number;
    answerCount: number;
    feedback: string;
  }>;
  strengths: string[];
  improvements: string[];
  nextActions: string[];
  recentSessions: Array<{
    id: string;
    projectName: string;
    status: "in_progress" | "completed";
    questionCount: number;
    scoredQuestions: number;
    averageScore: number;
    startedAt: string;
    completedAt: string | null;
  }>;
};

export type InterviewDetail = {
  id: string;
  projectId: string;
  projectName: string;
  projectUrl: string;
  jobDescription: string;
  status: "in_progress" | "completed";
  totalQuestions: number;
  averageScore: number;
  startedAt: string;
  scoredQuestions: number;
  demoQuestions: number;
  unjudgedQuestions?: number;
  completedAt: string | null;
  answers: Array<{
    runId?: string;
    questionNumber: number;
    question: string;
    contextPath: string;
    dimension: Question["dimension"];
    difficulty: Question["difficulty"];
    answer: string;
    score: number | null;
    strengths: string[];
    improvements: string[];
    provider: string;
    answeredAt: string;
    trace?: EvidenceTrace;
    rubric?: Evaluation["rubric"];
    evidence?: Evaluation["evidence"];
  }>;
};

const localApiBase = "http://localhost:4000/api/v1";
const renderApiBase = "https://repocoach-api.onrender.com/api/v1";

function resolveApiBase() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  const pointsToLocalMachine = configured && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(configured);
  if (configured && !pointsToLocalMachine) return configured;
  if (typeof window !== "undefined" && window.location.hostname === "repocoach-web.onrender.com") return renderApiBase;
  return configured || localApiBase;
}

const API_BASE = resolveApiBase();

async function request<T>(path: string, init?: RequestInit, timeoutMs = 25000): Promise<T> {
  return requestJson<T>(`${API_BASE}${path}`, init, timeoutMs);
}

export function register(input: { email: string; name: string; password: string }) {
  return request<{ user: User; requiresEmailVerification: boolean }>("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function login(input: { email: string; password: string }) {
  return request<{ user: User; requiresEmailVerification: boolean }>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function verifyEmail(input: { email: string; code: string }) {
  return request<{ user: User }>("/auth/verify-email", { method: "POST", body: JSON.stringify(input) });
}

export function resendVerification(email: string) {
  return request<{ success: true }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
}

export function getCurrentUser() {
  return request<{ user: User }>("/auth/me");
}

export function logout() {
  return request<{ success: true }>("/auth/logout", { method: "POST" });
}

export function analyzeProject(repoUrl: string, jobDescription: string) {
  return request<Project>("/projects/analyze", {
    method: "POST",
    body: JSON.stringify({ repoUrl, jobDescription })
  });
}

export function startInterview(projectId: string, jobDescription: string, projectUrl: string) {
  return request<{ interviewId: string; projectId: string; question: Question; questionNumber: number; totalQuestions: number; provider: string; mode: string; practiceFocus?: PracticeFocus[] }>("/interviews/start", {
    method: "POST",
    body: JSON.stringify({ projectId, jobDescription, projectUrl })
  });
}

export function getActiveInterview(projectId: string) {
  return request<{ interviewId: string; projectId: string; question: Question; questionNumber: number; totalQuestions: number; pendingRun?: EvaluationRun | null; practiceFocus?: PracticeFocus[] } | null>(`/interviews/active?projectId=${encodeURIComponent(projectId)}`);
}

export function submitInterviewAnswer(interviewId: string, answer: string, questionId: string) {
  return request<EvaluationRun>(`/interviews/${interviewId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer, questionId })
  }, 65000);
}

export function getEvaluationRun(id: string) { return request<EvaluationRun>(`/interviews/evaluations/${encodeURIComponent(id)}`); }
export function retryEvaluationRun(id: string) { return request<EvaluationRun>(`/interviews/evaluations/${encodeURIComponent(id)}/retry`, { method: "POST" }); }
export function getRunEvents(id: string, after = 0) { return request<EventPage>(`/interviews/evaluations/${encodeURIComponent(id)}/events?after=${after}`); }
export function getTrainingMemory(projectId: string) { return request<TrainingMemory>(`/training-memory?projectId=${encodeURIComponent(projectId)}`); }
export function clearTrainingMemory() { return request<{ cleared: number; historyRetained: true }>("/training-memory/clear", { method: "POST" }); }

export function watchEvaluationRun(id: string, handlers: {
  onState: (run: EvaluationRun) => void; onEvent: (event: RunEvent) => void;
  onConnection: (state: "connecting" | "live" | "reconnecting" | "fallback" | "finished") => void;
}) {
  let stopped = false;
  let cursor = 0;
  let source: EventSource | undefined;
  let fallback: ReturnType<typeof setInterval> | undefined;
  let checking = false;
  const finish = () => { stopped = true; source?.close(); if (fallback) clearInterval(fallback); };
  const state = (run: EvaluationRun) => {
    if (stopped) return;
    handlers.onState(run);
    if (run.status === "completed" || run.status === "failed") { handlers.onConnection("finished"); finish(); }
  };
  const poll = async () => {
    if (stopped || checking) return;
    checking = true;
    try { state(await getEvaluationRun(id)); } catch { /* keep the immutable answer visible */ }
    finally { checking = false; }
  };
  handlers.onConnection("connecting");
  if (typeof EventSource !== "undefined") {
    source = new EventSource(`${API_BASE}/interviews/evaluations/${encodeURIComponent(id)}/stream`, { withCredentials: true });
    source.onopen = () => { if (!stopped) { handlers.onConnection("live"); if (fallback) { clearInterval(fallback); fallback = undefined; } } };
    source.addEventListener("evaluation-event", event => {
      if (stopped) return;
      try { const item = JSON.parse((event as MessageEvent).data) as RunEvent;
        if (Number.isInteger(item.sequence) && item.sequence > cursor) { cursor = item.sequence; handlers.onEvent(item); }
      } catch { /* retry using the provider's last event ID */ }
    });
    source.addEventListener("run-state", event => { try { state(JSON.parse((event as MessageEvent).data)); } catch { /* recovery poll remains available */ } });
    source.onerror = () => { if (!stopped) { handlers.onConnection("reconnecting"); if (!fallback) fallback = setInterval(poll, 5000); void poll(); } };
  } else {
    handlers.onConnection("fallback"); fallback = setInterval(poll, 5000); void poll();
  }
  return finish;
}

export function getProjectReport(projectId: string) {
  return request<CapabilityReport>(`/reports/projects/${encodeURIComponent(projectId)}`);
}

export function getInterviewDetail(interviewId: string) {
  return request<InterviewDetail>(`/reports/interviews/${encodeURIComponent(interviewId)}`);
}
