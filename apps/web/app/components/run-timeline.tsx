"use client";
import { useEffect, useState } from "react";
import { getRunEvents, type RunEvent } from "@/lib/api";
import { formatDuration, toolLabels, toolStatuses } from "@/lib/workbench";

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
export function RunTimeline({
  runId,
  events = [],
  connection,
  expanded = false,
  onSelectPath,
}: {
  runId?: string;
  events?: RunEvent[];
  connection?: string;
  expanded?: boolean;
  onSelectPath?: (path: string) => void;
}) {
  const [history, setHistory] = useState<RunEvent[]>([]);
  const [error, setError] = useState(false);
  const [opened, setOpened] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setHistory([]);
    setError(false);
    if ((!opened && !expanded) || !runId || runId === "legacy") return;
    let cancelled = false;
    setLoading(true);
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, expanded, runId, refresh]);
  if (!runId || runId === "legacy") return null;
  const merged = Array.from(
    new Map(
      [...history, ...events].map((event) => [event.sequence, event]),
    ).values(),
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
  const content = (
    <>
      {expanded && link && (
        <p className="timeline-connection" role="status">
          {link}
        </p>
      )}
      {error && (
        <p role="status">
          暂时无法加载历史步骤。
          <button
            type="button"
            className="text-button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            重新加载
          </button>
        </p>
      )}
      {loading && <p role="status">正在读取已保存的步骤…</p>}
      <ol>
        {merged.map((event) => (
          <li key={event.sequence} data-event-type={event.type}>
            <strong>{labels[event.type] ?? "运行记录"}</strong>
            {event.payload.name && (
              <span>
                {" "}
                · {toolLabels[String(event.payload.name)] ?? "代码工具"}
              </span>
            )}
            {event.payload.path &&
              (onSelectPath ? (
                <button
                  type="button"
                  className="event-source-link"
                  onClick={() => onSelectPath(String(event.payload.path))}
                >
                  {String(event.payload.path)} ↗
                </button>
              ) : (
                <code>{String(event.payload.path)}</code>
              ))}
            {typeof event.payload.durationMs === "number" && (
              <span className="event-duration">
                {" "}
                · {formatDuration(event.payload.durationMs)}
              </span>
            )}
            {typeof event.payload.attempt === "number" && (
              <span> · 第{event.payload.attempt}次</span>
            )}
            {event.payload.recovered === true && <span> · 中断后恢复</span>}
            {event.payload.status && (
              <span>
                {" "}
                ·{" "}
                {toolStatuses[String(event.payload.status)] ?? "结果状态未识别"}
              </span>
            )}
            <time>{new Date(event.createdAt).toLocaleTimeString("zh-CN")}</time>
          </li>
        ))}
      </ol>
      {!merged.length && !error && !loading && <p>暂无已保存的执行步骤。</p>}
    </>
  );
  return expanded ? (
    <div className="run-timeline timeline-expanded">{content}</div>
  ) : (
    <details
      className="run-timeline code-evidence"
      onToggle={(event) => setOpened(event.currentTarget.open)}
    >
      <summary>查看执行过程{link && ` · ${link}`}</summary>
      {content}
    </details>
  );
}
