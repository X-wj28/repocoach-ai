"use client";
import { type FormEvent } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Check,
  FileCode2,
  Info,
  LoaderCircle,
  Play,
  ShieldCheck,
} from "lucide-react";
import type { Evaluation, EvaluationRun, Question, RunEvent } from "@/lib/api";
import { getRunStages, stageLabels } from "@/lib/workbench";
import { AnswerComposer } from "./answer-composer";
import { RubricDetails } from "./rubric-details";
import { TrainingInspector, useTrainingInspector } from "./training-inspector";
export type TrainingWorkbenchProps = {
  interviewId?: string | null;
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  answer: string;
  evaluation: Evaluation | null;
  submitted: boolean;
  isSubmitting: boolean;
  isStarting: boolean;
  pendingRun: EvaluationRun | null;
  runEvents: RunEvent[];
  connection: string;
  draftStatus?: "saved" | "unavailable" | null;
  onRetry: () => void;
  onAnswerChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNext: () => void;
};

export function TrainingWorkbench(props: TrainingWorkbenchProps) {
  // Keying the inner workspace resets its selection when the question changes.
  return (
    <Workbench
      key={`${props.interviewId ?? "preview"}:${props.question.id}`}
      {...props}
    />
  );
}

function Workbench({
  interviewId,
  question,
  questionNumber,
  totalQuestions,
  answer,
  evaluation,
  submitted,
  isSubmitting,
  isStarting,
  pendingRun,
  runEvents,
  connection,
  draftStatus,
  onRetry,
  onAnswerChange,
  onSubmit,
  onNext,
}: TrainingWorkbenchProps) {
  const sources = [...(evaluation?.evidence?.items ?? [])];
  if (
    question.evidence &&
    !sources.some(
      (item) =>
        item.path === question.contextPath &&
        item.startLine === question.evidence!.startLine &&
        item.snippet === question.evidence!.snippet,
    )
  ) {
    sources.push({
      id: "question-evidence",
      path: question.contextPath,
      ...question.evidence,
    });
  }
  const inspector = useTrainingInspector(sources);
  const view = inspector.selection?.view;
  const drawerId = inspector.id;
  const { selectEvidence, selectPath } = inspector;
  const stages = getRunStages(pendingRun, isSubmitting);
  const describeStage = (index: number) => {
    if (stages[index] !== "waiting")
      return { active: "执行中", completed: "已完成", failed: "未完成" }[
        stages[index]
      ];
    if (!pendingRun && index === 0) return "等待提交";
    return pendingRun && index === (pendingRun.phase === "scoring" ? 3 : 1)
      ? "等待执行"
      : "等待前序阶段";
  };
  const isPending = !!pendingRun && pendingRun.status !== "completed";
  const failed = pendingRun?.status === "failed";
  const demo = evaluation?.provider === "local-mock";
  const hasRun = !!pendingRun && pendingRun.id !== "legacy";
  const trace = evaluation?.trace;
  const commitSha = evaluation?.evidence?.commitSha ?? trace?.commitSha;
  const connectionLabel =
    connection === "reconnecting"
      ? "连接恢复中 · 回答已保存"
      : connection === "fallback"
        ? "定时检查进度"
        : connection === "connecting"
          ? "正在连接进度"
          : connection === "live"
            ? "进度已连接"
            : "";
  const status = failed
    ? "当前阶段未完成"
    : isPending
      ? pendingRun.status === "pending"
        ? pendingRun.phase === "evidence"
          ? "等待代码查证"
          : "等待评分"
        : pendingRun.phase === "evidence"
          ? "正在查证代码"
          : "正在生成评分"
      : submitted
        ? demo
          ? "本地演示反馈"
          : "反馈已保存"
        : isSubmitting
          ? "正在提交回答"
          : "等待你的回答";
  return (
    <section className="training-workbench question-panel panel">
      <div className="workbench-heading">
        <div>
          <span className="section-kicker">
            <Activity size={14} />
            Agent 训练工作台
          </span>
          <h2>
            项目深挖{" "}
            <span>
              第 {questionNumber} / {totalQuestions} 题
            </span>
          </h2>
        </div>
        <span className="difficulty-tag">{question.difficulty}</span>
      </div>
      <div className="workbench-toolbar">
        <span
          className={`workbench-status${failed ? " status-failed" : ""}`}
          role="status"
        >
          {isPending && !failed ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <span className="status-dot" />
          )}
          {status}
        </span>
        <div className="workbench-actions">
          <button
            type="button"
            onClick={() => inspector.open("process")}
            aria-controls={drawerId}
            aria-expanded={view === "process"}
          >
            <Activity size={14} />
            执行过程
          </button>
          <button
            type="button"
            onClick={() => inspector.open("source")}
            aria-controls={drawerId}
            aria-expanded={view === "source"}
          >
            <FileCode2 size={14} />
            源码依据 <small>{sources.length}</small>
          </button>
        </div>
      </div>
      {(!submitted || hasRun) && (
        <ol className="run-stages" aria-label="本题执行阶段">
          {stageLabels.map((label, index) => (
            <li key={label} data-state={stages[index]}>
              <button
                type="button"
                onClick={() => inspector.open("process")}
                aria-label={`${label}：${describeStage(index)}，查看执行过程`}
              >
                <span className="stage-number">
                  {stages[index] === "completed" ? (
                    <Check size={13} />
                  ) : stages[index] === "active" ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : stages[index] === "failed" ? (
                    "!"
                  ) : (
                    index + 1
                  )}
                </span>
                <span>
                  <strong>{label}</strong>
                  <small>{describeStage(index)}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {connectionLabel && isPending && (
        <p className="workbench-connection" role="status">
          {connectionLabel}
        </p>
      )}
      <div className="workbench-question">
        <div className="workbench-question-label">
          当前问题{" "}
          <span>
            {
              {
                nextjs: "Next.js 应用",
                react: "React 基础",
                engineering: "工程化",
                performance: "性能意识",
              }[question.dimension]
            }
          </span>
        </div>
        <h3>{question.prompt}</h3>
        <button
          type="button"
          className="question-source"
          onClick={() =>
            question.evidence
              ? selectEvidence(
                  sources.find(
                    (item) =>
                      item.path === question.contextPath &&
                      item.startLine === question.evidence!.startLine &&
                      item.snippet === question.evidence!.snippet,
                  )?.id ?? "question-evidence",
                )
              : selectPath(question.contextPath)
          }
        >
          <FileCode2 size={14} />
          <code>{question.contextPath}</code>
          <ArrowUpRight size={14} />
        </button>
      </div>
      {isPending || submitted ? (
        <div className="workbench-saved-answer">
          <div>
            <strong>我的回答</strong>
            <span>
              <Check size={12} />
              {demo ? "本地演示 · 不保存" : "已保存"}
            </span>
          </div>
          <p>{pendingRun?.answer ?? answer}</p>
        </div>
      ) : (
        <AnswerComposer
          answer={answer}
          disabled={isSubmitting || isStarting}
          submitting={isSubmitting}
          draftStatus={draftStatus}
          onChange={onAnswerChange}
          onSubmit={onSubmit}
        />
      )}
      {isPending ? (
        <div
          className={`workbench-pending${failed ? " pending-failed" : ""}`}
          aria-live="polite"
        >
          <div className="pending-symbol">
            {failed ? (
              <Info size={20} />
            ) : (
              <LoaderCircle size={20} className="spin" />
            )}
          </div>
          <div>
            <strong>
              {failed
                ? "评价尚未完成"
                : pendingRun.phase === "evidence"
                  ? "正在查证代码"
                  : "正在生成四项评价"}
            </strong>
            <p>
              {failed
                ? pendingRun.phase === "scoring"
                  ? "回答和代码依据已保存。重试将复用本次依据，从评分阶段继续。"
                  : "回答已保存，当前题目保持不变。重试会重新查证代码。"
                : "回答已保存。可以刷新页面，任务进度会自动恢复。"}
            </p>
            {failed && (
              <>
                <p>
                  {pendingRun.failureCode === "MODEL_CONFIG_CHANGED"
                    ? "模型配置已变化，请恢复提交时的模型配置。"
                    : pendingRun.retryable
                      ? "服务暂不可用或评价格式未通过校验，可以重试当前阶段。"
                      : "已达到本阶段的尝试上限，请开始新的训练或联系维护者。"}
                </p>
                {pendingRun.retryable && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={onRetry}
                    disabled={isSubmitting}
                  >
                    {isSubmitting && (
                      <LoaderCircle size={14} className="spin" />
                    )}
                    重试{pendingRun.phase === "scoring" ? "评分" : "取证"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        submitted &&
        evaluation && (
          <div className="workbench-feedback">
            <div className="workbench-feedback-heading">
              <div>
                <span className="section-kicker">
                  <Check size={14} />
                  反馈已生成
                </span>
                <h3>{demo ? "本地演示反馈" : "本次回答的四项反馈"}</h3>
              </div>
              <div className="workbench-score">
                {demo ? (
                  "不计分"
                ) : evaluation.score === null ? (
                  "无法判断"
                ) : (
                  <>
                    {evaluation.score.toFixed(1)}
                    <small>/ 10</small>
                  </>
                )}
              </div>
            </div>
            {evaluation.note && (
              <p className="feedback-note">{evaluation.note}</p>
            )}
            <RubricDetails
              rubric={evaluation.rubric}
              evidence={evaluation.evidence}
              onSelectEvidence={selectEvidence}
            />
            <div className="feedback-columns">
              <div>
                <span className="feedback-label">做得不错</span>
                {evaluation.strengths.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
              <div>
                <span className="feedback-label">可以补充</span>
                {evaluation.improvements.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            </div>
            <button
              className="primary-button full-button"
              type="button"
              onClick={onNext}
            >
              {evaluation.nextQuestion ? (
                <>
                  <Play size={15} />
                  继续下一题
                </>
              ) : (
                <>
                  <BarChart3 size={15} />
                  {evaluation.completed &&
                  interviewId &&
                  !interviewId.startsWith("local-")
                    ? "查看本次小结"
                    : "查看能力报告"}
                </>
              )}
            </button>
          </div>
        )
      )}
      <div className="workbench-footnote">
        <ShieldCheck size={13} />
        结合具体代码，说明你的判断、取舍与验证方式。
      </div>
      <TrainingInspector
        controller={inspector}
        sources={sources}
        runId={hasRun ? pendingRun.id : undefined}
        events={runEvents}
        connection={connection}
        phase={pendingRun?.phase}
        trace={trace}
        commitSha={commitSha}
        demo={demo}
      />
    </section>
  );
}
