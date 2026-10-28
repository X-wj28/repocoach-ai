import type { Evaluation } from "@/lib/api";
export const criterionLabels = {
  correctness: "正确性",
  code_evidence: "代码依据",
  tradeoffs: "技术取舍",
  failure_boundaries: "失败边界",
};
export function RubricDetails({
  rubric,
  evidence,
  onSelectEvidence,
}: Pick<Evaluation, "rubric" | "evidence"> & {
  onSelectEvidence?: (
    id: string,
    context: { title: string; reason: string },
  ) => void;
}) {
  if (!rubric) return null;
  return (
    <div className="rubric-details">
      <p>四项评分 · {rubric.judgedCriteria}/4 项可判断 · 模型估计</p>
      {rubric.criteria.map((item) => (
        <section key={item.key}>
          <div>
            <strong>{criterionLabels[item.key]}</strong>
            <span className="rubric-meter" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <i
                  key={index}
                  className={
                    item.score !== null && index < item.score ? "filled" : ""
                  }
                />
              ))}
            </span>
            <span>
              {item.score === null ? "无法判断" : `${item.score} / 4`}
            </span>
          </div>
          <p>{item.reason}</p>
          {item.evidenceIds.map((id) => {
            const source = evidence?.items.find((source) => source.id === id);
            return source ? (
              onSelectEvidence ? (
                <button
                  type="button"
                  className="evidence-link"
                  key={id}
                  onClick={() =>
                    onSelectEvidence(id, {
                      title: criterionLabels[item.key],
                      reason: item.reason,
                    })
                  }
                >
                  <span>{source.path}</span>
                  <small>
                    第 {source.startLine}–{source.endLine} 行 ↗
                  </small>
                </button>
              ) : (
                <details className="code-evidence" key={id}>
                  <summary>
                    {source.path} · 第 {source.startLine}–{source.endLine} 行
                  </summary>
                  <pre>
                    <code>{source.snippet}</code>
                  </pre>
                </details>
              )
            ) : (
              <p className="evidence-missing" key={id}>
                此项引用的代码片段暂不可用。
              </p>
            );
          })}
          {!item.evidenceIds.length && (
            <p className="evidence-missing">此项没有可展示的源码引用。</p>
          )}
        </section>
      ))}
    </div>
  );
}
