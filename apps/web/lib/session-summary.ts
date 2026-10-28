import type { InterviewDetail } from "./api";

const labels = {
  correctness: "正确性",
  code_evidence: "代码依据",
  tradeoffs: "技术取舍",
  failure_boundaries: "失败边界",
};
const validScore = (value: number | null, maximum: number): value is number =>
  value !== null && Number.isFinite(value) && value >= 0 && value <= maximum;

export function summarizeInterview(detail: InterviewDetail) {
  const answers = [...detail.answers].sort(
    (a, b) => a.questionNumber - b.questionNumber,
  );
  const scored = answers.filter(
    (item) => item.provider === "deepseek" && validScore(item.score, 10),
  );
  const unjudged = answers.filter(
    (item) => item.provider === "deepseek" && !validScore(item.score, 10),
  );
  // Only a judged criterion with a saved citation can become a practice priority.
  // Missing evidence is a separate review action, never a zero-scoring weakness.
  const priorities = answers
    .filter((item) => item.provider === "deepseek")
    .flatMap((answer) => {
      const criterion = [...(answer.rubric?.criteria ?? [])]
        .filter(
          (item) =>
            validScore(item.score, 4) &&
            item.score <= 2 &&
            item.reason.trim() &&
            item.evidenceIds.some((id) =>
              answer.evidence?.items.some((source) => source.id === id),
            ),
        )
        .sort((a, b) => a.score! - b.score!)[0];
      return criterion
        ? [
            {
              questionNumber: answer.questionNumber,
              label: labels[criterion.key],
              score: criterion.score!,
              reason: criterion.reason,
            },
          ]
        : [];
    })
    .sort((a, b) => a.score - b.score || a.questionNumber - b.questionNumber)
    .slice(0, 2);
  const evidenceGap = unjudged[0];
  return {
    answers,
    scoredCount: scored.length,
    demoCount: answers.length - scored.length - unjudged.length,
    unjudgedCount: unjudged.length,
    average:
      scored.length > 0
        ? scored.reduce((sum, item) => sum + item.score!, 0) / scored.length
        : null,
    priorities,
    evidenceGap: evidenceGap
      ? {
          questionNumber: evidenceGap.questionNumber,
          reason:
            evidenceGap.rubric?.criteria.find(
              (item) => item.score === null && item.reason.trim(),
            )?.reason ??
            "回看当时的回答与代码片段，确认哪些依据不足以支持判断。",
        }
      : null,
  };
}
