"use client";
import { Info, LoaderCircle, Play, RefreshCw } from "lucide-react";

export function TrainingState({
  loading,
  error,
  onRestore,
  onStart,
}: {
  loading: boolean;
  error: string | null;
  onRestore: () => void;
  onStart: () => void;
}) {
  return (
    <section className="panel training-state" aria-live="polite">
      {loading ? (
        <>
          <LoaderCircle size={25} className="spin" />
          <h2>正在恢复训练进度</h2>
          <p>确认当前题目和已保存回答，请稍候。</p>
        </>
      ) : error ? (
        <>
          <Info size={25} />
          <h2>暂时无法恢复训练</h2>
          <p>{error}</p>
          <p>恢复完成后再开始作答，避免重复创建训练。</p>
          <button type="button" className="primary-button" onClick={onRestore}>
            <RefreshCw size={15} />
            重新读取进度
          </button>
        </>
      ) : (
        <>
          <Play size={25} />
          <h2>准备开始一次项目面试</h2>
          <p>围绕真实代码练习判断、依据、取舍与失败边界。</p>
          <button type="button" className="primary-button" onClick={onStart}>
            <Play size={15} />
            开始训练
          </button>
        </>
      )}
    </section>
  );
}
