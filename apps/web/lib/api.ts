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
};

export type Evaluation = {
  interviewId: string;
  projectId?: string;
  score: number;
  strengths: string[];
  improvements: string[];
  nextQuestion?: Question;
  questionNumber?: number;
  totalQuestions?: number;
  completed?: boolean;
  provider: string;
  note: string;
};

export type CapabilityReport = {
  projectId: string;
  hasData: boolean;
  readinessScore: number;
  averageScore: number;
  answeredQuestions: number;
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
  completedAt: string | null;
  answers: Array<{
    questionNumber: number;
    question: string;
    contextPath: string;
    dimension: Question["dimension"];
    difficulty: Question["difficulty"];
    answer: string;
    score: number;
    strengths: string[];
    improvements: string[];
    provider: string;
    answeredAt: string;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });
  } catch (reason) {
    if (reason instanceof Error && reason.name === "AbortError") {
      throw new Error("后端服务响应超时。Render 免费实例可能正在唤醒，请等待 30 秒后重试。");
    }
    if (reason instanceof TypeError) {
      throw new Error("无法连接后端服务。请确认 API 已部署并处于 Live 状态；如果服务刚休眠，请稍后重试。");
    }
    throw reason;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: string | string[] };
      message = Array.isArray(parsed.message) ? parsed.message.join("；") : parsed.message ?? body;
    } catch {
      // Keep the response body when the server did not return JSON.
    }
    throw new Error(message || `API request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function register(input: { email: string; name: string; password: string }) {
  return request<{ user: User }>("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function login(input: { email: string; password: string }) {
  return request<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify(input) });
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
  return request<{ interviewId: string; projectId: string; question: Question; questionNumber: number; totalQuestions: number; provider: string; mode: string }>("/interviews/start", {
    method: "POST",
    body: JSON.stringify({ projectId, jobDescription, projectUrl })
  });
}

export function getActiveInterview(projectId: string) {
  return request<{ interviewId: string; projectId: string; question: Question; questionNumber: number; totalQuestions: number } | null>(`/interviews/active?projectId=${encodeURIComponent(projectId)}`);
}

export function submitInterviewAnswer(interviewId: string, answer: string) {
  return request<Evaluation>(`/interviews/${interviewId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer })
  });
}

export function getProjectReport(projectId: string) {
  return request<CapabilityReport>(`/reports/projects/${encodeURIComponent(projectId)}`);
}

export function getInterviewDetail(interviewId: string) {
  return request<InterviewDetail>(`/reports/interviews/${encodeURIComponent(interviewId)}`);
}
