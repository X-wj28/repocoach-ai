"use client";

import { FormEvent, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  FileCode2,
  Github,
  GitPullRequest,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Play,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  X
} from "lucide-react";
import {
  analyzeProject,
  Evaluation,
  Project,
  Question,
  startInterview,
  submitInterviewAnswer
} from "@/lib/api";

const navItems = [
  { label: "工作台", icon: LayoutDashboard },
  { label: "面试训练", icon: Play },
  { label: "能力报告", icon: BarChart3 },
  { label: "项目设置", icon: Settings2 }
];

const dimensions = [
  { label: "React 基础", value: 78, color: "teal" },
  { label: "Next.js 应用", value: 64, color: "blue" },
  { label: "工程化", value: 52, color: "amber" },
  { label: "性能意识", value: 41, color: "rose" }
];

const fallbackProject: Project = {
  id: "demo-project",
  name: "acme-dashboard",
  url: "https://github.com/lin-student/acme-dashboard",
  visibility: "public",
  stack: ["Next.js 14", "React", "TypeScript"],
  analyzedFiles: 19,
  status: "synced"
};

const fallbackQuestion: Question = {
  id: "next-data-fetching",
  prompt: "你的商品列表为什么采用客户端请求？如果首屏加载速度变慢，你会如何重新设计数据获取方案？",
  contextPath: "app/(shop)/products/page.tsx",
  dimension: "nextjs",
  difficulty: "进阶"
};

function localEvaluation(interviewId: string, answer: string): Evaluation {
  const normalized = answer.toLowerCase();
  const matched = ["ssr", "缓存", "cache", "服务端", "预取", "loading", "错误"].filter((word) => normalized.includes(word)).length;
  const score = Math.min(10, Math.max(4.8, 5.4 + matched * 0.7 + Math.min(answer.length, 500) / 500));

  return {
    interviewId,
    score: Number(score.toFixed(1)),
    strengths: ["能够从首屏体验出发解释数据获取方案", "回答与当前项目场景相关"],
    improvements: ["补充缓存失效和客户端交互的衔接策略", "说明异常状态和 loading 状态如何统一处理"],
    nextQuestion: {
      id: "react-state-boundary",
      prompt: "项目中哪些状态应该留在组件内部，哪些状态值得提升或放进全局状态？你的判断标准是什么？",
      contextPath: "src/store/cart.ts",
      dimension: "react",
      difficulty: "基础"
    },
    questionNumber: 2,
    totalQuestions: 4,
    completed: false,
    provider: "local-mock",
    note: "后端暂时不可用，当前使用本地演示模式。"
  };
}

type InterviewCardProps = {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  answer: string;
  evaluation: Evaluation | null;
  submitted: boolean;
  isSubmitting: boolean;
  isStarting: boolean;
  onAnswerChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNext: () => void;
};

