"use client";

import { useId, useState } from "react";
import {
  Activity,
  ChevronRight,
  Clock3,
  FileCode2,
  ShieldCheck,
  X,
} from "lucide-react";
import type { EvaluationRun, EvidenceTrace, RunEvent } from "@/lib/api";
import { formatDuration, toolLabels, toolStatuses } from "@/lib/workbench";
import { DialogSurface } from "./dialog-surface";
import {
  SourceViewer,
  type EvidenceSource,
  type SourceContext,
} from "./source-viewer";
import { RunTimeline } from "./run-timeline";

type InspectorView = "process" | "source";
type Selection = {
  view: InspectorView;
  sourceId?: string;
  missingPath?: string;
  context?: SourceContext | null;
};
export function useTrainingInspector(sources: EvidenceSource[]) {
  const id = useId();
  const [selection, setSelection] = useState<Selection | null>(null);
  return {
    id,
    selection,
    open: (view: InspectorView) => setSelection((old) => ({ ...old, view })),
    close: () => setSelection(null),
    selectEvidence: (sourceId: string, context: SourceContext | null = null) =>
      setSelection({ view: "source", sourceId, context }),
    selectPath: (path: string) => {
      const source = sources.find((item) => item.path === path);
      setSelection({
        view: "source",
        sourceId: source?.id,
        missingPath: source ? undefined : path,
      });
    },
  };
}

export function TrainingInspector({
  controller,
  sources,
  runId,
  events,
  connection,
  phase,
  trace,
  commitSha,
  demo = false,
  historical = false,
  label = "本题训练详情",
}: {
  controller: ReturnType<typeof useTrainingInspector>;
  sources: EvidenceSource[];
  runId?: string;
  events?: RunEvent[];
  connection?: string;
  phase?: EvaluationRun["phase"];
  trace?: EvidenceTrace;
  commitSha?: string;
  demo?: boolean;
  historical?: boolean;
  label?: string;
}) {
  const selection = controller.selection;
  if (!selection) return null;
  const hasRun = runId && runId !== "legacy";
  return (
    <DialogSurface
      id={controller.id}
      label="训练详情侧栏"
      className="workbench-drawer"
      onClose={controller.close}
    >
      <div className="inspector-header">
        <div>
          <span className="section-kicker">{label}</span>
          <h2>{selection.view === "process" ? "执行过程" : "源码依据"}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭训练详情"
          onClick={controller.close}
          autoFocus
        >
          <X size={20} />
        </button>
      </div>
      <div className="inspector-tabs">
        <button
          type="button"
          aria-pressed={selection.view === "process"}
          onClick={() => controller.open("process")}
        >
          <Activity size={15} />
          执行过程
        </button>
        <button
          type="button"
          aria-pressed={selection.view === "source"}
          onClick={() => controller.open("source")}
        >
          <FileCode2 size={15} />
          源码依据 <span>{sources.length}</span>
        </button>
      </div>
      <div className="inspector-body">
        {selection.view === "source" ? (
          <SourceViewer
            sources={sources}
            selectedId={selection.sourceId ?? ""}
            missingPath={selection.missingPath ?? null}
            context={selection.context ?? null}
            commitSha={commitSha}
            onSelect={controller.selectEvidence}
            historical={historical}
          />
        ) : (
          <>
            <div className="process-intro">
              <ShieldCheck size={16} />
              <p>
                展示已保存的阶段与工具记录。
                {phase === "scoring" &&
                  "代码依据已保存，评分重试会复用本次依据。"}
              </p>
            </div>
            {trace && (
              <>
                <div className="process-stats">
                  <div>
                    <strong>{trace.tools.length}</strong>
                    <span>工具调用</span>
                  </div>
                  <div>
                    <strong>{formatDuration(trace.durationMs)}</strong>
                    <span>代码查证用时</span>
                  </div>
                  <div>
                    <strong>{trace.modelCalls}</strong>
                    <span>取证模型调用</span>
                  </div>
                </div>
                <div className="process-tools">
                  <h3>代码工具</h3>
                  {trace.tools.length ? (
                    trace.tools.map((tool, index) => (
                      <article key={index}>
                        <div>
                          <strong>{toolLabels[tool.name] ?? "代码工具"}</strong>
                          <code>{tool.name}</code>
                          <span>{formatDuration(tool.durationMs)}</span>
                        </div>
                        <p data-tool-status={tool.status}>
                          {toolStatuses[tool.status] ?? "结果状态未识别"}
                        </p>
                        {tool.query && (
                          <p className="tool-query">查询：{tool.query}</p>
                        )}
                        {tool.path && (
                          <button
                            type="button"
                            className="event-source-link"
                            onClick={() => controller.selectPath(tool.path!)}
                          >
                            {tool.path}
                            <ChevronRight size={13} />
                          </button>
                        )}
                      </article>
                    ))
                  ) : (
                    <p>本次直接使用题目的已保存代码，没有新增工具调用。</p>
                  )}
                </div>
              </>
            )}
            {hasRun ? (
              <>
                <h3 className="process-events-heading">
                  <Clock3 size={14} />
                  阶段记录
                </h3>
                <RunTimeline
                  runId={runId}
                  events={events}
                  connection={connection}
                  expanded
                  onSelectPath={controller.selectPath}
                />
              </>
            ) : (
              <div className="inspector-empty">
                <Activity size={24} />
                <h3>
                  {demo
                    ? "演示反馈没有执行记录"
                    : historical
                      ? "此记录未保存阶段事件"
                      : "提交后查看真实执行过程"}
                </h3>
                <p>
                  {demo
                    ? "导入公开 GitHub 项目后，可以查看模型取证与工具调用。"
                    : historical
                      ? "旧记录仍可查看回答与反馈，已有源码引用可在另一页核对。"
                      : "旧版任务可能没有保存阶段事件，已有源码引用仍可在另一页查看。"}
                </p>
              </div>
            )}
          </>
        )}
      </div>
      <div className="inspector-footer">
        <ShieldCheck size={13} />
        {historical ? "历史记录 · 只读" : "本题详情"}
        <span>Esc 关闭</span>
      </div>
    </DialogSurface>
  );
}
