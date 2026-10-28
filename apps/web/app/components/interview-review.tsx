"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  FileCode2,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { getInterviewDetail, type InterviewDetail } from "@/lib/api";
import { DialogSurface } from "./dialog-surface";
import { RubricDetails } from "./rubric-details";
import { TrainingInspector, useTrainingInspector } from "./training-inspector";

type SavedAnswer = InterviewDetail["answers"][number];
const dimensions = {
  react: "React 基础",
  nextjs: "Next.js 应用",
  engineering: "工程化",
  performance: "性能意识",
};
function scoreLabel(answer: SavedAnswer) {
  return answer.provider !== "deepseek"
    ? "演示 · 不计分"
    : answer.score === null
      ? "无法判断"
      : `${answer.score.toFixed(1)} / 10`;
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function InterviewReview({
  sessionId,
  initialQuestionNumber,
  onClose,
  onExport,
}: {
  sessionId: string;
  initialQuestionNumber?: number;
  onClose: () => void;
  onExport: (detail: InterviewDetail) => void;
}) {
  const [detail, setDetail] = useState<InterviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const contentId = useId();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setError(null);
    setSelectedNumber(null);
    void getInterviewDetail(sessionId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setSelectedNumber(
          result.answers.some(
            (answer) => answer.questionNumber === initialQuestionNumber,
          )
            ? initialQuestionNumber!
            : ([...result.answers].sort(
                (a, b) => a.questionNumber - b.questionNumber,
              )[0]?.questionNumber ?? null),
        );
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "暂时无法读取训练复盘。",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, initialQuestionNumber, revision]);
  useEffect(() => {
    if (scrollArea.current) scrollArea.current.scrollTop = 0;
  }, [selectedNumber]);
  const answers = detail
    ? [...detail.answers].sort((a, b) => a.questionNumber - b.questionNumber)
    : [];
  const selected = answers.find(
    (answer) => answer.questionNumber === selectedNumber,
  );
  const selectedIndex = answers.findIndex(
    (answer) => answer.questionNumber === selectedNumber,
  );
  const questionCount = detail
    ? Math.max(
        detail.totalQuestions,
        ...answers.map((answer) => answer.questionNumber),
      )
    : 0;
  return (
    <DialogSurface
      label="训练复盘"
      className="review-modal interview-review-dialog"
      onClose={onClose}
    >
      <header className="history-header">
        <div>
          <span className="section-kicker">
            <BookOpen size={14} />
            训练复盘
          </span>
          <h2 id="review-modal-title">
            {detail?.projectName ?? "读取训练记录"}
          </h2>
          <p>按题回看回答，核对评分引用的代码。</p>
        </div>
        <div className="history-header-actions">
          <button
            className="ghost-button"
            type="button"
            aria-label="导出本次训练的 Markdown 复盘"
            disabled={!detail || loading}
            onClick={() => detail && onExport(detail)}
          >
            <Download size={15} />
            <span>导出 Markdown</span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭复盘"
            onClick={onClose}
            autoFocus
          >
            <X size={20} />
          </button>
        </div>
      </header>
      {loading ? (
        <div className="history-status" role="status">
          <LoaderCircle size={25} className="spin" />
          <h3>正在读取完整复盘</h3>
          <p>整理本次训练保存的回答、评分和代码依据。</p>
        </div>
      ) : error ? (
        <div className="history-status history-error" role="alert">
          <Info size={25} />
          <h3>暂时无法加载复盘</h3>
          <p>{error}</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={15} />
            重新加载
          </button>
        </div>
      ) : (
        detail && (
          <>
            <div className="history-summary">
              <div>
                <strong>
                  {detail.scoredQuestions
                    ? detail.averageScore.toFixed(1)
                    : "—"}
                  <small>{detail.scoredQuestions ? "/ 10" : ""}</small>
                </strong>
                <span>可比较模型均分 · {detail.scoredQuestions} 题</span>
              </div>
              <div>
                <strong>
                  {answers.length}
                  <small>/ {detail.totalQuestions}</small>
                </strong>
                <span>已保存回答</span>
              </div>
              <div>
                <strong>
                  {detail.status === "completed" ? "已完成" : "进行中"}
                </strong>
                <span>{dateLabel(detail.completedAt ?? detail.startedAt)}</span>
              </div>
            </div>
            <nav className="history-questions" aria-label="复盘题目">
              {Array.from({ length: questionCount }, (_, index) => {
                const answer = answers.find(
                  (item) => item.questionNumber === index + 1,
                );
                return (
                  <button
                    type="button"
                    key={index}
                    disabled={!answer}
                    aria-pressed={selectedNumber === index + 1}
                    aria-controls={contentId}
                    onClick={() => setSelectedNumber(index + 1)}
                  >
                    <span className="history-question-number">{index + 1}</span>
                    <span>
                      <strong>第 {index + 1} 题</strong>
                      <small>{answer ? scoreLabel(answer) : "尚未回答"}</small>
                    </span>
                    {answer && <Check size={13} />}
                  </button>
                );
              })}
            </nav>
            <div className="history-content" id={contentId} ref={scrollArea}>
              {selected ? (
                <>
                  <ReviewQuestion
                    key={`${detail.id}:${selected.questionNumber}`}
                    answer={selected}
                  />
                  <div className="history-pagination">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={selectedIndex <= 0}
                      onClick={() =>
                        setSelectedNumber(
                          answers[selectedIndex - 1].questionNumber,
                        )
                      }
                    >
                      <ArrowLeft size={14} />
                      上一题
                    </button>
                    <span>
                      已保存回答 {selectedIndex + 1} / {answers.length}
                    </span>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={selectedIndex >= answers.length - 1}
                      onClick={() =>
                        setSelectedNumber(
                          answers[selectedIndex + 1].questionNumber,
                        )
                      }
                    >
                      下一题
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="history-status">
                  <BookOpen size={24} />
                  <h3>这次训练尚未保存回答</h3>
                  <p>提交回答并完成评价后，可以在这里逐题复盘。</p>
                </div>
              )}
            </div>
            <footer className="history-footer">
              <ShieldCheck size={13} />
              历史复盘只读 · 不会重新调用模型
              <span>演示与无法判断的评价不计入可比较均分</span>
            </footer>
          </>
        )
      )}
    </DialogSurface>
  );
}

