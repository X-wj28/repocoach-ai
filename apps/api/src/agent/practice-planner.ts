import type { Question } from "./interview.types";
import { CRITERIA } from "./rubric";

const hints: Record<string, string> = {
  correctness: "区分代码已实现的行为与尚未验证的假设",
  code_evidence: "指出具体调用链与代码片段",
  tradeoffs: "说明方案收益、代价和适用条件",
  failure_boundaries: "说明异常、并发和恢复行为，并给出验证方法",
};
type Observation = {
  criterion: string;
  dimension: string;
  label: string;
  score: number;
  source: { interviewId: string; questionNumber: number; paths: string[] };
};
export function applyPracticeFocus(
  original: Question[],
  observations: Observation[],
) {
  const questions = [...original];
  const focus: Array<{
    criterion: string;
    label: string;
    dimension: string;
    sourceInterviewId: string;
    sourceQuestionNumber: number;
    contextPath: string;
  }> = [];
  for (const item of observations) {
    if (
      focus.length >= 2 ||
      focus.some((f) => f.dimension === item.dimension) ||
      !CRITERIA.some((c) => c.key === item.criterion) ||
      item.score >= 3
    )
      continue;
    const index = questions.findIndex((q) => q.dimension === item.dimension);
    if (index < 0) continue;
    const [question] = questions.splice(index, 1);
    const label = CRITERIA.find((c) => c.key === item.criterion)!.label;
    const adapted: Question = {
      ...question,
      prompt: `${question.prompt} 本次重点练习${label}：请${hints[item.criterion]}。`,
      difficulty: item.score <= 1 ? "基础" : "进阶",
    };
    questions.splice(focus.length, 0, adapted);
    focus.push({
      criterion: item.criterion,
      label: CRITERIA.find((c) => c.key === item.criterion)!.label,
      dimension: item.dimension,
      sourceInterviewId: item.source.interviewId,
      sourceQuestionNumber: item.source.questionNumber,
      contextPath: item.source.paths[0] ?? "",
    });
  }
  return { questions, focus };
}
