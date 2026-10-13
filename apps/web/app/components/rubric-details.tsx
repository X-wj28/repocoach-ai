import type { Evaluation } from "@/lib/api";
const labels = {
  correctness: "正确性",
  code_evidence: "代码依据",
  tradeoffs: "技术取舍",
  failure_boundaries: "失败边界",
};
export function RubricDetails({
  rubric,
  evidence,
}: Pick<Evaluation, "rubric" | "evidence">) {
  if (!rubric) return null;
  return (
    <div className="rubric-details">
      <p>四项评分 · {rubric.judgedCriteria}/4 项可判断 · 模型估计</p>
      {rubric.criteria.map((item) => (
        <section key={item.key}>
          <div>
            <strong>{labels[item.key]}</strong>
            <span>
              {item.score === null ? "无法判断" : `${item.score} / 4`}
            </span>
          </div>
          <p>{item.reason}</p>
          {item.evidenceIds.map((id) => {
            const source = evidence?.items.find((source) => source.id === id);
            return source ? (
              <details className="code-evidence" key={id}>
                <summary>
                  {source.path} · 第 {source.startLine}–{source.endLine} 行
                </summary>
                <pre>
                  <code>{source.snippet}</code>
                </pre>
              </details>
            ) : null;
          })}
        </section>
      ))}
    </div>
  );
}
