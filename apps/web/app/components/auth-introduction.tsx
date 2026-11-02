import {
  BarChart3,
  Check,
  Code2,
  FileCode2,
  Github,
  Sparkles,
} from "lucide-react";

export function AuthIntroduction({
  verifying = false,
}: {
  verifying?: boolean;
}) {
  return (
    <section className="auth-brand">
      <div className="brand-row">
        <div className="brand-mark">
          <Code2 size={22} aria-hidden="true" />
        </div>
        <div>
          <div className="brand-name">
            RepoCoach<span className="brand-fe">FE</span>
          </div>
          <div className="brand-caption">你的项目面试教练</div>
        </div>
      </div>

      <div className="auth-story">
        <div className="auth-position">
          <h1>
            写过的代码，
            <br />
            也能从容讲出来。
          </h1>
          <p>
            {verifying
              ? "完成邮箱验证，开始你的项目面试训练。"
              : "从你的 GitHub 项目出发，练习技术表达。每一次追问，都有源码可循。"}
          </p>
        </div>

        <figure className="auth-preview" aria-label="项目面试训练示例">
          <figcaption className="auth-preview-header">
            <span>
              <FileCode2 size={15} aria-hidden="true" /> 一道来自项目的问题
            </span>
            <span className="auth-preview-tag">训练示例</span>
          </figcaption>
          <div className="auth-preview-code">
            <div>
              <span className="preview-line">12</span>
              <code>
                <span className="syntax-keyword">
                  export default async function
                </span>{" "}
                Page() {"{"}
              </code>
            </div>
            <div>
              <span className="preview-line">13</span>
              <code>
                {"  "}
                <span className="syntax-keyword">const</span> products ={" "}
                <span className="syntax-keyword">await</span> getProducts();
              </code>
            </div>
            <div>
              <span className="preview-line">14</span>
              <code>
                {"  "}
                <span className="syntax-keyword">return</span> &lt;
                <span className="syntax-component">ProductList</span> data=
                {"{products}"} /&gt;;
              </code>
            </div>
            <div>
              <span className="preview-line">15</span>
              <code>{"}"}</code>
            </div>
          </div>
          <div className="auth-preview-question">
            <div className="preview-coach">
              <Sparkles size={15} aria-hidden="true" />
              <span>面试官追问</span>
            </div>
            <p>
              为什么把数据请求放在服务端？
              <br />
              如果接口响应变慢，你会怎么处理？
            </p>
            <span className="preview-source">
              <Check size={13} aria-hidden="true" />{" "}
              结合真实代码，练习有依据的回答
            </span>
          </div>
        </figure>
      </div>

      <div className="auth-proof">
        <span>
          <Github size={15} aria-hidden="true" /> 代码级提问
        </span>
        <span>
          <Sparkles size={15} aria-hidden="true" /> 自适应追问
        </span>
        <span>
          <BarChart3 size={15} aria-hidden="true" /> 能力复盘
        </span>
      </div>
    </section>
  );
}
