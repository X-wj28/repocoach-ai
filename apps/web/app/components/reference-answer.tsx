"use client";

import { useState } from "react";
import { BookOpen, FileCode2 } from "lucide-react";
import type { Evaluation } from "@/lib/api";

export function ReferenceAnswer({
  originalAnswer,
  referenceAnswer,
  evidence,
  demo,
  onSelectEvidence,
}: Pick<Evaluation, "referenceAnswer" | "evidence"> & {
  originalAnswer?: string;
  demo: boolean;
  onSelectEvidence: (
    id: string,
    context: { title: string; reason: string },
  ) => void;
}) {
  const [compare, setCompare] = useState(false);
  return (
    <section className="reference-answer" aria-label="参考答案">
      <h4>
        <BookOpen size={16} />
        参考答案
      </h4>
      {referenceAnswer ? (
        <>
          <p className="reference-answer-note">
            结合本题代码的参考回答，可对照学习并用自己的话表达。
          </p>
          {originalAnswer && (
            <button
              className="ghost-button reference-compare-toggle"
              type="button"
              aria-pressed={compare}
              onClick={() => setCompare((value) => !value)}
            >
              {compare ? "收起原回答" : "对照原回答"}
            </button>
          )}
          <div
            className={`reference-answer-comparison${compare ? " comparing" : ""}`}
          >
            {compare && (
              <div className="reference-original">
                <strong>我的原回答</strong>
                <p>{originalAnswer}</p>
              </div>
            )}
            <div>
              {compare && <strong>参考回答</strong>}
              <p className="reference-answer-content">
                {referenceAnswer.content}
              </p>
            </div>
          </div>
          <div className="reference-answer-sources">
            {referenceAnswer.evidenceIds.map((id) => {
              const source = evidence?.items.find((item) => item.id === id);
              return source ? (
                <button
                  key={id}
                  type="button"
                  className="reference-source-link"
                  onClick={() =>
                    onSelectEvidence(id, {
                      title: "参考答案",
                      reason: referenceAnswer.content,
                    })
                  }
                >
                  <FileCode2 size={13} />
                  <span>
                    {source.path} · 第 {source.startLine}–{source.endLine} 行 ↗
                  </span>
                </button>
              ) : (
                <p className="reference-answer-note" key={id}>
                  此参考答案引用的代码片段暂不可用。
                </p>
              );
            })}
          </div>
        </>
      ) : (
        <p className="reference-answer-note">
          {demo
            ? "当前为演示模式，未生成参考答案。配置可用的模型服务后，新提交的回答会附上参考答案。"
            : "这条记录未保存参考答案；新提交的训练回答会同时生成参考答案。"}
        </p>
      )}
    </section>
  );
}
