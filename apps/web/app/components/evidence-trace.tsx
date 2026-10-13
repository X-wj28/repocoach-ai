import type { EvidenceTrace } from "@/lib/api";

const actions: Record<string, string> = {
  search_code: "查找代码",
  read_file: "阅读文件",
  get_file_outline: "查看文件结构",
};
const outcomes: Record<EvidenceTrace["outcome"], string> = {
  completed: "评价已完成",
  "provider-error": "模型服务未完成评价",
  "budget-exhausted": "已达到本次分析时限或调用上限",
  "invalid-output": "模型评价格式未通过校验",
};
const statuses: Record<string, string> = {
  ok: "已取得证据",
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
  "outside-loaded-prefix": "该范围超出已加载片段",
};

export function EvidenceTraceDetails({ trace }: { trace?: EvidenceTrace }) {
  if (!trace) return null;
  return (
    <details className="code-evidence evidence-trace">
      <summary>查看分析依据 · {trace.tools.length} 次代码查证</summary>
      <p>
        {outcomes[trace.outcome]} · 用时 {(trace.durationMs / 1000).toFixed(1)}{" "}
        秒
      </p>
      <p>
        {trace.commitSha ? (
          <>
            代码版本 <code>{trace.commitSha.slice(0, 12)}</code>
          </>
        ) : (
          "使用本次训练保存的旧版代码片段"
        )}
      </p>
      {trace.tools.length ? (
        <ol>
          {trace.tools.map((tool, index) => (
            <li key={`${trace.runId}-${index}`}>
              <strong>{actions[tool.name] ?? "未授权的工具"}</strong>
              {" · "}
              {statuses[tool.status] ?? tool.status}
              {tool.path && <code>{tool.path}</code>}
              {tool.query && <span>查询：{tool.query}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p>本次直接使用题目的已保存代码依据。</p>
      )}
    </details>
  );
}
