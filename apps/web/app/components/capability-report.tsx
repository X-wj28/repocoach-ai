"use client";

import { useId, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  FileCode2,
  Info,
  LoaderCircle,
  Play,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  type CapabilityReport as Report,
  type TrainingMemory,
} from "@/lib/api";
import {
  initialReportDimension,
  sampleLabel,
  sessionTrend,
  trendSegments,
} from "@/lib/report-insights";
import { useTrainingMemory } from "@/lib/use-training-memory";

type Props = {
  projectId: string;
  projectName: string;
  report: Report | null;
  loading: boolean;
  error: string | null;
  memoryRevision: number;
  starting: boolean;
  onRefresh: () => void;
  onStart: () => void;
  onReview: (id: string, questionNumber?: number) => void;
  onSummary: (id: string) => void;
};

export function CapabilityReportView(props: Props) {
  const {
    memory,
    loading: memoryLoading,
    error: memoryError,
    refresh: refreshMemory,
  } = useTrainingMemory(props.projectId, props.memoryRevision);
  const refresh = () => {
    props.onRefresh();
    refreshMemory();
  };
  return (
    <div className="capability-lab">
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            训练洞察
          </div>
          <h1>看清差距，再练一次</h1>
          <p>{props.projectName} · 从评分、历史记录到下一次练习。</p>
        </div>
        <div className="insight-heading-actions">
          <button
            type="button"
            className="ghost-button insight-refresh"
            onClick={refresh}
            disabled={props.loading || memoryLoading}
          >
            <RefreshCw size={15} className={props.loading ? "spin" : ""} />
            刷新报告
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={props.onStart}
            disabled={props.starting}
          >
            <Play size={15} />
            开始下一次训练
          </button>
        </div>
      </div>
      {props.error && (
        <div className="insight-load-error" role="alert">
          <Info size={18} />
          <div>
            <strong>
              {props.report
                ? "更新未完成，正在显示上次读取的报告"
                : "能力报告暂时无法加载"}
            </strong>
            <p>{props.error}</p>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={refresh}
            disabled={props.loading}
          >
            重新加载
          </button>
        </div>
      )}
      {!props.report ? (
        props.loading ? (
          <section className="panel insight-status" role="status">
            <LoaderCircle className="spin" size={26} />
            <h2>正在整理训练数据</h2>
            <p>读取模型评分与最近的训练记录。</p>
          </section>
        ) : !props.error ? (
          <section className="panel insight-status">
            <BarChart3 size={26} />
            <h2>等待训练数据</h2>
            <p>开始训练后，在这里查看有依据的评分与建议。</p>
          </section>
        ) : null
      ) : (
        <ReportContent
          key={props.projectId}
          {...props}
          report={props.report}
          memory={memory}
          memoryLoading={memoryLoading}
          memoryError={!!memoryError}
          onRetryMemory={refreshMemory}
        />
      )}
    </div>
  );
}