function InterviewCard({
  question,
  questionNumber,
  totalQuestions,
  answer,
  evaluation,
  submitted,
  isSubmitting,
  isStarting,
  onAnswerChange,
  onSubmit,
  onNext
}: InterviewCardProps) {
  return (
    <section className="question-panel panel">
      <div className="panel-heading">
        <div><span className="section-kicker"><Sparkles size={14} />下一道问题</span><h2>项目深挖 · 第 {questionNumber} / {totalQuestions} 题</h2></div>
        <span className="difficulty-tag">{question.difficulty}</span>
      </div>
      <div className="question-body">
        <p className="question-text">{question.prompt}</p>
        <div className="question-context"><FileCode2 size={15} /><span>问题来自</span><code>{question.contextPath}</code><span className="context-divider" /><span>{question.dimension === "nextjs" ? "Next.js 数据获取" : "React 工程实践"}</span></div>
      </div>
      {!submitted ? (
        <form onSubmit={onSubmit}>
          <label className="answer-label" htmlFor="answer">你的回答</label>
          <textarea id="answer" value={answer} onChange={(event) => onAnswerChange(event.target.value)} placeholder="先说你的判断，再解释取舍和具体实现……" disabled={isSubmitting || isStarting} />
          <div className="answer-footer"><span>建议回答 1-2 分钟</span><div className="answer-actions"><button className="ghost-button" type="button" onClick={() => onAnswerChange("")}><RefreshCw size={15} />重新思考</button><button className="primary-button" type="submit" disabled={isSubmitting || isStarting || !answer.trim()}>{isSubmitting ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}{isSubmitting ? "分析中" : "提交回答"}</button></div></div>
        </form>
      ) : (
        <div className="feedback-box">
          <div className="feedback-heading"><div className="feedback-icon"><Check size={17} /></div><div><strong>回答已记录</strong><span>{evaluation?.provider === "local-mock" ? "本地演示评分已生成" : "Agent 已完成分析"}</span></div><span className="score-badge">{evaluation?.score ?? "-"} / 10</span></div>
          <div className="feedback-columns"><div><span className="feedback-label">做得不错</span><p>{evaluation?.strengths[0] ?? "回答已保存"}</p></div><div><span className="feedback-label">可以补充</span><p>{evaluation?.improvements[0] ?? "继续补充实现细节"}</p></div></div>
          <button className="primary-button full-button" type="button" onClick={onNext}>{evaluation?.nextQuestion ? <><Play size={15} />继续下一题</> : <><BarChart3 size={15} />查看能力报告</>}</button>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [activeNav, setActiveNav] = useState("工作台");
  const [project, setProject] = useState<Project>(fallbackProject);
  const [question, setQuestion] = useState<Question>(fallbackQuestion);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(4);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [progress, setProgress] = useState(62);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState(project.url);
  const [jobDescription, setJobDescription] = useState("前端开发实习生，熟悉 React、Next.js、TypeScript 和性能优化。\n");
  const [notice, setNotice] = useState<string | null>(null);

  const handleNav = (label: string) => { setActiveNav(label); setMobileOpen(false); };

  const handleStartTraining = async () => {
    setActiveNav("面试训练"); setIsStarting(true); setSubmitted(false); setEvaluation(null); setAnswer(""); setNotice(null);
    try {
      const result = await startInterview(project.id, jobDescription);
      setInterviewId(result.interviewId); setQuestion(result.question); setQuestionNumber(result.questionNumber); setTotalQuestions(result.totalQuestions);
    } catch {
      setInterviewId(`local-${Date.now()}`); setQuestion(fallbackQuestion); setQuestionNumber(1); setTotalQuestions(4);
      setNotice("后端 API 暂时不可用，已切换到本地演示模式。启动 NestJS 后可恢复真实接口。 ");
    } finally { setIsStarting(false); }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!answer.trim() || isSubmitting) return;
    const currentInterviewId = interviewId ?? `local-${Date.now()}`; setInterviewId(currentInterviewId); setIsSubmitting(true); setNotice(null);
    try {
      const result = await submitInterviewAnswer(currentInterviewId, answer.trim());
      setEvaluation(result); setQuestionNumber(result.questionNumber ?? questionNumber); setTotalQuestions(result.totalQuestions ?? totalQuestions); setSubmitted(true); setProgress((current) => Math.min(current + 6, 100));
    } catch {
      const result = localEvaluation(currentInterviewId, answer.trim()); setEvaluation(result); setQuestionNumber(result.questionNumber ?? 2); setSubmitted(true); setProgress((current) => Math.min(current + 4, 100));
      setNotice("回答接口未连接，已用本地规则生成反馈。 ");
    } finally { setIsSubmitting(false); }
  };

  const handleNext = () => {
    if (evaluation?.nextQuestion) { setQuestion(evaluation.nextQuestion); setQuestionNumber(evaluation.questionNumber ?? questionNumber + 1); setSubmitted(false); setEvaluation(null); setAnswer(""); }
    else setActiveNav("能力报告");
  };

  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const normalizedUrl = repoUrl.trim().replace(/\/$/, "");
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(normalizedUrl)) { setNotice("请输入类似 https://github.com/用户名/仓库名 的公开 GitHub 地址。 "); return; }
    setIsAnalyzing(true); setNotice(null);
    try { const result = await analyzeProject(normalizedUrl, jobDescription.trim()); setProject(result); setRepoUrl(result.url); setProjectModalOpen(false); setNotice(`项目 ${result.name} 已分析完成，可以开始面试。`); }
    catch { const name = normalizedUrl.split("/").pop() ?? "frontend-project"; setProject({ ...fallbackProject, id: `local-${name}`, name, url: normalizedUrl }); setProjectModalOpen(false); setNotice("分析接口未连接，已保存为本地项目上下文。启动后端后可获取真实仓库数据。 "); }
    finally { setIsAnalyzing(false); }
  };

  const renderDashboard = () => <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />周三，准备好了吗</div><h1>把你的项目，练成面试答案</h1><p>Agent 会围绕真实代码发问，帮你找到项目表达中的空白。</p></div><button className="primary-button" onClick={handleStartTraining} disabled={isStarting}>{isStarting ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />} {isStarting ? "准备中" : "开始一次训练"}</button></div>
    <div className="stats-grid"><div className="stat-card stat-card-main"><div className="stat-top"><span>项目准备度</span><Target size={17} /></div><div className="stat-value">{progress}<small>/100</small></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="stat-foot"><span className="positive">+6</span> 比上次训练提升</div></div><div className="stat-card"><div className="stat-top"><span>完成训练</span><CheckCircle2 size={17} /></div><div className="stat-value">3<small> 次</small></div><div className="stat-foot">本周目标 5 次</div></div><div className="stat-card"><div className="stat-top"><span>已覆盖主题</span><BookOpen size={17} /></div><div className="stat-value">12<small> 个</small></div><div className="stat-foot">还剩 8 个待复习</div></div><div className="stat-card"><div className="stat-top"><span>待强化</span><Clock3 size={17} /></div><div className="stat-value stat-value-small">性能优化</div><div className="stat-foot">建议今天完成 1 个训练</div></div></div>
    <ProjectContext project={project} onChange={() => setProjectModalOpen(true)} />
    <div className="dashboard-grid"><InterviewCard question={question} questionNumber={questionNumber} totalQuestions={totalQuestions} answer={answer} evaluation={evaluation} submitted={submitted} isSubmitting={isSubmitting} isStarting={isStarting} onAnswerChange={setAnswer} onSubmit={handleSubmit} onNext={handleNext} /><SignalPanel onOpenReport={() => setActiveNav("能力报告")} /></div>
    <SessionsPanel onOpenReport={() => setActiveNav("能力报告")} />
  </>;

  const renderTraining = () => <><div className="page-heading compact-heading"><div><div className="eyebrow"><span className="eyebrow-line" />训练空间</div><h1>项目深挖面试</h1><p>围绕 {project.name} 的 React / Next.js 技术面试。</p></div><span className="mode-chip"><ShieldCheck size={14} />公开仓库只读</span></div>{!interviewId && !isStarting ? <section className="empty-training panel"><div className="empty-icon"><Play size={21} /></div><h2>准备开始一次项目面试</h2><p>Agent 会先分析项目上下文，再根据你的回答继续追问。</p><button className="primary-button" onClick={handleStartTraining}><Play size={16} />开始训练</button></section> : <InterviewCard question={question} questionNumber={questionNumber} totalQuestions={totalQuestions} answer={answer} evaluation={evaluation} submitted={submitted} isSubmitting={isSubmitting} isStarting={isStarting} onAnswerChange={setAnswer} onSubmit={handleSubmit} onNext={handleNext} />}</>;

  const renderReport = () => <><div className="page-heading compact-heading"><div><div className="eyebrow"><span className="eyebrow-line" />能力报告</div><h1>你的前端能力雷达</h1><p>根据最近 3 次项目面试整理出的训练信号。</p></div><button className="ghost-button" onClick={handleStartTraining}><Play size={15} />继续训练</button></div><section className="report-hero panel"><div><span className="section-kicker"><BarChart3 size={14} />当前准备度</span><div className="report-score">{progress}<small>/100</small></div><p>React 基础较稳，下一阶段优先补足性能优化和工程化表达。</p></div><div className="report-summary"><div><strong>3</strong><span>已完成训练</span></div><div><strong>12</strong><span>覆盖主题</span></div><div><strong>8</strong><span>待复习主题</span></div></div></section><section className="report-grid"><section className="panel"><div className="panel-heading"><div><span className="section-kicker"><Target size={14} />能力维度</span><h2>逐项拆解</h2></div></div><div className="report-dimensions">{dimensions.map((dimension) => <div className="report-dimension" key={dimension.label}><div className="dimension-label"><span>{dimension.label}</span><strong>{dimension.value}</strong></div><div className="dimension-track"><span className={`bar-${dimension.color}`} style={{ width: `${dimension.value}%` }} /></div><p>{dimension.value > 70 ? "能够结合项目清晰解释实现" : "建议用一个项目案例重新练习"}</p></div>)}</div></section><section className="panel action-panel"><div className="panel-heading"><div><span className="section-kicker"><Sparkles size={14} />下一步</span><h2>本周训练计划</h2></div></div><div className="plan-list"><div className="plan-item"><div className="plan-number">01</div><div><strong>解释一次缓存策略</strong><span>结合商品列表项目回答，控制在 90 秒内。</span></div></div><div className="plan-item"><div className="plan-number">02</div><div><strong>定位一次重复渲染</strong><span>说清楚定位工具、判断依据和优化取舍。</span></div></div><div className="plan-item"><div className="plan-number">03</div><div><strong>复盘接口错误边界</strong><span>补充 loading、empty 和 error 三种状态。</span></div></div></div><button className="primary-button full-button" onClick={handleStartTraining}><Play size={15} />开始下一次训练</button></section></section></>;

  const renderSettings = () => <><div className="page-heading compact-heading"><div><div className="eyebrow"><span className="eyebrow-line" />项目设置</div><h1>管理你的项目上下文</h1><p>RepoCoach 只读取公开仓库，不会修改代码或创建 PR。</p></div><button className="primary-button" onClick={() => setProjectModalOpen(true)}><Github size={16} />更换仓库</button></div><section className="settings-grid"><section className="panel settings-card"><div className="settings-title"><div className="repo-icon"><Github size={20} /></div><div><span className="section-kicker">当前仓库</span><h2>{project.name}</h2></div></div><div className="settings-row"><span>仓库地址</span><a href={project.url} target="_blank" rel="noreferrer">{project.url}<ArrowUpRight size={14} /></a></div><div className="settings-row"><span>可见性</span><strong><ShieldCheck size={14} />公开</strong></div><div className="settings-row"><span>默认分支</span><strong>{project.defaultBranch ?? "main"}</strong></div><div className="settings-row"><span>已分析文件</span><strong>{project.analyzedFiles} 个</strong></div>{project.description && <p className="settings-description">{project.description}</p>}<button className="ghost-button" onClick={() => setProjectModalOpen(true)}><RefreshCw size={15} />重新分析项目</button></section><section className="panel settings-card"><div className="settings-title"><div className="repo-icon repo-icon-warm"><Code2 size={20} /></div><div><span className="section-kicker">分析摘要</span><h2>关键文件</h2></div></div>{project.keyFiles?.length ? <div className="key-file-list">{project.keyFiles.slice(0, 8).map((file) => <div className="key-file" key={file.path}><FileCode2 size={14} /><code>{file.path}</code><span>{file.language}</span></div>)}</div> : <p className="settings-note">导入公开仓库后，这里会列出与面试最相关的文件。</p>}<div className="preference-tags"><span>React</span><span>Next.js</span><span>TypeScript</span><span>性能优化</span></div></section></section></>;

  return <main className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}><div className="brand-row"><div className="brand-mark"><Sparkles size={17} /></div><div><div className="brand-name">RepoCoach</div><div className="brand-caption">FE INTERVIEW LAB</div></div><button className="icon-button sidebar-close" aria-label="关闭菜单" onClick={() => setMobileOpen(false)}><X size={18} /></button></div><button className="workspace-switcher" onClick={() => setProjectModalOpen(true)}><div className="repo-avatar">{project.name.slice(0, 2).toUpperCase()}</div><div className="workspace-copy"><strong>{project.name}</strong><span>公开仓库 · {project.status === "synced" ? "已同步" : "分析中"}</span></div><ChevronRight size={16} className="muted-icon" /></button><div className="nav-group"><div className="nav-label">工作区</div>{navItems.map(({ label, icon: Icon }) => <button className={`nav-item ${activeNav === label ? "nav-item-active" : ""}`} key={label} onClick={() => handleNav(label)}><Icon size={17} /><span>{label}</span>{label === "能力报告" && <span className="nav-count">3</span>}</button>)}</div><div className="sidebar-bottom"><div className="plan-status"><div className="plan-icon"><ShieldCheck size={17} /></div><div><strong>公开仓库模式</strong><span>只读分析已开启</span></div></div><div className="user-row"><div className="user-avatar">林</div><div className="workspace-copy"><strong>林同学</strong><span>前端实习准备中</span></div><Settings2 size={16} className="muted-icon" /></div></div></aside>
    {mobileOpen && <button className="scrim" aria-label="关闭菜单" onClick={() => setMobileOpen(false)} />}
    <section className="main-panel"><header className="topbar"><button className="icon-button mobile-menu" aria-label="打开菜单" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumb"><span>工作台</span><ChevronRight size={14} /><strong>{activeNav}</strong></div><div className="topbar-actions"><span className="sync-status"><span className="status-dot" />刚刚同步</span><button className="avatar-button" aria-label="打开个人菜单">林</button></div></header><div className="content-wrap">{notice && <div className="notice-banner"><Sparkles size={15} /><span>{notice}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={15} /></button></div>}{activeNav === "工作台" && renderDashboard()}{activeNav === "面试训练" && renderTraining()}{activeNav === "能力报告" && renderReport()}{activeNav === "项目设置" && renderSettings()}</div></section>
    {projectModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setProjectModalOpen(false)}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="project-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="section-kicker"><Github size={14} />公开仓库</span><h2 id="project-modal-title">导入一个 React / Next.js 项目</h2></div><button className="icon-button" aria-label="关闭弹窗" onClick={() => setProjectModalOpen(false)}><X size={18} /></button></div><form onSubmit={handleAnalyze}><label className="answer-label" htmlFor="repo-url">GitHub 仓库地址</label><input id="repo-url" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/用户名/仓库名" /><label className="answer-label" htmlFor="job-description">目标岗位 JD</label><textarea id="job-description" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="粘贴前端实习岗位描述，帮助 Agent 调整问题重点。" /><div className="modal-foot"><span>只支持公开仓库，读取过程不会修改代码。</span><div className="answer-actions"><button className="ghost-button" type="button" onClick={() => setProjectModalOpen(false)}>取消</button><button className="primary-button" type="submit" disabled={isAnalyzing}>{isAnalyzing ? <LoaderCircle size={15} className="spin" /> : <Github size={15} />}{isAnalyzing ? "分析中" : "分析仓库"}</button></div></div></form></div></div>}
  </main>;
}

