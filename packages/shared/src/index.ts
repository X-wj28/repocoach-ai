export type InterviewDimension =
  | "react"
  | "nextjs"
  | "engineering"
  | "performance"
  | "communication";

export type InterviewQuestion = {
  id: string;
  prompt: string;
  contextPath?: string;
  dimension: InterviewDimension;
  difficulty: "基础" | "进阶" | "深入";
};

export type AnswerEvaluation = {
  score: number;
  strengths: string[];
  improvements: string[];
  nextQuestion?: InterviewQuestion;
};