function ReportContent({
  report,
  memory,
  memoryLoading,
  memoryError,
  onRetryMemory,
  ...props
}: Props & {
  report: Report;
  memory: TrainingMemory | null;
  memoryLoading: boolean;
  memoryError: boolean;
  onRetryMemory: () => void;
}) {
  const [selectedKey, setSelectedKey] =
    useState<Report["dimensions"][number]["key"]>();
  const selected =
    report.dimensions.find(
      (item) => item.key === (selectedKey ?? initialReportDimension(report)),
    ) ?? report.dimensions[0];
  const dimensionId = useId();
  const measured = report.dimensions.filter(
    (item) => item.answerCount > 0,
  ).length;
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const focus = (memory?.focus ?? []).filter(
    (item) => filter === "all" || item.dimension === selected?.key,
  );
  return (
    <>
      <section className="insight-overview panel" aria-busy={props.loading}>
        <div className="insight-score-block">
          <span className="section-kicker">
            <Activity size={14} />
            可比较模型均分
          </span>
          <div className="insight-score">
            {report.scoredQuestions ? report.averageScore.toFixed(1) : "—"}
            <small>/ 10</small>
          </div>
          <p>
            {report.scoredQuestions
              ? `基于 ${report.scoredQuestions} 道完整模型评价`
              : "尚未获得可比较的模型评分"}
          </p>
        </div>
        <div className="insight-overview-copy">
          <h2>
            {report.hasData
              ? "每个分数，都要放回回答里看"
              : "回答已保存，评分还需要依据"}
          </h2>
          <p>{report.summary}</p>
          <span>
            <Info size={13} />
            模型评价用于复盘，不代表面试通过概率。
          </span>
        </div>
        <div className="insight-stat-pair">
          <div>
            <strong>{report.answeredQuestions}</strong>
            <span>已保存回答</span>
          </div>
          <div>
            <strong>
              {measured}
              <small>/ {report.dimensions.length || 4}</small>
            </strong>
            <span>已评分维度</span>
          </div>
        </div>
      </section>
      <div className="insight-sample-note">
        <span>
          <span className="legend-dot" />
          模型评分 {report.scoredQuestions}
        </span>
        <span>演示 {report.demoQuestions} · 不计分</span>
        <span>无法判断 {report.unjudgedQuestions ?? 0} · 不计分</span>
        <span>统计范围：当前项目全部已保存回答</span>
      </div>

      <section className="insight-middle-grid">
        <section className="panel insight-dimensions">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <Target size={14} />
                能力维度
              </span>
              <h2>先找到值得继续练的方向</h2>
            </div>
            <span className="insight-panel-note">点击维度查看</span>
          </div>
          <div className="insight-dimension-list" aria-label="能力维度选择">
            {report.dimensions.map((item) => (
              <button
                type="button"
                key={item.key}
                className="insight-dimension"
                aria-pressed={selected?.key === item.key}
                aria-controls={dimensionId}
                onClick={() => setSelectedKey(item.key)}
              >
                <span className="insight-dimension-label">
                  {item.label}
                  <small>
                    {item.answerCount
                      ? `${item.answerCount} 道模型评价`
                      : "尚未评分"}
                  </small>
                </span>
                <span className="insight-dimension-track">
                  <i
                    className={`bar-${item.color}`}
                    style={{ width: `${item.answerCount ? item.score : 0}%` }}
                  />
                </span>
                <strong>
                  {item.answerCount ? item.score : "—"}
                  <small>{item.answerCount ? "/100" : ""}</small>
                </strong>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
          {selected && (
            <div
              className="insight-dimension-detail"
              id={dimensionId}
              aria-live="polite"
            >
              <span className="section-kicker">
                {selected.label} ·{" "}
                {selected.answerCount ? "评分解读" : "待覆盖"}
              </span>
              <p>
                {selected.answerCount
                  ? selected.feedback
                  : "这个方向还没有可比较的模型评分。可以继续训练积累回答，当前不把它排为低分项。"}
              </p>
              <small>{sampleLabel(selected.answerCount)}</small>
            </div>
          )}
        </section>
        <SessionTrend
          report={report}
          onReview={props.onReview}
          onSummary={props.onSummary}
        />
      </section>

      <section className="panel insight-practice">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">
              <FileCode2 size={14} />
              从观察到行动
            </span>
            <h2>下一次，带着依据练</h2>
          </div>
          <div className="insight-filter" aria-label="练习重点筛选">
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              全部重点
            </button>
            <button
              type="button"
              aria-pressed={filter === "selected"}
              onClick={() => setFilter("selected")}
            >
              {selected?.label ?? "所选维度"}
            </button>
          </div>
        </div>
        <p className="insight-practice-intro">
          最近 {memory?.window ?? 40}{" "}
          条有代码依据的模型分项观察。这里的筛选用于查看建议；新训练由服务端按最新观察安排，最多强化两个维度。
        </p>
        {memoryLoading ? (
          <p className="insight-inline-status" role="status">
            <LoaderCircle size={15} className="spin" />
            正在读取练习重点…
          </p>
        ) : memoryError ? (
          <div className="insight-inline-status" role="alert">
            练习重点暂时无法读取。
            <button
              type="button"
              className="text-button"
              onClick={onRetryMemory}
            >
              重新加载
            </button>
          </div>
        ) : focus.length ? (
          <div className="insight-practice-grid">
            {focus.map((item, index) => (
              <article key={item.id} className="insight-practice-card">
                <div className="insight-practice-card-top">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.label}</strong>
                  <small>{item.score} / 4</small>
                </div>
                <span className="insight-observation-label">
                  {report.dimensions.find(
                    (dimension) => dimension.key === item.dimension,
                  )?.label ?? item.dimension}{" "}
                  · 第 {item.source.questionNumber} 题的观察
                </span>
                <p>{item.reason}</p>
                <div className="insight-observation-source">
                  <FileCode2 size={13} />
                  <code>{item.source.paths[0] ?? "未记录文件路径"}</code>
                  {item.source.commitSha && (
                    <small>{item.source.commitSha.slice(0, 8)}</small>
                  )}
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    props.onReview(
                      item.source.interviewId,
                      item.source.questionNumber,
                    )
                  }
                >
                  回看第 {item.source.questionNumber} 题与评分依据
                  <ArrowRight size={14} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="insight-plan-empty">
            <Check size={19} />
            <div>
              <strong>
                {filter === "selected"
                  ? `${selected?.label ?? "该维度"}暂没有优先练习观察`
                  : memory?.observations.length
                    ? "最近观察暂未发现优先练习项"
                    : "还没有形成可追溯的练习重点"}
              </strong>
              <p>
                {filter === "selected"
                  ? "可切回全部重点查看其他维度。这不代表该维度已经掌握。"
                  : "完成有引用代码的模型评价后，会在这里保留具体建议与原题入口。"}
              </p>
            </div>
          </div>
        )}
        <div className="insight-practice-footer">
          <p>先核对原题和源码，再在下一次回答中补充技术取舍与失败边界。</p>
          <button
            type="button"
            className="primary-button"
            onClick={props.onStart}
            disabled={props.starting}
          >
            <Play size={15} />
            开始下一次训练
          </button>
        </div>
      </section>
    </>
  );
}

function SessionTrend({
  report,
  onReview,
  onSummary,
}: {
  report: Report;
  onReview: Props["onReview"];
  onSummary: Props["onSummary"];
}) {
  const points = sessionTrend(report.recentSessions);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    points.at(-1)?.id,
  );
  const selected =
    points.find((item) => item.id === selectedId) ?? points.at(-1);
  const x = (index: number) =>
    points.length <= 1 ? 50 : 6 + (index * 88) / (points.length - 1);
  const y = (value: number | null) => (value === null ? 106 : 100 - value * 10);
  const date = (value: string) =>
    new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  return (
    <section className="panel insight-trend">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">
            <TrendingUp size={14} />
            最近训练走势
          </span>
          <h2>把单次表现放进时间里</h2>
        </div>
        <span className="insight-panel-note">最多 6 次</span>
      </div>
      <p className="insight-trend-intro">
        按训练开始时间排列 · 每次训练的模型均分 / 10
      </p>
      {points.length ? (
        <>
          <div className="insight-chart" aria-label="训练得分曲线">
            <div className="insight-chart-axis" aria-hidden="true">
              <span>10</span>
              <span>5</span>
              <span>0</span>
            </div>
            <div className="insight-chart-plot">
              <div className="insight-chart-grid" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {trendSegments(points).map(
                  (segment, index) =>
                    segment.length > 1 && (
                      <polyline
                        key={index}
                        points={segment
                          .map((i) => `${x(i)},${y(points[i].value)}`)
                          .join(" ")}
                      />
                    ),
                )}
              </svg>
              {points.map((point, index) => (
                <button
                  type="button"
                  className="insight-chart-point"
                  data-missing={point.value === null}
                  style={{ left: `${x(index)}%`, top: `${y(point.value)}%` }}
                  key={point.id}
                  aria-pressed={selected?.id === point.id}
                  aria-label={`${date(point.startedAt)}开始，第${index + 1}次训练，${point.value === null ? "无可比较评分" : `${point.value.toFixed(1)}分，${point.scoredQuestions}道模型评价`}`}
                  onClick={() => setSelectedId(point.id)}
                >
                  <span />
                  <span className="insight-chart-value">
                    {point.value === null ? "—" : point.value.toFixed(1)}
                  </span>
                </button>
              ))}
              <div className="insight-chart-dates" aria-hidden="true">
                {points.map((point, index) => (
                  <span style={{ left: `${x(index)}%` }} key={point.id}>
                    {date(point.startedAt)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {selected && (
            <div className="insight-session-detail" aria-live="polite">
              <div>
                <strong>
                  {date(selected.startedAt)} ·{" "}
                  {selected.status === "completed" ? "已完成" : "进行中"}
                </strong>
                <span>
                  {selected.value === null
                    ? "无可比较评分，保留为空缺"
                    : `${selected.value.toFixed(1)} / 10 · ${selected.scoredQuestions} 道模型评价`}{" "}
                  · {selected.questionCount} 道已保存回答
                </span>
              </div>
              <div className="insight-session-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onSummary(selected.id)}
                >
                  本次小结
                  <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onReview(selected.id)}
                >
                  查看复盘
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="insight-trend-empty">
          <TrendingUp size={28} />
          <p>完成回答后，最近训练会出现在这里。</p>
        </div>
      )}
      <p className="insight-trend-footnote">
        空缺不按 0 分连线。题目、样本数和完成状态不同，曲线变化仅供复盘。
      </p>
    </section>
  );
}
