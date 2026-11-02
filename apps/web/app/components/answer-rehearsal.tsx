"use client";

import { useId, useState } from "react";
import { PencilLine, Check } from "lucide-react";
import {
  ANSWER_LIMIT,
  readDraft,
  writeDraft,
  type DraftIdentity,
} from "@/lib/drafts";

export function AnswerRehearsal({
  userId,
  identity,
  originalAnswer,
}: {
  userId: string;
  identity: DraftIdentity;
  originalAnswer: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [available, setAvailable] = useState(true);
  const [ready, setReady] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const begin = () => {
    if (!ready) {
      let result = { answer: "", available: false };
      try {
        result = readDraft(window.localStorage, userId, identity);
      } catch {
        /* storage may be blocked */
      }
      setDraft(result.answer);
      setAvailable(result.available);
      setReady(true);
    }
    setOpen((value) => !value);
  };
  return (
    <section className="answer-rehearsal" aria-label="改写练习">
      <button
        className="ghost-button"
        type="button"
        onClick={begin}
        aria-expanded={open}
        aria-controls={id}
      >
        <PencilLine size={15} aria-hidden="true" />
        {open ? "收起改写练习" : "对照反馈，改写一次"}
      </button>
      {open && (
        <div id={id}>
          <p className="rehearsal-intro">
            先修正一个具体问题，再用自己的话完整回答。练习稿保存在此浏览器 7
            天，不覆盖已提交回答，也不产生新评分。
          </p>
          <div className="rehearsal-comparison">
            <div>
              <h4>原回答</h4>
              <p>{originalAnswer}</p>
            </div>
            <label htmlFor={`${id}-answer`}>
              <span>我的改写</span>
              <textarea
                id={`${id}-answer`}
                name="rehearsal"
                autoComplete="off"
                value={draft}
                maxLength={ANSWER_LIMIT}
                placeholder="根据参考答案补充具体代码、取舍与验证，组织成自己的表达。"
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft(value);
                  setReviewed(false);
                  let saved = false;
                  try {
                    saved = writeDraft(
                      window.localStorage,
                      userId,
                      identity,
                      value,
                    );
                  } catch {
                    /* show storage failure */
                  }
                  setAvailable(saved);
                }}
              />
            </label>
          </div>
          <div className="rehearsal-footer">
            <p role="status">
              {!available
                ? "浏览器无法保存练习稿，请离开前手动复制。"
                : draft
                  ? "练习稿已保存在此浏览器"
                  : "输入后自动保存练习稿"}{" "}
              · {draft.length}/{ANSWER_LIMIT} 字
            </p>
            <button
              className="ghost-button"
              type="button"
              disabled={!draft.trim()}
              onClick={() => setReviewed((value) => !value)}
              aria-pressed={reviewed}
            >
              <Check size={14} aria-hidden="true" />
              {reviewed ? "本次已自查" : "我已核对代码与边界"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
