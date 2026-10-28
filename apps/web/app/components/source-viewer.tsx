"use client";
import { useEffect, useRef } from "react";
import { Check, FileCode2, GitBranch, Info } from "lucide-react";
import type { Evaluation } from "@/lib/api";
export type EvidenceSource = NonNullable<
  Evaluation["evidence"]
>["items"][number];
export type SourceContext = { title: string; reason: string };

export function SourceViewer({
  sources,
  selectedId,
  missingPath,
  context,
  commitSha,
  onSelect,
  historical = false,
}: {
  sources: EvidenceSource[];
  selectedId: string;
  missingPath: string | null;
  context: SourceContext | null;
  commitSha?: string;
  onSelect: (id: string) => void;
  historical?: boolean;
}) {
  const selected = missingPath
    ? undefined
    : (sources.find((item) => item.id === selectedId) ?? sources[0]);
  const code = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (code.current) {
      code.current.scrollTop = 0;
      code.current.scrollLeft = 0;
    }
  }, [selected?.id, missingPath]);
  return (
    <div className="source-inspector">
      <div className="source-version">
        <GitBranch size={14} />
        {commitSha ? (
          <>
            训练代码版本 <code title={commitSha}>{commitSha.slice(0, 12)}</code>
          </>
        ) : (
          "训练保存的片段 · 版本号未提供"
        )}
      </div>
      {sources.length > 0 && (
        <div className="source-list" aria-label="已保存的代码片段">
          {sources.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={selected?.id === item.id}
              onClick={() => onSelect(item.id)}
            >
              <FileCode2 size={14} />
              <span>
                {item.path}
                <small>
                  第 {item.startLine}–{item.endLine} 行
                </small>
              </span>
              {selected?.id === item.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
      {context && (
        <div className="source-reason">
          <span>评分引用 · {context.title}</span>
          <p>{context.reason}</p>
        </div>
      )}
      {selected ? (
        <>
          <div className="source-file-title">
            <code>{selected.path}</code>
            <span>
              第 {selected.startLine}–{selected.endLine} 行 · 只读
            </span>
          </div>
          <div
            className="source-code"
            tabIndex={0}
            aria-label={`${selected.path} 的引用代码`}
            ref={code}
          >
            {selected.snippet.split(/\r?\n/).map((line, index) => (
              <div className="source-line" key={index}>
                <span aria-hidden="true">{selected.startLine + index}</span>
                <code>{line || " "}</code>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="inspector-empty">
          <FileCode2 size={26} />
          <h3>
            {missingPath
              ? "此调用没有可展示的代码片段"
              : "暂无可展示的源码依据"}
          </h3>
          {missingPath && <code>{missingPath}</code>}
          <p>
            {missingPath
              ? "调用记录会保留，但其读取内容没有进入已保存的引用片段。可选择上方其他依据进行核对。"
              : historical
                ? "此记录未保存源码片段。可以继续查看当时的回答与反馈。"
                : "提交回答后，评分引用的已保存代码会出现在这里。旧记录可能没有源码依据。"}
          </p>
        </div>
      )}
      <div className="source-scope">
        <Info size={15} />
        <p>
          这里展示本次训练保存的有限片段。未检索到内容，不代表整个仓库中不存在相关实现。
        </p>
      </div>
    </div>
  );
}
