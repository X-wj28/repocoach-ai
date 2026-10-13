"use client";
import { useEffect, useState } from "react";
import {
  clearTrainingMemory,
  getTrainingMemory,
  type TrainingMemory,
  type PracticeFocus,
} from "@/lib/api";

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
  onReview: (id: string) => void;
  onCleared: () => void;
}) {
  const [memory, setMemory] = useState<TrainingMemory | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setMemory(null);
    setError("");
    setConfirming(false);
    if (projectId === "demo-project") return;
    getTrainingMemory(projectId)
      .then((result) => {
        if (!cancelled) setMemory(result);
      })
      .catch(() => {
        if (!cancelled) setError("暂时无法读取训练计划。");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, revision]);
  const clear = async () => {
    setBusy(true);
    setError("");
    try {
      await clearTrainingMemory();
      setMemory(current => current ? { ...current, observations: [], focus: [], practiced: 0 } : null);
      setConfirming(false);
      onCleared();
    } catch {
      setError("清除未完成，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };
  if (projectId === "demo-project") return null;
  return (
    <section className="training-memory panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">下一次怎么练</span>
          <h2>训练计划</h2>
        </div>
        <button
          className="text-button"
          onClick={() => setConfirming(!confirming)}
          disabled={busy}
        >
          清除训练记忆
        </button>
      </div>
      {confirming && (
        <div className="memory-confirm">
          <p>
            清除全部项目的训练记忆。当前题目和原始复盘保留，未来新训练从新观察开始。
          </p>
          <button className="primary-button" disabled={busy} onClick={clear}>
            {busy ? "正在清除" : "确认清除"}
          </button>
          <button
            className="ghost-button"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            取消
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {focus?.length ? (
        <p className="practice-focus">
          本轮重点：{focus.map((f) => f.label).join("、")}
          。题目已按历史观察调整。
        </p>
      ) : null}
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
            className="text-button"
            onClick={() => onReview(item.source.interviewId)}
          >
            查看原题与源码依据
          </button>
        </article>
      ))}
      {memory && !memory.focus.length && (
        <p>
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
                  className="text-button"
                  onClick={() => onReview(item.source.interviewId)}
                >
                  查看第{item.source.questionNumber}题
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="memory-note">
        {memory?.note ?? "训练计划依据你的已保存评价，不影响当前回答的评分。"}
      </p>
    </section>
  );
}
