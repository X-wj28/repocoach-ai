import type { Question } from "../agent/agent.service";

export type ProjectContextForPrompt = {
  name: string;
  url: string;
  stack: string[];
  readmePreview: string;
  files: Array<{ path: string; language: string; snippet: string }>;
};

export function formatProjectContext(project: ProjectContextForPrompt) {
  let remainingCharacters = 32000;
  const files = project.files
    .map((file) => {
      if (remainingCharacters <= 0) return "";
      const snippet = file.snippet.slice(0, Math.min(6000, remainingCharacters));
      remainingCharacters -= snippet.length;
      return `### ${file.path} (${file.language})\n${snippet}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return [
    `项目：${project.name}`,
    `仓库：${project.url}`,
    `技术栈：${project.stack.join(", ")}`,
    `README 摘要：\n${project.readmePreview.slice(0, 1800) || "（无 README）"}`,
    `关键文件：\n${files || "（没有可读取的关键源文件）"}`
  ].join("\n\n");
}

export function parseJsonResponse<T>(content: string): T | null {
  const withoutFence = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(withoutFence) as T;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(withoutFence.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

export function questionSchemaHint() {
  return `只返回 JSON，不要 Markdown：{"prompt":"问题文本","contextPath":"仓库中的文件路径","dimension":"react|nextjs|engineering|performance","difficulty":"基础|进阶|深入"}`;
}

export function evaluationSchemaHint() {
  return `只返回 JSON，不要 Markdown：{"score":0到10的数字,"strengths":["具体优点"],"improvements":["具体改进"],"nextQuestion":{"prompt":"下一道问题","contextPath":"文件路径","dimension":"react|nextjs|engineering|performance","difficulty":"基础|进阶|深入"} }。如果已经没有下一题，将 nextQuestion 设为 null。`;
}

export function isValidQuestion(value: unknown): value is Question {
  if (!value || typeof value !== "object") return false;
  const question = value as Partial<Question>;
  return typeof question.prompt === "string" && typeof question.contextPath === "string" && ["react", "nextjs", "engineering", "performance"].includes(question.dimension ?? "") && ["基础", "进阶", "深入"].includes(question.difficulty ?? "");
}
