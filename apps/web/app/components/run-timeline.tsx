"use client";
import { useEffect, useState } from "react";
import { getRunEvents, type RunEvent } from "@/lib/api";

const labels: Record<string, string> = {
  "run.created": "回答已保存",
  "run.snapshot": "历史任务状态",
  "run.retried": "重新尝试",
  "evidence.started": "开始查证代码",
  "model.started": "准备分析代码",
  "model.finished": "代码分析返回",
  "tool.started": "开始代码查证",
  "tool.finished": "代码查证返回",
  "evidence.selected": "代码依据已保存",
  "evaluation.started": "开始四项评分",
  "evaluation.finished": "反馈已保存",
  "run.failed": "本次尝试未完成",
};
const tools: Record<string, string> = {
  search_code: "搜索代码",
  read_file: "读取文件",
  get_file_outline: "查看文件结构",
  unrecognized: "未授权工具",
};
export function RunTimeline({
  runId,
  events = [],
  connection,
}: {
  runId?: string;
  events?: RunEvent[];
  connection?: string;
}) {
  const [history, setHistory] = useState<RunEvent[]>([]);
  const [error, setError] = useState(false);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    setHistory([]);
    setError(false);
    if (!opened || !runId || runId === "legacy") return;
    let cancelled = false;
    void (async () => {
      let after = 0;
      try {
        do {
          const page = await getRunEvents(runId, after);
          if (cancelled) return;
          setHistory((old) => [...old, ...page.events]);
          after = page.next;
          if (!page.hasMore) break;
        } while (!cancelled);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, runId]);
  if (!runId || runId === "legacy") return null;
  const merged = Array.from(
    new Map([...history, ...events].map((e) => [e.sequence, e])).values(),
  ).sort((a, b) => a.sequence - b.sequence);
  const link =
    connection === "live"
      ? "进度已连接"
      : connection === "reconnecting"
        ? "重新连接中，回答已保存"
        : connection === "fallback"
          ? "定时检查进度"
          : connection === "connecting"
            ? "正在连接进度"
            : "";
  return (
    <details
      className="run-timeline code-evidence"
      onToggle={(e) => setOpened(e.currentTarget.open)}
    >
      <summary>查看执行过程{link && ` · ${link}`}</summary>
      {error && <p>暂时无法加载历史步骤，刷新后可再次查看。</p>}
      <ol>
        {merged.map((event) => (
          <li key={event.sequence}>
            <strong>{labels[event.type] ?? "运行记录"}</strong>
            {event.payload.name && (
              <span> · {tools[String(event.payload.name)] ?? "代码工具"}</span>
            )}
            {event.payload.path && <code>{String(event.payload.path)}</code>}
            {typeof event.payload.attempt === "number" && (
              <span> · 第{event.payload.attempt}次</span>
            )}
            {event.payload.recovered === true && <span> · 中断后恢复</span>}
            {event.payload.status && (
              <span>
                {" "}
                ·{" "}
                {event.payload.status === "ok"
                  ? "完成"
                  : "范围限制或未获取到结果"}
              </span>
            )}
            <time>{new Date(event.createdAt).toLocaleTimeString("zh-CN")}</time>
          </li>
        ))}
      </ol>
      {!merged.length && !error && <p>展开后加载已保存的执行步骤。</p>}
    </details>
  );
}
