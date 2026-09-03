export type Project = {
  id: string;
  name: string;
  url: string;
  visibility: "public";
  stack: string[];
  analyzedFiles: number;
  status: "synced" | "analyzing";
  jobDescription?: string;
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function analyzeProject(repoUrl: string, jobDescription: string) {
  return request<Project>("/projects/analyze", {
    method: "POST",
    body: JSON.stringify({ repoUrl, jobDescription })
  });
}

export function startInterview(projectId: string, jobDescription: string) {
  return request<{ interviewId: string; question: Question; questionNumber: number; totalQuestions: number }>("/interviews/start", {
    method: "POST",
    body: JSON.stringify({ projectId, jobDescription })
  });
}

export function submitInterviewAnswer(interviewId: string, answer: string) {
  return request<Evaluation>(`/interviews/${interviewId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer })
  });
}

