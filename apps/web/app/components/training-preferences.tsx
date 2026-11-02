import type { TrainingPreferences as Preferences } from "@/lib/api";

export function TrainingPreferences({
  value,
  disabled,
  onChange,
}: {
  value: Preferences;
  disabled: boolean;
  onChange: (value: Preferences) => void;
}) {
  return (
    <fieldset className="training-preferences" disabled={disabled}>
      <legend>这次想怎么练？</legend>
      <label>
        训练长度
        <select
          name="questionCount"
          aria-label="训练长度"
          value={value.questionCount}
          onChange={(event) =>
            onChange({
              ...value,
              questionCount: Number(event.target.value) as 2 | 4,
            })
          }
        >
          <option value={4}>完整训练 · 4 题</option>
          <option value={2}>快速练习 · 2 题</option>
        </select>
      </label>
      <label>
        优先练习
        <select
          name="focusDimension"
          aria-label="优先练习"
          value={value.focusDimension ?? "balanced"}
          onChange={(event) =>
            onChange({
              ...value,
              focusDimension:
                event.target.value === "balanced"
                  ? undefined
                  : (event.target.value as Preferences["focusDimension"]),
            })
          }
        >
          <option value="balanced">综合训练 · 按训练计划安排</option>
          <option value="react">React 状态与组件</option>
          <option value="nextjs">Next.js 数据获取</option>
          <option value="engineering">工程化与异常处理</option>
          <option value="performance">性能分析与验证</option>
        </select>
      </label>
      <p>
        所选重点会排在首题，其余题目继续覆盖项目能力；每题建议回答 1–2 分钟。
      </p>
    </fieldset>
  );
}
