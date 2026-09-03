"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  Download,
  FileCode2,
  Github,
  GitPullRequest,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Play,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  X
} from "lucide-react";
import {
  analyzeProject,
  CapabilityReport,
  Evaluation,
  getCurrentUser,
  getInterviewDetail,
  getProjectReport,
  InterviewDetail,
  login,
  logout,
  Project,
  Question,
  register,
  startInterview,
  submitInterviewAnswer,
  User
} from "@/lib/api";

const navItems = [
  { label: "工作台", icon: LayoutDashboard },
  { label: "面试训练", icon: Play },
  { label: "能力报告", icon: BarChart3 },
  { label: "项目设置", icon: Settings2 }
];

const workspaceStorageKey = (userId: string) => `repocoach-workspace-v1:${userId}`;
const defaultJobDescription = "前端开发实习生，熟悉 React、Next.js、TypeScript 和性能优化。\n";

const emptyDimensions = [
  { key: "react" as const, label: "React 基础", score: 0, answerCount: 0, color: "teal" as const, feedback: "尚未覆盖" },
  { key: "nextjs" as const, label: "Next.js 应用", score: 0, answerCount: 0, color: "blue" as const, feedback: "尚未覆盖" },
  { key: "engineering" as const, label: "工程化", score: 0, answerCount: 0, color: "amber" as const, feedback: "尚未覆盖" },
  { key: "performance" as const, label: "性能意识", score: 0, answerCount: 0, color: "rose" as const, feedback: "尚未覆盖" }
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

function downloadInterviewReport(interview: InterviewDetail) {
  const lines = [
    `# RepoCoach 面试复盘：${interview.projectName}`,
    "",
    `- 状态：${interview.status === "completed" ? "已完成" : "进行中"}`,
    `- 平均分：${interview.averageScore.toFixed(1)} / 10`,
    `- 开始时间：${formatSessionTime(interview.startedAt)}`,
    `- 目标岗位：${interview.jobDescription || "前端开发实习生"}`,
    "",
    ...interview.answers.flatMap((item) => [
      `## 第 ${item.questionNumber} 题`,
      "",
      item.question,
      "",
      `代码位置：\`${item.contextPath}\`  `,
      `评分：**${item.score.toFixed(1)} / 10**`,
      "",
      "### 我的回答",
      "",
      item.answer,
      "",
      "### 做得不错",
      "",
      ...item.strengths.map((strength) => `- ${strength}`),
      "",
      "### 可以改进",
      "",
      ...item.improvements.map((improvement) => `- ${improvement}`),
      ""
    ])
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${interview.projectName.replace(/[^a-zA-Z0-9-_]/g, "-")}-interview-review.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const result = mode === "register"
        ? await register({ name: name.trim(), email: email.trim(), password })
        : await login({ email: email.trim(), password });
      onAuthenticated(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "认证失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return <main className="auth-shell"><section className="auth-brand"><div className="brand-row"><div className="brand-mark"><Sparkles size={18} /></div><div><div className="brand-name">RepoCoach</div><div className="brand-caption">FE INTERVIEW LAB</div></div></div><div className="auth-position"><span>AI 项目面试工作台</span><h1>把真实代码，练成有证据的面试表达</h1><p>导入 GitHub 项目，由 Agent 连续追问、评分并沉淀个人能力报告。</p></div><div className="auth-proof"><span><Github size={15} />代码级提问</span><span><Sparkles size={15} />自适应追问</span><span><BarChart3 size={15} />真实能力报告</span></div></section><section className="auth-form-wrap"><div className="auth-form-heading"><span className="section-kicker"><LockKeyhole size={14} />账号工作区</span><h2>{mode === "login" ? "登录 RepoCoach" : "创建你的账号"}</h2><p>{mode === "login" ? "继续你的项目面试训练。" : "开始建立可持续更新的面试档案。"}</p></div><div className="auth-tabs" role="tablist"><button type="button" className={mode === "login" ? "auth-tab-active" : ""} onClick={() => { setMode("login"); setError(null); }}>登录</button><button type="button" className={mode === "register" ? "auth-tab-active" : ""} onClick={() => { setMode("register"); setError(null); }}>注册</button></div><form className="auth-form" onSubmit={handleAuth}>{mode === "register" && <label><span>姓名</span><div className="auth-input"><UserRound size={16} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="用于面试报告署名" minLength={2} maxLength={40} required /></div></label>}<label><span>邮箱</span><div className="auth-input"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></div></label><label><span>密码</span><div className="auth-input"><LockKeyhole size={16} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" minLength={8} maxLength={72} required /></div></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle size={16} className="spin" /> : mode === "login" ? <LockKeyhole size={16} /> : <UserRound size={16} />}{isSubmitting ? "处理中" : mode === "login" ? "登录" : "创建账号"}</button></form></section></main>;
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

function InterviewStartingCard({ projectName }: { projectName: string }) {
  return <section className="interview-starting panel" aria-live="polite" aria-busy="true"><div className="starting-indicator"><LoaderCircle size={22} className="spin" /></div><div><span className="section-kicker"><Sparkles size={14} />Agent 正在准备</span><h2>正在为 {projectName} 组织第一道问题</h2><p>正在恢复项目上下文并创建训练记录，完成后会自动显示题目。</p></div></section>;
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("工作台");
  const [project, setProject] = useState<Project>(fallbackProject);
  const [question, setQuestion] = useState<Question>(fallbackQuestion);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(4);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [interviewDetail, setInterviewDetail] = useState<InterviewDetail | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState(project.url);
  const [jobDescription, setJobDescription] = useState(defaultJobDescription);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then((result) => setCurrentUser(result.user))
      .catch(() => setCurrentUser(null))
      .finally(() => setIsAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setWorkspaceReady(false);
      return;
    }
    setWorkspaceReady(false);
    try {
      const saved = JSON.parse(window.localStorage.getItem(workspaceStorageKey(currentUser.id)) ?? "null") as { project?: Project; jobDescription?: string } | null;
      if (saved?.project?.id && saved.project.url) {
        setProject(saved.project);
        setRepoUrl(saved.project.url);
      } else {
        setProject(fallbackProject);
        setRepoUrl(fallbackProject.url);
      }
      setJobDescription(saved?.jobDescription || defaultJobDescription);
    } catch {
      window.localStorage.removeItem(workspaceStorageKey(currentUser.id));
      setProject(fallbackProject);
      setRepoUrl(fallbackProject.url);
      setJobDescription(defaultJobDescription);
    } finally {
      setWorkspaceReady(true);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!workspaceReady || !currentUser) return;
    window.localStorage.setItem(workspaceStorageKey(currentUser.id), JSON.stringify({ project, jobDescription }));
  }, [currentUser, jobDescription, project, workspaceReady]);

  const loadReport = useCallback(async (projectId: string) => {
    setIsReportLoading(true);
    try {
      setReport(await getProjectReport(projectId));
    } catch {
      setReport(null);
    } finally {
      setIsReportLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) void loadReport(project.id);
  }, [currentUser, loadReport, project.id]);

  const handleNav = (label: string) => {
    setActiveNav(label);
    setMobileOpen(false);
    if (label === "能力报告") void loadReport(project.id);
  };

  const handleStartTraining = async () => {
    setActiveNav("面试训练"); setIsStarting(true); setSubmitted(false); setEvaluation(null); setAnswer(""); setNotice(null);
    try {
      const result = await startInterview(project.id, jobDescription, project.url);
      setInterviewId(result.interviewId); setQuestion(result.question); setQuestionNumber(result.questionNumber); setTotalQuestions(result.totalQuestions); void loadReport(project.id);
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
      setEvaluation(result); setQuestionNumber(result.questionNumber ?? questionNumber); setTotalQuestions(result.totalQuestions ?? totalQuestions); setSubmitted(true); void loadReport(project.id);
    } catch {
      const result = localEvaluation(currentInterviewId, answer.trim()); setEvaluation(result); setQuestionNumber(result.questionNumber ?? 2); setSubmitted(true);
      setNotice("回答接口未连接，已用本地规则生成反馈。 ");
    } finally { setIsSubmitting(false); }
  };

  const handleNext = () => {
    if (evaluation?.nextQuestion) { setQuestion(evaluation.nextQuestion); setQuestionNumber(evaluation.questionNumber ?? questionNumber + 1); setSubmitted(false); setEvaluation(null); setAnswer(""); }
    else { setActiveNav("能力报告"); void loadReport(project.id); }
  };

  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const normalizedUrl = repoUrl.trim().replace(/\/$/, "");
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(normalizedUrl)) { setNotice("请输入类似 https://github.com/用户名/仓库名 的公开 GitHub 地址。 "); return; }
    setIsAnalyzing(true); setNotice(null);
    try { const result = await analyzeProject(normalizedUrl, jobDescription.trim()); setProject(result); setRepoUrl(result.url); setInterviewId(null); setReport(null); setProjectModalOpen(false); setNotice(`项目 ${result.name} 已分析完成，可以开始面试。`); }
    catch (error) { setNotice(`项目分析失败：${error instanceof Error ? error.message : "请检查后端、Token 和网络配置。"}`); }
    finally { setIsAnalyzing(false); }
  };

  const handleOpenSession = async (sessionId: string) => {
    setReviewOpen(true);
    setInterviewDetail(null);
    setIsReviewLoading(true);
    try {
      setInterviewDetail(await getInterviewDetail(sessionId));
    } catch (error) {
      setReviewOpen(false);
      setNotice(`复盘加载失败：${error instanceof Error ? error.message : "请稍后重试。"}`);
    } finally {
      setIsReviewLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setCurrentUser(null);
      setInterviewId(null);
      setReport(null);
      setActiveNav("工作台");
    }
  };

  if (isAuthLoading) return <main className="auth-loading"><LoaderCircle size={24} className="spin" /><span>正在恢复登录状态</span></main>;
  if (!currentUser) return <AuthScreen onAuthenticated={setCurrentUser} />;

  const progress = report?.readinessScore ?? 0;
  const reportDimensions = report?.dimensions ?? emptyDimensions;
  const weakestDimension = [...reportDimensions]
    .filter((dimension) => dimension.answerCount > 0)
    .sort((a, b) => a.score - b.score)[0];

  const renderDashboard = () => <>
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />周三，准备好了吗</div><h1>把你的项目，练成面试答案</h1><p>Agent 会围绕真实代码发问，帮你找到项目表达中的空白。</p></div><button className="primary-button" onClick={handleStartTraining} disabled={isStarting}>{isStarting ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />} {isStarting ? "准备中" : "开始一次训练"}</button></div>
    <div className="stats-grid"><div className="stat-card stat-card-main"><div className="stat-top"><span>项目准备度</span><Target size={17} /></div><div className="stat-value">{progress}<small>/100</small></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="stat-foot">基于 {report?.answeredQuestions ?? 0} 道真实回答</div></div><div className="stat-card"><div className="stat-top"><span>完成训练</span><CheckCircle2 size={17} /></div><div className="stat-value">{report?.completedInterviews ?? 0}<small> 次</small></div><div className="stat-foot">完整完成四题计为一次</div></div><div className="stat-card"><div className="stat-top"><span>已覆盖主题</span><BookOpen size={17} /></div><div className="stat-value">{report?.coveredTopics ?? 0}<small> 个</small></div><div className="stat-foot">来自实际项目文件</div></div><div className="stat-card"><div className="stat-top"><span>待强化</span><Clock3 size={17} /></div><div className="stat-value stat-value-small">{weakestDimension?.label ?? "等待数据"}</div><div className="stat-foot">完成回答后自动更新</div></div></div>
    <ProjectContext project={project} onChange={() => setProjectModalOpen(true)} />
    <div className="dashboard-grid"><InterviewCard question={question} questionNumber={questionNumber} totalQuestions={totalQuestions} answer={answer} evaluation={evaluation} submitted={submitted} isSubmitting={isSubmitting} isStarting={isStarting} onAnswerChange={setAnswer} onSubmit={handleSubmit} onNext={handleNext} /><SignalPanel report={report} isLoading={isReportLoading} onOpenReport={() => handleNav("能力报告")} /></div>
    <SessionsPanel report={report} isLoading={isReportLoading} onOpenReport={() => handleNav("能力报告")} onOpenSession={handleOpenSession} />
  </>;

  const renderTraining = () => <><div className="page-heading compact-heading"><div><div className="eyebrow"><span className="eyebrow-line" />训练空间</div><h1>项目深挖面试</h1><p>围绕 {project.name} 的 React / Next.js 技术面试。</p></div><span className="mode-chip"><ShieldCheck size={14} />公开仓库只读</span></div>{isStarting ? <InterviewStartingCard projectName={project.name} /> : !interviewId ? <section className="empty-training panel"><div className="empty-icon"><Play size={21} /></div><h2>准备开始一次项目面试</h2><p>Agent 会先分析项目上下文，再根据你的回答继续追问。</p><button className="primary-button" onClick={handleStartTraining}><Play size={16} />开始训练</button></section> : <InterviewCard question={question} questionNumber={questionNumber} totalQuestions={totalQuestions} answer={answer} evaluation={evaluation} submitted={submitted} isSubmitting={isSubmitting} isStarting={isStarting} onAnswerChange={setAnswer} onSubmit={handleSubmit} onNext={handleNext} />}</>;

  const renderReport = () => <>
    <div className="page-heading compact-heading">
      <div><div className="eyebrow"><span className="eyebrow-line" />能力报告</div><h1>你的前端能力雷达</h1><p>所有数据都来自当前项目的真实面试回答。</p></div>
      <button className="ghost-button" onClick={handleStartTraining}><Play size={15} />继续训练</button>
    </div>
    {isReportLoading && !report ? (
      <section className="empty-report panel"><LoaderCircle size={22} className="spin" /><h2>正在整理训练数据</h2><p>读取评分和能力维度，请稍候。</p></section>
    ) : !report?.hasData ? (
      <section className="empty-report panel"><BarChart3 size={24} /><h2>还没有可分析的回答</h2><p>完成至少一道项目面试题后，这里会生成真实能力报告。</p><button className="primary-button" onClick={handleStartTraining}><Play size={15} />开始第一次训练</button></section>
    ) : <>
      <section className="report-hero panel">
        <div><span className="section-kicker"><BarChart3 size={14} />当前准备度</span><div className="report-score">{report.readinessScore}<small>/100</small></div><p>{report.summary}</p></div>
        <div className="report-summary"><div><strong>{report.completedInterviews}</strong><span>已完成训练</span></div><div><strong>{report.answeredQuestions}</strong><span>已回答问题</span></div><div><strong>{report.coveredTopics}</strong><span>覆盖项目文件</span></div></div>
      </section>
      <section className="report-grid">
        <section className="panel"><div className="panel-heading"><div><span className="section-kicker"><Target size={14} />能力维度</span><h2>逐项拆解</h2></div></div><div className="report-dimensions">{report.dimensions.map((dimension) => <div className="report-dimension" key={dimension.key}><div className="dimension-label"><span>{dimension.label}<small>{dimension.answerCount} 个信号</small></span><strong>{dimension.score}</strong></div><div className="dimension-track"><span className={`bar-${dimension.color}`} style={{ width: `${dimension.score}%` }} /></div><p>{dimension.feedback}</p></div>)}</div></section>
        <section className="panel action-panel"><div className="panel-heading"><div><span className="section-kicker"><Sparkles size={14} />下一步</span><h2>针对性训练计划</h2></div></div><div className="plan-list">{report.nextActions.map((action, index) => <div className="plan-item" key={`${action}-${index}`}><div className="plan-number">{String(index + 1).padStart(2, "0")}</div><div><strong>{action}</strong><span>下次回答时结合一个真实文件和明确的技术取舍。</span></div></div>)}</div><button className="primary-button full-button" onClick={handleStartTraining}><Play size={15} />开始下一次训练</button></section>
      </section>
    </>}
  </>;

  const renderSettings = () => <><div className="page-heading compact-heading"><div><div className="eyebrow"><span className="eyebrow-line" />项目设置</div><h1>管理你的项目上下文</h1><p>RepoCoach 只读取公开仓库，不会修改代码或创建 PR。</p></div><button className="primary-button" onClick={() => setProjectModalOpen(true)}><Github size={16} />更换仓库</button></div><section className="settings-grid"><section className="panel settings-card"><div className="settings-title"><div className="repo-icon"><Github size={20} /></div><div><span className="section-kicker">当前仓库</span><h2>{project.name}</h2></div></div><div className="settings-row"><span>仓库地址</span><a href={project.url} target="_blank" rel="noreferrer">{project.url}<ArrowUpRight size={14} /></a></div><div className="settings-row"><span>可见性</span><strong><ShieldCheck size={14} />公开</strong></div><div className="settings-row"><span>默认分支</span><strong>{project.defaultBranch ?? "main"}</strong></div><div className="settings-row"><span>已分析文件</span><strong>{project.analyzedFiles} 个</strong></div>{project.description && <p className="settings-description">{project.description}</p>}<button className="ghost-button" onClick={() => setProjectModalOpen(true)}><RefreshCw size={15} />重新分析项目</button></section><section className="panel settings-card"><div className="settings-title"><div className="repo-icon repo-icon-warm"><Code2 size={20} /></div><div><span className="section-kicker">分析摘要</span><h2>关键文件</h2></div></div>{project.keyFiles?.length ? <div className="key-file-list">{project.keyFiles.slice(0, 8).map((file) => <div className="key-file" key={file.path}><FileCode2 size={14} /><code>{file.path}</code><span>{file.language}</span></div>)}</div> : <p className="settings-note">导入公开仓库后，这里会列出与面试最相关的文件。</p>}<div className="preference-tags"><span>React</span><span>Next.js</span><span>TypeScript</span><span>性能优化</span></div></section></section></>;

  return <main className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}><div className="brand-row"><div className="brand-mark"><Sparkles size={17} /></div><div><div className="brand-name">RepoCoach</div><div className="brand-caption">FE INTERVIEW LAB</div></div><button className="icon-button sidebar-close" aria-label="关闭菜单" onClick={() => setMobileOpen(false)}><X size={18} /></button></div><button className="workspace-switcher" onClick={() => setProjectModalOpen(true)}><div className="repo-avatar">{project.name.slice(0, 2).toUpperCase()}</div><div className="workspace-copy"><strong>{project.name}</strong><span>公开仓库 · {project.status === "synced" ? "已同步" : "分析中"}</span></div><ChevronRight size={16} className="muted-icon" /></button><div className="nav-group"><div className="nav-label">工作区</div>{navItems.map(({ label, icon: Icon }) => <button className={`nav-item ${activeNav === label ? "nav-item-active" : ""}`} key={label} onClick={() => handleNav(label)}><Icon size={17} /><span>{label}</span>{label === "能力报告" && <span className="nav-count">{report?.recentSessions.length ?? 0}</span>}</button>)}</div><div className="sidebar-bottom"><div className="plan-status"><div className="plan-icon"><ShieldCheck size={17} /></div><div><strong>账号数据隔离</strong><span>训练记录仅自己可见</span></div></div><div className="user-row"><div className="user-avatar">{currentUser.name.slice(0, 1)}</div><div className="workspace-copy"><strong>{currentUser.name}</strong><span>{currentUser.email}</span></div><button className="icon-button" title="退出登录" aria-label="退出登录" onClick={handleLogout}><LogOut size={16} /></button></div></div></aside>
    {mobileOpen && <button className="scrim" aria-label="关闭菜单" onClick={() => setMobileOpen(false)} />}
    <section className="main-panel"><header className="topbar"><button className="icon-button mobile-menu" aria-label="打开菜单" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="breadcrumb"><span>工作台</span><ChevronRight size={14} /><strong>{activeNav}</strong></div><div className="topbar-actions"><span className="sync-status"><span className="status-dot" />账号已登录</span><button className="avatar-button" aria-label="当前用户">{currentUser.name.slice(0, 1)}</button></div></header><div className="content-wrap">{notice && <div className="notice-banner"><Sparkles size={15} /><span>{notice}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={15} /></button></div>}{activeNav === "工作台" && renderDashboard()}{activeNav === "面试训练" && renderTraining()}{activeNav === "能力报告" && renderReport()}{activeNav === "项目设置" && renderSettings()}</div></section>
    {projectModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setProjectModalOpen(false)}><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="project-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="section-kicker"><Github size={14} />公开仓库</span><h2 id="project-modal-title">导入一个 React / Next.js 项目</h2></div><button className="icon-button" aria-label="关闭弹窗" onClick={() => setProjectModalOpen(false)}><X size={18} /></button></div><form onSubmit={handleAnalyze}><label className="answer-label" htmlFor="repo-url">GitHub 仓库地址</label><input id="repo-url" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/用户名/仓库名" /><label className="answer-label" htmlFor="job-description">目标岗位 JD</label><textarea id="job-description" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="粘贴前端实习岗位描述，帮助 Agent 调整问题重点。" /><div className="modal-foot"><span>只支持公开仓库，读取过程不会修改代码。</span><div className="answer-actions"><button className="ghost-button" type="button" onClick={() => setProjectModalOpen(false)}>取消</button><button className="primary-button" type="submit" disabled={isAnalyzing}>{isAnalyzing ? <LoaderCircle size={15} className="spin" /> : <Github size={15} />}{isAnalyzing ? "分析中" : "分析仓库"}</button></div></div></form></div></div>}
    {reviewOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setReviewOpen(false)}><div className="modal-card review-modal" role="dialog" aria-modal="true" aria-labelledby="review-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="section-kicker"><BookOpen size={14} />训练复盘</span><h2 id="review-modal-title">{interviewDetail?.projectName ?? "读取面试记录"}</h2></div><div className="review-heading-actions"><button className="ghost-button" type="button" disabled={!interviewDetail} onClick={() => interviewDetail && downloadInterviewReport(interviewDetail)}><Download size={15} />导出 Markdown</button><button className="icon-button" aria-label="关闭复盘" onClick={() => setReviewOpen(false)}><X size={18} /></button></div></div>{isReviewLoading ? <div className="review-loading"><LoaderCircle size={21} className="spin" /><span>正在读取完整复盘</span></div> : interviewDetail && <><div className="review-summary"><div><strong>{interviewDetail.averageScore.toFixed(1)}</strong><span>平均分</span></div><div><strong>{interviewDetail.answers.length}</strong><span>已回答</span></div><div><strong>{interviewDetail.status === "completed" ? "已完成" : "进行中"}</strong><span>{formatSessionTime(interviewDetail.completedAt ?? interviewDetail.startedAt)}</span></div></div><div className="review-list">{interviewDetail.answers.map((item) => <section className="review-item" key={item.questionNumber}><div className="review-question-heading"><span>第 {item.questionNumber} 题 · {item.difficulty}</span><strong>{item.score.toFixed(1)} / 10</strong></div><h3>{item.question}</h3><code>{item.contextPath}</code><div className="review-answer"><span>我的回答</span><p>{item.answer}</p></div><div className="review-feedback"><div><span>做得不错</span><ul>{item.strengths.map((text) => <li key={text}>{text}</li>)}</ul></div><div><span>可以改进</span><ul>{item.improvements.map((text) => <li key={text}>{text}</li>)}</ul></div></div></section>)}</div></>}</div></div>}
  </main>;
}

