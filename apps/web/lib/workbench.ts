import type { EvaluationRun } from "./api";

export type StageStatus = "waiting" | "active" | "completed" | "failed";
export const stageLabels = [
  "保存回答",
  "代码查证",
  "保存依据",
  "四项评分",
  "完成反馈",
];

// Persisted state remains authoritative when event history is incomplete.
export function getRunStages(
  run: EvaluationRun | null,
  submitting = false,
): StageStatus[] {
  if (!run)
    return [
      submitting ? "active" : "waiting",
      "waiting",
      "waiting",
      "waiting",
      "waiting",
    ];
  if (run.status === "completed") return stageLabels.map(() => "completed");
  const current = run.phase === "scoring" ? 3 : 1;
  return stageLabels.map((_, index) => {
    if (index < current) return "completed";
    if (index > current) return "waiting";
    return run.status === "failed"
      ? "failed"
      : run.status === "pending"
        ? "waiting"
        : "active";
  });
}

export const toolLabels: Record<string, string> = {
  search_code: "搜索代码",
  read_file: "读取文件",
  get_file_outline: "查看文件结构",
  unrecognized: "未授权工具",
};
export const toolStatuses: Record<string, string> = {
  ok: "已取得结果",
  denied: "读取被拒绝",
  "not-indexed": "不在可读文件清单内",
  "read-failed": "文件读取失败",
  "read-budget": "已达到新增文件上限",
  "legacy-snapshot": "旧快照仅支持已保存文件",
  "time-limit": "分析已超时",
  "output-budget": "已达到证据长度上限",
  "invalid-arguments": "工具参数无效",
  "tool-budget": "已达到工具调用上限",
  "no-match-in-loaded-content": "已加载内容中未匹配",
  "empty-range": "请求的行范围为空",
  "outside-loaded-prefix": "超出已加载片段",
};

export function formatDuration(milliseconds: number) {
  return milliseconds < 1000
    ? `${milliseconds} ms`
    : `${(milliseconds / 1000).toFixed(1)} s`;
}
