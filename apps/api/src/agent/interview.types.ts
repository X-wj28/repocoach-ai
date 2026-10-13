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
  outcome:
    "completed" | "provider-error" | "budget-exhausted" | "invalid-output";
  durationMs: number;
  modelCalls: number;
  promptTokens: number;
  completionTokens: number;
  filesRead: string[];
  tools: Array<{
    name: string;
    status: string;
    durationMs: number;
    outputCharacters: number;
    path?: string;
    query?: string;
  }>;
};

export type InterviewEvaluation = {
  interviewId: string;
  projectId: string;
  score: number | null;
  strengths: string[];
  improvements: string[];
  nextQuestion?: Question;
  questionNumber: number;
  totalQuestions: number;
  completed: boolean;
  provider: "deepseek" | "local-mock";
  note: string;
  nextQuestionSource: "model" | "context-planner" | "none";
  trace?: EvidenceTrace;
  rubric?: import("./rubric").RubricResult;
  evidence?: import("./rubric").EvidenceBundle;
  scoring?: {
    model: string;
    durationMs: number;
    promptTokens: number;
    completionTokens: number;
    attempt: number;
  };
};