function ProjectContext({ project, onChange }: { project: Project; onChange: () => void }) {
  return <div className="repo-context-bar"><div className="repo-context-main"><div className="repo-icon"><Github size={20} /></div><div><strong>{project.name}</strong><span>{project.url.replace("https://", "")}</span></div></div><div className="tech-tags">{project.stack.map((tag) => <span key={tag}>{tag}</span>)}<span>{project.analyzedFiles} 个文件已分析</span></div><button className="text-button" onClick={onChange}>更换项目 <ArrowUpRight size={15} /></button></div>;
}

function SignalPanel({ onOpenReport }: { onOpenReport: () => void }) {
  return <section className="signal-panel panel"><div className="panel-heading"><div><span className="section-kicker"><BarChart3 size={14} />训练信号</span><h2>能力概览</h2></div><button className="icon-button" title="打开完整报告" onClick={onOpenReport}><ArrowUpRight size={17} /></button></div><div className="signal-summary"><div className="signal-score">62</div><div><strong>正在稳定提升</strong><span>完成 3 次训练后，React 基础已超过平均线。</span></div></div><div className="dimension-list">{dimensions.map((dimension) => <div className="dimension-row" key={dimension.label}><div className="dimension-label"><span>{dimension.label}</span><strong>{dimension.value}</strong></div><div className="dimension-track"><span className={`bar-${dimension.color}`} style={{ width: `${dimension.value}%` }} /></div></div>)}</div><div className="signal-tip"><Sparkles size={15} /><span>建议优先复习 <strong>缓存与渲染策略</strong>，它出现在 2 个目标岗位的要求中。</span></div></section>;
}

