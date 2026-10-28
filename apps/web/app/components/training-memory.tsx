"use client";
import { useState } from "react";
import { Check, Info, LoaderCircle, RefreshCw } from "lucide-react";
import type { PracticeFocus } from "@/lib/api";
import { useTrainingMemory } from "@/lib/use-training-memory";

export function TrainingMemoryPanel({
  projectId,
  revision,
  focus,
  onReview,
  onCleared,
}: {
  projectId: string;
  revision?: number;
  focus?: PracticeFocus[];
  onReview: (id: string, questionNumber?: number) => void;
  onCleared: () => void;
}) {
  const { memory, loading, error, refresh, clear, clearing, clearError } =
    useTrainingMemory(projectId, revision);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const handleClear = async () => {
    setMessage(null);
    const result = await clear(onCleared);
    if (!result) return;
    setConfirming(false);
    setMessage(
      `已清除全部项目的 ${result.cleared} 条训练观察，原始回答与复盘仍保留。`,
    );
  };
  if (projectId === "demo-project") return null;
  return (
    <section className="training-memory panel" aria-busy={loading || clearing}>
      <div className="panel-heading">
        <div>
          <span className="section-kicker">下一次怎么练</span>
          <h2>训练计划</h2>
        </div>
        <div className="memory-actions">
          <button
            type="button"
            className="text-button memory-refresh"
            onClick={refresh}
            disabled={loading || clearing}
            aria-label="刷新训练计划"
          >
            <RefreshCw size={14} />
            刷新
          </button>
          <button
            type="button"
            className="text-button memory-clear"
            onClick={() => {
              setConfirming(!confirming);
              setMessage(null);
            }}
            disabled={clearing}
          >
            清除训练记忆
          </button>
        </div>
      </div>
      {confirming && (
        <div className="memory-confirm">
          <p>
            清除全部项目的训练记忆。当前题目和原始复盘保留，未来新训练从新观察开始。
          </p>
          {clearError && (
            <p className="memory-clear-error" role="alert">
              未能确认清除结果：{clearError}{" "}
              请重试，或刷新训练计划确认当前记录。
            </p>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={clearing}
            onClick={handleClear}
          >
            {clearing ? "正在清除" : clearError ? "重试清除" : "确认清除"}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setConfirming(false)}
            disabled={clearing}
          >
            取消
          </button>
        </div>
      )}
      {message && (
        <p className="memory-success" role="status">
          <Check size={15} />
          {message}
        </p>
      )}
      {focus?.length ? (
        <p className="practice-focus">
          本轮重点：{focus.map((item) => item.label).join("、")}
          。题目已按历史观察调整。
        </p>
      ) : null}
      {loading ? (
        <p className="memory-load-state" role="status">
          <LoaderCircle size={16} className="spin" />
          正在读取训练计划…
        </p>
      ) : error ? (
        <div className="memory-load-state memory-load-error" role="alert">
          <Info size={16} />
          <div>
            <strong>训练计划暂时无法读取</strong>
            <p>{error}</p>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={refresh}
            disabled={clearing}
          >
            重新加载
          </button>
        </div>
      ) : (
        <>
          {memory && (
            <div className="memory-overview">
              <span>
                最近 {memory.observations.length} / {memory.window} 条观察
              </span>
              <span>{memory.focus.length} 项优先练习</span>
              <span>{memory.practiced} 项近期评分 ≥ 3/4</span>
            </div>
          )}
          {memory?.focus.map((item) => (
            <article key={item.id} className="memory-item">
              <div>
                <strong>{item.label}</strong>
                <span>
                  {item.score}/4 · 第{item.source.questionNumber}题的观察
                </span>
              </div>
              <p>{item.reason}</p>
              <p className="memory-source">
                {item.source.paths.join("、")}
                {item.source.commitSha
                  ? ` · 版本 ${item.source.commitSha.slice(0, 8)}`
                  : ""}
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  onReview(item.source.interviewId, item.source.questionNumber)
                }
              >
                查看原题与源码依据
              </button>
            </article>
          ))}
          {memory && !memory.focus.length && (
            <p className="memory-empty">
              {memory.observations.length
                ? "最近观察中暂未发现需要优先练习的分项，可以继续换场景验证。"
                : "完成有代码依据的模型评价后，这里会形成可追溯的练习重点。"}
            </p>
          )}
          {memory && (
            <details className="memory-history">
              <summary>最近的练习结果 · {memory.observations.length}项</summary>
              <ul>
                {memory.observations.slice(0, 12).map((item) => (
                  <li key={item.id}>
                    {item.label} · {item.score}/4{" "}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        onReview(
                          item.source.interviewId,
                          item.source.questionNumber,
                        )
                      }
                    >
                      查看第{item.source.questionNumber}题
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <p className="memory-note">
        {memory?.note ?? "训练计划依据你的已保存评价，不影响当前回答的评分。"}
      </p>
    </section>
  );
}