function ProjectContext({ project, onChange }: { project: Project; onChange: () => void }) {
  return <div className="repo-context-bar"><div className="repo-context-main"><div className="repo-icon"><Github size={20} /></div><div><strong>{project.name}</strong><span>{project.url.replace("https://", "")}</span></div></div><div className="tech-tags">{project.stack.map((tag) => <span key={tag}>{tag}</span>)}<span>{project.analyzedFiles} 个文件已分析</span></div><button className="text-button" onClick={onChange}>更换项目 <ArrowUpRight size={15} /></button></div>;
}

function SignalPanel({ report, isLoading, onOpenReport }: { report: CapabilityReport | null; isLoading: boolean; onOpenReport: () => void }) {
  const dimensions = report?.dimensions ?? emptyDimensions;
  return <section className="signal-panel panel"><div className="panel-heading"><div><span className="section-kicker"><BarChart3 size={14} />训练信号</span><h2>能力概览</h2></div><button className="icon-button" title="打开完整报告" onClick={onOpenReport}><ArrowUpRight size={17} /></button></div><div className="signal-summary"><div className="signal-score">{report?.readinessScore ?? 0}</div><div><strong>{isLoading ? "正在计算" : report?.hasData ? "已生成真实报告" : "等待首次回答"}</strong><span>{report?.summary ?? "提交面试回答后，能力信号会自动更新。"}</span></div></div><div className="dimension-list">{dimensions.map((dimension) => <div className="dimension-row" key={dimension.key}><div className="dimension-label"><span>{dimension.label}</span><strong>{dimension.score}</strong></div><div className="dimension-track"><span className={`bar-${dimension.color}`} style={{ width: `${dimension.score}%` }} /></div></div>)}</div><div className="signal-tip"><Sparkles size={15} /><span>{report?.nextActions[0] ?? "完成第一道项目题，获得针对性训练建议。"}</span></div></section>;
}