function ReviewQuestion({ answer }: { answer: SavedAnswer }) {
  const sources = answer.evidence?.items ?? [];
  const inspector = useTrainingInspector(sources);
  const demo = answer.provider !== "deepseek";
  return (
    <article className="history-answer review-item">
      <div className="history-answer-meta">
        <span>
          {dimensions[answer.dimension]} · {answer.difficulty}
        </span>
        <time dateTime={answer.answeredAt}>{dateLabel(answer.answeredAt)}</time>
      </div>
      <h3>{answer.question}</h3>
      <button
        type="button"
        className="question-source"
        onClick={() => inspector.selectPath(answer.contextPath)}
      >
        <FileCode2 size={14} />
        <code>{answer.contextPath}</code>
        <ArrowRight size={13} />
      </button>
      <div className="history-detail-actions">
        <button
          type="button"
          aria-controls={inspector.id}
          aria-expanded={inspector.selection?.view === "process"}
          onClick={() => inspector.open("process")}
        >
          <Activity size={14} />
          执行过程
        </button>
        <button
          type="button"
          aria-controls={inspector.id}
          aria-expanded={inspector.selection?.view === "source"}
          onClick={() => inspector.open("source")}
        >
          <FileCode2 size={14} />
          源码依据 <span>{sources.length}</span>
        </button>
      </div>
      <section className="history-saved-answer">
        <div>
          <strong>我的回答</strong>
          <span>
            <Check size={12} />
            已保存
          </span>
        </div>
        <p>{answer.answer}</p>
      </section>
      <section className="history-feedback">
        <div className="history-feedback-heading">
          <div>
            <span className="section-kicker">
              {demo ? "演示反馈" : "本题评价"}
            </span>
            <h4>
              {demo
                ? "此反馈不计入能力评分"
                : answer.score === null
                  ? "部分依据不足，保留具体反馈"
                  : answer.rubric
                    ? "四项评分与改进建议"
                    : "评价与改进建议"}
            </h4>
          </div>
          <strong className="history-answer-score">{scoreLabel(answer)}</strong>
        </div>
        {demo ? (
          <p className="history-feedback-note">
            此记录来自演示模式，原始回答与建议仍可回看。
          </p>
        ) : (
          !answer.rubric && (
            <p className="history-feedback-note">
              此旧记录没有保存四项评分，保留当时的整体评价与建议。
            </p>
          )
        )}
        <RubricDetails
          rubric={answer.rubric}
          evidence={answer.evidence}
          onSelectEvidence={inspector.selectEvidence}
        />
        <div className="history-feedback-columns">
          <div>
            <h4>做得不错</h4>
            {answer.strengths.length ? (
              answer.strengths.map((text, index) => <p key={index}>{text}</p>)
            ) : (
              <p>此记录未保存具体优点。</p>
            )}
          </div>
          <div>
            <h4>可以补充</h4>
            {answer.improvements.length ? (
              answer.improvements.map((text, index) => (
                <p key={index}>{text}</p>
              ))
            ) : (
              <p>此记录未保存具体建议。</p>
            )}
          </div>
        </div>
      </section>
      <TrainingInspector
        controller={inspector}
        sources={sources}
        runId={answer.runId}
        trace={answer.trace}
        commitSha={answer.evidence?.commitSha ?? answer.trace?.commitSha}
        demo={demo}
        historical
        label={`第 ${answer.questionNumber} 题 · 历史记录`}
      />
    </article>
  );
}
