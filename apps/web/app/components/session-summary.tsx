"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Download,
  Info,
  LoaderCircle,
  Play,
  RefreshCw,
  Target,
  X,
} from "lucide-react";
import { getInterviewDetail, type InterviewDetail } from "@/lib/api";
import { summarizeInterview } from "@/lib/session-summary";
import { DialogSurface } from "./dialog-surface";

export function SessionSummary({
  sessionId,
  projectId,
  starting,
  onClose,
  onReview,
  onExport,
  onReport,
  onStart,
}: {
  sessionId: string;
  projectId: string;
  starting: boolean;
  onClose: () => void;
  onReview: (id: string, questionNumber?: number) => void;
  onExport: (detail: InterviewDetail) => void;
  onReport: () => void;
  onStart: () => void;
}) {
  const [detail, setDetail] = useState<InterviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setError(null);
    void getInterviewDetail(sessionId)
      .then((result) => {
        if (cancelled) return;
        if (result.id !== sessionId || result.projectId !== projectId)
          throw new Error("训练记录与当前项目不一致，请关闭后重新打开。");
        setDetail(result);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "暂时无法读取本次小结。",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, projectId, revision]);
  const summary = detail ? summarizeInterview(detail) : null;
  return (
    <DialogSurface
      label="本次训练小结"
      className="session-summary-dialog"
      onClose={onClose}
    >
      <header className="session-summary-header">
        <div>
          <span className="section-kicker">
            <CheckCircle2 size={14} /> 本次训练小结
          </span>
          <h2>{detail?.projectName ?? "回看这一次，再决定下一步"}</h2>
          <p>
            {detail?.status === "in_progress"
              ? "这场训练尚未完成，以下仅包含已保存的回答。"
              : "汇总本次保存的回答与评价，累计表现请查看能力报告。"}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭本次小结"
          onClick={onClose}
          autoFocus
        >
          <X size={20} />
        </button>
      </header>
      <div className="session-summary-scroll">
        {loading ? (
          <div className="history-status" role="status">
            <LoaderCircle size={25} className="spin" />
            <h3>正在整理本次训练</h3>
            <p>读取已保存记录，不会重新评分或开始新训练。</p>
          </div>
        ) : error ? (
          <div className="history-status history-error" role="alert">
            <Info size={25} />
            <h3>本次小结暂时无法加载</h3>
            <p>{error}</p>
            <button
              type="button"
              className="primary-button summary-retry"
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw size={15} />
              重新加载小结
            </button>
          </div>
        ) : detail && summary ? (
          <>
            <section
              className="session-summary-stats"
              aria-label="本次训练统计"
            >
              <div>
                <span>本次模型均分</span>
                <strong className="summary-average">
                  {summary.average === null ? "—" : summary.average.toFixed(1)}
                  <small>
                    {summary.average === null ? "暂无可比较评分" : "/ 10"}
                  </small>
                </strong>
              </div>
              <div>
                <span>已保存回答</span>
                <strong>
                  {summary.answers.length}
                  <small>/ {detail.totalQuestions} 题</small>
                </strong>
              </div>
              <div>
                <span>有效模型总分</span>
                <strong>
                  {summary.scoredCount}
                  <small>题</small>
                </strong>
              </div>
              <div>
                <span>不计入均分</span>
                <strong>
                  {summary.unjudgedCount + summary.demoCount}
                  <small>题</small>
                </strong>
                <p>
                  无法判断 {summary.unjudgedCount} · 演示 {summary.demoCount}
                </p>
              </div>
            </section>
            <section className="session-summary-results" aria-label="逐题结果">
              <div className="session-summary-section-heading">
                <h3>每一道回答，都有复盘入口</h3>
                <span>点击进入当时的回答和源码</span>
              </div>
              {summary.answers.length ? (
                <div className="session-question-grid">
                  {summary.answers.map((item) => {
                    const model = item.provider === "deepseek";
                    const scored =
                      model &&
                      item.score !== null &&
                      Number.isFinite(item.score) &&
                      item.score >= 0 &&
                      item.score <= 10;
                    const label = !model
                      ? "演示 · 不计分"
                      : !scored
                        ? "无法判断"
                        : `${item.score!.toFixed(1)} / 10`;
                    return (
                      <button
                        type="button"
                        className="session-question-card"
                        key={item.questionNumber}
                        onClick={() => onReview(sessionId, item.questionNumber)}
                        aria-label={`复盘第 ${item.questionNumber} 题，${label}`}
                      >
                        <div>
                          <span>第 {item.questionNumber} 题</span>
                          <strong>{label}</strong>
                          <ArrowRight size={14} />
                        </div>
                        <p>{item.question}</p>
                        <code>{item.contextPath}</code>
                        <span
                          className="session-question-meter"
                          data-missing={!scored}
                          aria-hidden="true"
                        >
                          <span
                            style={{
                              width: scored ? `${item.score! * 10}%` : "0%",
                            }}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="session-summary-empty">
                  这场训练还没有已保存回答；关闭小结后可继续当前训练。
                </p>
              )}
            </section>
            <section
              className="session-summary-practice"
              aria-label="本次复盘建议"
            >
              <div className="session-summary-section-heading">
                <h3>
                  <Target size={16} />
                  先复盘，再练习
                </h3>
                <span>仅依据本次保存的评价</span>
              </div>
              {summary.priorities.map((item) => (
                <div
                  className="session-practice-item"
                  key={item.questionNumber}
                >
                  <div>
                    <span>优先回看 · 第 {item.questionNumber} 题</span>
                    <strong>
                      {item.label} · {item.score} / 4
                    </strong>
                    <p>{item.reason}</p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onReview(sessionId, item.questionNumber)}
                  >
                    查看依据
                    <ArrowRight size={14} />
                  </button>
                </div>
              ))}
              {summary.evidenceGap && (
                <div className="session-practice-item summary-evidence-gap">
                  <div>
                    <span>
                      补齐依据 · 第 {summary.evidenceGap.questionNumber} 题
                    </span>
                    <strong>无法判断不代表得零分</strong>
                    <p>{summary.evidenceGap.reason}</p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      onReview(sessionId, summary.evidenceGap!.questionNumber)
                    }
                  >
                    核对缺口
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {!summary.priorities.length && !summary.evidenceGap && (
                <p className="session-summary-empty">
                  {summary.scoredCount
                    ? "本次没有可引用的低分分项建议。可挑选一道题，核对代码后尝试脱离提纲重新表达。"
                    : "获得有依据的模型评价后，才能生成练习重点。演示反馈可帮助熟悉流程。"}
                </p>
              )}
              <p className="session-summary-note">
                <Info size={13} />
                下一次训练会使用当前训练记忆安排重点；本次小结保留原记录，清除记忆不会删除它。
              </p>
            </section>
          </>
        ) : null}
      </div>
      <footer className="session-summary-footer">
        <div>
          <button
            type="button"
            className="ghost-button summary-export"
            disabled={!detail || loading}
            onClick={() => detail && onExport(detail)}
          >
            <Download size={14} />
            导出复盘
          </button>
          <button
            type="button"
            className="ghost-button summary-review"
            disabled={!detail || !summary?.answers.length || loading}
            onClick={() => onReview(sessionId)}
          >
            <BookOpen size={14} />
            逐题复盘
          </button>
        </div>
        <div>
          <button
            type="button"
            className="ghost-button summary-report"
            onClick={onReport}
          >
            <BarChart3 size={14} />
            累计报告
          </button>
          <button
            type="button"
            className="primary-button summary-start"
            disabled={starting}
            onClick={onStart}
          >
            <Play size={14} />
            开始下一次训练
          </button>
        </div>
      </footer>
    </DialogSurface>
  );
}