function SessionsPanel({ report, isLoading, onOpenReport, onOpenSession }: { report: CapabilityReport | null; isLoading: boolean; onOpenReport: () => void; onOpenSession: (sessionId: string) => void }) {
  const sessions = report?.recentSessions ?? [];
  return <section className="sessions-panel panel"><div className="panel-heading"><div><span className="section-kicker"><GitPullRequest size={14} />训练记录</span><h2>最近的面试</h2></div><button className="text-button" onClick={onOpenReport}>查看报告 <ChevronRight size={15} /></button></div><div className="session-table"><div className="table-row table-head"><span>训练主题</span><span>项目</span><span>得分</span><span>更新时间</span><span /></div>{sessions.map((session) => <button className="table-row table-row-button" key={session.id} onClick={() => onOpenSession(session.id)}><div className="session-name"><div className={`session-icon ${session.status === "completed" ? "blue-icon" : "amber-icon"}`}><Code2 size={15} /></div><div><strong>项目深挖面试</strong><span>{session.questionCount} 道回答 · {session.status === "completed" ? "已完成" : "进行中"}</span></div></div><span>{session.projectName}</span><strong className="score-text">{session.questionCount ? session.averageScore.toFixed(1) : "-"}</strong><span>{formatSessionTime(session.completedAt ?? session.startedAt)}</span><ChevronRight size={16} className="muted-icon" /></button>)}{!sessions.length && <div className="session-empty">{isLoading ? "正在读取训练记录…" : "完成一次回答后，训练记录会显示在这里。"}</div>}</div></section>;
}

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