function SessionsPanel({ onOpenReport }: { onOpenReport: () => void }) {
  const sessions = [["Next.js 渲染策略", "8 道问题 · 进阶", "7.4", "今天 09:42", "blue-icon"], ["React 状态管理", "10 道问题 · 基础", "8.1", "昨天 20:18", "amber-icon"], ["项目架构表达", "6 道问题 · 进阶", "6.8", "周一 18:06", "rose-icon"]];
  return <section className="sessions-panel panel"><div className="panel-heading"><div><span className="section-kicker"><GitPullRequest size={14} />训练记录</span><h2>最近的面试</h2></div><button className="text-button" onClick={onOpenReport}>查看全部 <ChevronRight size={15} /></button></div><div className="session-table"><div className="table-row table-head"><span>训练主题</span><span>项目</span><span>得分</span><span>完成时间</span><span /></div>{sessions.map(([name, meta, score, time, color]) => <button className="table-row table-row-button" key={name} onClick={onOpenReport}><div className="session-name"><div className={`session-icon ${color}`}><Code2 size={15} /></div><div><strong>{name}</strong><span>{meta}</span></div></div><span>acme-dashboard</span><strong className="score-text">{score}</strong><span>{time}</span><ChevronRight size={16} className="muted-icon" /></button>)}</div></section>;
}
