import type { CapabilityReport } from "./api";

export function initialReportDimension(report: CapabilityReport) {
  return (
    [...report.dimensions]
      .filter((item) => item.answerCount > 0)
      .sort((a, b) => a.score - b.score)[0]?.key ?? report.dimensions[0]?.key
  );
}

// Keep every recent session in time order, including sessions without a score.
// A gap must never become a zero or a line connecting incomparable sessions.
export function sessionTrend(sessions: CapabilityReport["recentSessions"]) {
  return [...sessions]
    .sort(
      (a, b) =>
        Date.parse(a.startedAt) - Date.parse(b.startedAt) ||
        a.id.localeCompare(b.id),
    )
    .map((session) => ({
      ...session,
      value: session.scoredQuestions > 0 ? session.averageScore : null,
    }));
}

export function trendSegments(points: ReturnType<typeof sessionTrend>) {
  const segments: number[][] = [];
  points.forEach((point, index) => {
    if (point.value === null) return;
    if (index === 0 || points[index - 1].value === null) segments.push([]);
    segments[segments.length - 1].push(index);
  });
  return segments;
}

export function sampleLabel(count: number) {
  return count === 0
    ? "尚无可比较评分"
    : count === 1
      ? "仅一道回答，建议继续验证"
      : `${count} 道模型评价，题目难度可能不同`;
}
