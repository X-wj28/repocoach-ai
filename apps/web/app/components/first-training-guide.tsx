import { Github, Play } from "lucide-react";

export function FirstTrainingGuide({
  disabled,
  onImport,
  onDemo,
}: {
  disabled: boolean;
  onImport: () => void;
  onDemo: () => void;
}) {
  return (
    <section className="first-training-guide panel" aria-label="首次训练指南">
      <div>
        <span className="section-kicker">从你的项目开始</span>
        <h2>导入代码，让面试问题与你有关</h2>
        <p>
          当前展示的是示例项目。导入自己的公开仓库后，回答、反馈和复盘会保存到账号。
        </p>
      </div>
      <ol>
        <li>
          <strong>1. 导入仓库</strong>
          <span>粘贴公开 GitHub 地址与目标岗位 JD</span>
        </li>
        <li>
          <strong>2. 回答项目问题</strong>
          <span>选择 2 题短练或 4 题完整训练</span>
        </li>
        <li>
          <strong>3. 对照反馈再练</strong>
          <span>核对源码、参考答案，改写自己的表达</span>
        </li>
      </ol>
      <div className="first-training-actions">
        <button className="primary-button" type="button" onClick={onImport}>
          <Github size={15} aria-hidden="true" />
          导入我的项目
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={onDemo}
          disabled={disabled}
        >
          <Play size={15} aria-hidden="true" />
          先体验 2 题示例
        </button>
      </div>
    </section>
  );
}
