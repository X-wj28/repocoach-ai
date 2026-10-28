"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Info,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import { ANSWER_LIMIT } from "@/lib/drafts";
import { DialogSurface } from "./dialog-surface";

const outline = [
  { title: "判断", hint: "先回答为什么、是否合理，或适用条件是什么。" },
  { title: "代码依据", hint: "结合题目中的文件，说明关键实现和数据如何流动。" },
  {
    title: "技术取舍",
    hint: "说明选这个方案的收益、代价，以及另一个方案何时更合适。",
  },
  { title: "失败与验证", hint: "指出可能失效的边界，再给出测试或观察结果。" },
];
const outlineText = "判断：\n\n代码依据：\n\n技术取舍：\n\n失败边界与验证：\n";

export function AnswerComposer({
  answer,
  disabled,
  submitting,
  draftStatus,
  onChange,
  onSubmit,
}: {
  answer: string;
  disabled: boolean;
  submitting: boolean;
  draftStatus?: "saved" | "unavailable" | null;
  onChange: (answer: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const version = useRef(answer);
  version.current = answer;
  const copy = async () => {
    if (!answer || copying) return;
    const currentAnswer = answer;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(currentAnswer);
      if (version.current === currentAnswer) setCopyMessage("回答已复制。");
    } catch {
      if (version.current === currentAnswer) {
        input.current?.focus();
        input.current?.select();
        setCopyMessage("自动复制不可用，已选中回答，请使用系统复制操作。");
      }
    } finally {
      setCopying(false);
    }
  };
  const change = (value: string) => {
    setCopyMessage("");
    onChange(value);
  };
  return (
    <form onSubmit={onSubmit} className="workbench-answer">
      <div className="answer-compose-heading">
        <label className="answer-label" htmlFor={id}>
          你的回答
        </label>
        <button
          type="button"
          className="text-button answer-outline-toggle"
          aria-expanded={showOutline}
          aria-controls={`${id}-outline`}
          onClick={() => setShowOutline((value) => !value)}
        >
          <ListChecks size={14} />
          回答提纲
          <ChevronDown size={13} />
        </button>
      </div>
      {showOutline && (
        <section
          id={`${id}-outline`}
          className="answer-outline"
          aria-label="回答组织提纲"
        >
          <div className="answer-outline-grid">
            {outline.map((item, index) => (
              <div key={item.title}>
                <span>{index + 1}</span>
                <strong>{item.title}</strong>
                <p>{item.hint}</p>
              </div>
            ))}
          </div>
          <div className="answer-outline-footer">
            <p>
              按题目选择重点，用自己的项目细节补全。提纲是表达提示，不代表评分结果。
            </p>
            <button
              type="button"
              className="text-button answer-outline-insert"
              disabled={disabled || !!answer.trim()}
              onClick={() => {
                change(outlineText);
                input.current?.focus();
              }}
            >
              插入空白提纲
            </button>
          </div>
          {!!answer.trim() && (
            <p className="answer-outline-note">
              当前已有回答，提纲仅供参考；插入入口只在回答为空时可用。
            </p>
          )}
        </section>
      )}
      <textarea
        id={id}
        ref={input}
        name="answer"
        value={answer}
        onChange={(event) => change(event.target.value)}
        placeholder="先给出判断，再结合项目代码说明实现、取舍和失败边界……"
        maxLength={ANSWER_LIMIT}
        disabled={disabled}
        aria-describedby={`${id}-draft ${id}-shortcut`}
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" ||
            !(event.ctrlKey || event.metaKey) ||
            event.altKey ||
            event.shiftKey ||
            event.repeat ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
          )
            return;
          event.preventDefault();
          if (!disabled && answer.trim())
            event.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="answer-footer">
        <span>
          建议回答 1–2 分钟 · {answer.length} / {ANSWER_LIMIT} 字
        </span>
        <div className="answer-actions">
          <button
            className="ghost-button answer-copy"
            type="button"
            disabled={!answer || copying}
            onClick={copy}
          >
            {copying ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Copy size={14} />
            )}
            复制回答
          </button>
          <button
            className="ghost-button answer-clear"
            type="button"
            disabled={disabled || !answer}
            onClick={() => setConfirmClear(true)}
          >
            <RefreshCw size={14} />
            清空重写
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={disabled || !answer.trim()}
            aria-keyshortcuts="Control+Enter Meta+Enter"
          >
            {submitting ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Send size={15} />
            )}
            {submitting ? "提交中" : "提交回答"}
          </button>
        </div>
      </div>
      <div className="answer-compose-footnotes">
        <p
          id={`${id}-draft`}
          className={`answer-draft-status${draftStatus === "unavailable" ? " draft-unavailable" : ""}`}
          role="status"
        >
          {draftStatus === "unavailable"
            ? "浏览器无法保存草稿，请在离开或刷新前复制回答。"
            : draftStatus === "saved"
              ? "草稿已保存在此浏览器 · 7 天内可恢复，尚未提交"
              : "输入后自动保存草稿，仅当前账号和此浏览器可见。"}
        </p>
        <span id={`${id}-shortcut`} className="answer-shortcut">
          <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd> 提交
        </span>
      </div>
      {copyMessage && (
        <p className="answer-copy-status" role="status">
          {copyMessage === "回答已复制。" ? (
            <Check size={13} />
          ) : (
            <Info size={13} />
          )}
          {copyMessage}
        </p>
      )}
      {confirmClear && (
        <DialogSurface
          label="清空当前回答"
          className="answer-clear-dialog"
          onClose={() => setConfirmClear(false)}
        >
          <h2>清空当前回答？</h2>
          <p>这会同时移除此题的本机草稿。可以先返回复制回答，再清空重写。</p>
          <div>
            <button
              type="button"
              className="ghost-button"
              autoFocus
              onClick={() => setConfirmClear(false)}
            >
              保留回答
            </button>
            <button
              type="button"
              className="primary-button answer-confirm-clear"
              disabled={disabled}
              onClick={() => {
                change("");
                setConfirmClear(false);
              }}
            >
              确认清空
            </button>
          </div>
        </DialogSurface>
      )}
    </form>
  );
}
