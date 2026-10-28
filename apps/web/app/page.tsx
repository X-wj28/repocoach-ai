"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
  Info,
  GitPullRequest,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  X,
} from "lucide-react";
import {
  analyzeProject,
  CapabilityReport,
  Evaluation,
  getCurrentUser,
  InterviewDetail,
  login,
  logout,
  resendVerification,
  Project,
  Question,
  register,
  verifyEmail,
  User,
} from "@/lib/api";
import { emailValidationError, normalizeEmail } from "@/lib/validation";
import { ApiError } from "@/lib/http";
import { useTrainingSession } from "@/lib/use-training-session";
import { readWorkspace, writeWorkspace } from "@/lib/workspace-storage";
import { clearUserDrafts } from "@/lib/drafts";
import { DialogSurface } from "./components/dialog-surface";
import { TrainingState } from "./components/training-state";
import { InterviewReview } from "./components/interview-review";
import { TrainingWorkbench as InterviewCard } from "./components/training-workbench";
import { TrainingMemoryPanel } from "./components/training-memory";
import { CapabilityReportView } from "./components/capability-report";
import { SessionSummary } from "./components/session-summary";
import { useCapabilityReport } from "@/lib/use-capability-report";

const navItems = [
  { label: "工作台", icon: LayoutDashboard },
  { label: "面试训练", icon: Play },
  { label: "能力报告", icon: BarChart3 },
  { label: "项目设置", icon: Settings2 },
];

const defaultJobDescription =
  "前端开发实习生，熟悉 React、Next.js、TypeScript 和性能优化。\n";

const emptyDimensions = [
  {
    key: "react" as const,
    label: "React 基础",
    score: 0,
    answerCount: 0,
    color: "teal" as const,
    feedback: "尚未覆盖",
  },
  {
    key: "nextjs" as const,
    label: "Next.js 应用",
    score: 0,
    answerCount: 0,
    color: "blue" as const,
    feedback: "尚未覆盖",
  },
  {
    key: "engineering" as const,
    label: "工程化",
    score: 0,
    answerCount: 0,
    color: "amber" as const,
    feedback: "尚未覆盖",
  },
  {
    key: "performance" as const,
    label: "性能意识",
    score: 0,
    answerCount: 0,
    color: "rose" as const,
    feedback: "尚未覆盖",
  },
];

const fallbackProject: Project = {
  id: "demo-project",
  name: "acme-dashboard",
  url: "https://github.com/lin-student/acme-dashboard",
  visibility: "public",
  stack: ["Next.js 14", "React", "TypeScript"],
  analyzedFiles: 19,
  status: "synced",
};

const fallbackQuestion: Question = {
  id: "next-data-fetching",
  prompt:
    "你的商品列表为什么采用客户端请求？如果首屏加载速度变慢，你会如何重新设计数据获取方案？",
  contextPath: "app/(shop)/products/page.tsx",
  dimension: "nextjs",
  difficulty: "进阶",
};

function localEvaluation(
  interviewId: string,
  answer: string,
  questionNumber: number,
): Evaluation {
  const normalized = answer.toLowerCase();
  const matched = [
    "ssr",
    "缓存",
    "cache",
    "服务端",
    "预取",
    "loading",
    "错误",
  ].filter((word) => normalized.includes(word)).length;
  const score = Math.min(
    10,
    Math.max(4.8, 5.4 + matched * 0.7 + Math.min(answer.length, 500) / 500),
  );

  return {
    interviewId,
    score: Number(score.toFixed(1)),
    strengths: ["能够从首屏体验出发解释数据获取方案", "回答与当前项目场景相关"],
    improvements: [
      "补充缓存失效和客户端交互的衔接策略",
      "说明异常状态和 loading 状态如何统一处理",
    ],
    nextQuestion:
      questionNumber >= 2
        ? undefined
        : {
            id: "react-state-boundary",
            prompt:
              "项目中哪些状态应该留在组件内部，哪些状态值得提升或放进全局状态？你的判断标准是什么？",
            contextPath: "src/store/cart.ts",
            dimension: "react",
            difficulty: "基础",
          },
    questionNumber: 2,
    totalQuestions: 2,
    completed: questionNumber >= 2,
    provider: "local-mock",
    note: "当前是两题本地演示，回答不会保存，也不计入能力评分。",
  };
}

function downloadInterviewReport(interview: InterviewDetail) {
  const lines = [
    `# RepoCoach 面试复盘：${interview.projectName}`,
    "",
    `- 状态：${interview.status === "completed" ? "已完成" : "进行中"}`,
    `- 模型平均分：${interview.scoredQuestions ? interview.averageScore.toFixed(1) + " / 10" : "暂无模型评价"}`,
    `- 模型评价：${interview.scoredQuestions} 题；规则演示：${interview.demoQuestions} 题`,
    `- 开始时间：${formatSessionTime(interview.startedAt)}`,
    `- 目标岗位：${interview.jobDescription || "前端开发实习生"}`,
    "",
    ...interview.answers.flatMap((item) => [
      `## 第 ${item.questionNumber} 题`,
      "",
      item.question,
      "",
      `代码位置：\`${item.contextPath}\`  `,
      `${item.provider === "deepseek" ? "模型评分" : "规则演示分（不计入能力评分）"}：**${item.score === null ? "无法判断" : item.score.toFixed(1)} / 10**`,
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
      ...(item.rubric
        ? [
            "",
            "### 四项评分与依据",
            "",
            ...item.rubric.criteria.flatMap((criterion) => [
              `- ${criterion.key}：${criterion.score === null ? "无法判断" : criterion.score + " / 4"}；${criterion.reason}`,
              ...criterion.evidenceIds.flatMap((id) => {
                const source = item.evidence?.items.find(
                  (source) => source.id === id,
                );
                return source
                  ? [
                      `  - ${source.path}:${source.startLine}–${source.endLine}`,
                      "",
                      "```",
                      source.snippet,
                      "```",
                      "",
                    ]
                  : [];
              }),
            ]),
          ]
        : []),
      "",
    ]),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${interview.projectName.replace(/[^a-zA-Z0-9-_]/g, "-")}-interview-review.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: User) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const normalizedEmail = normalizeEmail(email);
    const emailIssue = emailValidationError(normalizedEmail);
    if (emailIssue) {
      setEmailError(emailIssue);
      setIsSubmitting(false);
      return;
    }
    setEmailError(null);
    try {
      const result =
        mode === "register"
          ? await register({
              name: name.trim(),
              email: normalizedEmail,
              password,
            })
          : await login({ email: normalizedEmail, password });
      if (mode === "register" && result.requiresEmailVerification) {
        setVerificationRequired(true);
        setError(null);
      } else {
        onAuthenticated(result.user);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "认证失败，请稍后重试。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsVerifying(true);
    setError(null);
    try {
      const result = await verifyEmail({
        email: normalizeEmail(email),
        code: verificationCode.trim(),
      });
      onAuthenticated(result.user);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "验证失败，请稍后重试。",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setIsVerifying(true);
    setError(null);
    try {
      await resendVerification(normalizeEmail(email));
      setError("验证码已重新发送，请检查 Gmail 收件箱和垃圾邮件。");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "发送失败，请稍后重试。",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  if (verificationRequired) {
    return (
      <main className="auth-shell">
        <section className="auth-brand">
          <div className="brand-row">
            <div className="brand-mark">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="brand-name">RepoCoach</div>
              <div className="brand-caption">FE INTERVIEW LAB</div>
            </div>
          </div>
          <div className="auth-position">
            <span>AI 项目面试工作台</span>
            <h1>把真实代码，练成有证据的面试表达</h1>
            <p>验证邮箱后即可开始你的项目面试训练。</p>
          </div>
          <div className="auth-proof">
            <span>
              <Github size={15} />
              代码级提问
            </span>
            <span>
              <Sparkles size={15} />
              自适应追问
            </span>
            <span>
              <BarChart3 size={15} />
              真实能力报告
            </span>
          </div>
        </section>
        <section className="auth-form-wrap">
          <div className="auth-form-heading">
            <span className="section-kicker">
              <Mail size={14} />
              邮箱验证
            </span>
            <h2>验证你的 Gmail</h2>
            <p>验证码已发送到 {normalizeEmail(email)}，10 分钟内有效。</p>
          </div>
          <form className="auth-form" onSubmit={handleVerify}>
            <label>
              <span>6 位验证码</span>
              <div className="auth-input">
                <Mail size={16} />
                <input
                  value={verificationCode}
                  onChange={(event) =>
                    setVerificationCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="请输入验证码"
                  autoComplete="one-time-code"
                  required
                />
              </div>
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button
              className="primary-button auth-submit"
              type="submit"
              disabled={isVerifying || verificationCode.length !== 6}
            >
              {isVerifying ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              {isVerifying ? "验证中" : "完成验证"}
            </button>
            <button
              className="verification-resend"
              type="button"
              onClick={handleResend}
              disabled={isVerifying}
            >
              重新发送验证码
            </button>
            <button
              className="verification-back"
              type="button"
              onClick={() => {
                setVerificationRequired(false);
                setError(null);
              }}
            >
              返回修改邮箱
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <div className="brand-row">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="brand-name">RepoCoach</div>
            <div className="brand-caption">FE INTERVIEW LAB</div>
          </div>
        </div>
        <div className="auth-position">
          <span>AI 项目面试工作台</span>
          <h1>把真实代码，练成有证据的面试表达</h1>
          <p>导入 GitHub 项目，由 Agent 连续追问、评分并沉淀个人能力报告。</p>
        </div>
        <div className="auth-proof">
          <span>
            <Github size={15} />
            代码级提问
          </span>
          <span>
            <Sparkles size={15} />
            自适应追问
          </span>
          <span>
            <BarChart3 size={15} />
            真实能力报告
          </span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form-heading">
          <span className="section-kicker">
            <LockKeyhole size={14} />
            账号工作区
          </span>
          <h2>{mode === "login" ? "登录 RepoCoach" : "创建你的账号"}</h2>
          <p>
            {mode === "login"
              ? "继续你的项目面试训练。"
              : "仅支持 Gmail，注册后需完成邮箱验证。"}
          </p>
        </div>
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={mode === "login" ? "auth-tab-active" : ""}
            onClick={() => {
              setMode("login");
              setError(null);
              setEmailError(null);
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === "register" ? "auth-tab-active" : ""}
            onClick={() => {
              setMode("register");
              setError(null);
              setEmailError(null);
            }}
          >
            注册
          </button>
        </div>
        <form className="auth-form" onSubmit={handleAuth}>
          {mode === "register" && (
            <label>
              <span>姓名</span>
              <div className="auth-input">
                <UserRound size={16} />
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="用于面试报告署名"
                  minLength={2}
                  maxLength={40}
                  required
                />
              </div>
            </label>
          )}
          <label>
            <span>Gmail 邮箱</span>
            <div className="auth-input">
              <Mail size={16} />
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(null);
                }}
                onBlur={() => setEmailError(emailValidationError(email))}
                placeholder="name@gmail.com"
                autoComplete="email"
                aria-invalid={Boolean(emailError)}
                required
              />
            </div>
            {emailError && (
              <small className="auth-field-error">{emailError}</small>
            )}
            {mode === "register" && (
              <small className="auth-field-hint">
                仅支持 @gmail.com；注册后会向该邮箱发送 6 位验证码。
              </small>
            )}
          </label>
          <label>
            <span>密码</span>
            <div className="auth-input">
              <LockKeyhole size={16} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 8 位"
                minLength={8}
                maxLength={72}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                required
              />
            </div>
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <LoaderCircle size={16} className="spin" />
            ) : mode === "login" ? (
              <LockKeyhole size={16} />
            ) : (
              <UserRound size={16} />
            )}
            {isSubmitting ? "处理中" : mode === "login" ? "登录" : "创建账号"}
          </button>
        </form>
      </section>
    </main>
  );
}

function InterviewStartingCard({ projectName }: { projectName: string }) {
  return (
    <section
      className="interview-starting panel"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="starting-indicator">
        <LoaderCircle size={22} className="spin" />
      </div>
      <div>
        <span className="section-kicker">
          <Sparkles size={14} />
          Agent 正在准备
        </span>
        <h2>正在为 {projectName} 组织第一道问题</h2>
        <p>正在恢复项目上下文并创建训练记录，完成后会自动显示题目。</p>
      </div>
    </section>
  );
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRevision, setAuthRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setIsAuthLoading(true);
    setAuthError(null);
    void getCurrentUser()
      .then((result) => {
        if (!cancelled) setCurrentUser(result.user);
      })
      .catch((reason) => {
        if (cancelled) return;
        if (reason instanceof ApiError && reason.status === 401)
          setCurrentUser(null);
        else
          setAuthError(
            reason instanceof Error ? reason.message : "暂时无法检查登录状态。",
          );
      })
      .finally(() => {
        if (!cancelled) setIsAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authRevision]);
  if (isAuthLoading)
    return (
      <main className="auth-loading">
        <LoaderCircle size={24} className="spin" />
        <span>正在恢复登录状态</span>
      </main>
    );
  if (authError)
    return (
      <main className="auth-recovery">
        <Info size={28} />
        <h1>暂时无法连接工作区</h1>
        <p>{authError}</p>
        <p>登录状态尚未确认，服务恢复后可以继续。</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => setAuthRevision((value) => value + 1)}
        >
          <RefreshCw size={15} />
          重新连接
        </button>
      </main>
    );
  if (!currentUser) return <AuthScreen onAuthenticated={setCurrentUser} />;
  return (
    <Workspace
      key={currentUser.id}
      currentUser={currentUser}
      onLoggedOut={() => setCurrentUser(null)}
    />
  );
}

function Workspace({
  currentUser,
  onLoggedOut,
}: {
  currentUser: User;
  onLoggedOut: () => void;
}) {
  const [activeNav, setActiveNav] = useState("工作台");
  const [project, setProject] = useState<Project>(fallbackProject);
  const [memoryRevision, setMemoryRevision] = useState(0);
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [summarySession, setSummarySession] = useState<{
    id: string;
    projectId: string;
  } | null>(null);
  const [reviewQuestionNumber, setReviewQuestionNumber] = useState<
    number | undefined
  >();
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const {
    report,
    loading: isReportLoading,
    error: reportError,
    refresh: refreshReport,
  } = useCapabilityReport(project.id, currentUser?.id, workspaceReady);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState(project.url);
  const [jobDescription, setJobDescription] = useState(defaultJobDescription);
  const [notice, setNotice] = useState<string | null>(null);

  const alive = useRef(true);
  const analyzeSerial = useRef(0);
  const [confirmNewTraining, setConfirmNewTraining] = useState(false);
  const [workspaceStorageFailed, setWorkspaceStorageFailed] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let saved = null;
    try {
      saved = readWorkspace(window.localStorage, currentUser.id);
    } catch {
      setWorkspaceStorageFailed(true);
    }
    setProject(saved?.project ?? fallbackProject);
    setRepoUrl(saved?.project.url ?? fallbackProject.url);
    setJobDescription(saved?.jobDescription || defaultJobDescription);
    setWorkspaceReady(true);
  }, [currentUser.id]);
  useEffect(() => {
    if (!workspaceReady) return;
    try {
      setWorkspaceStorageFailed(
        !writeWorkspace(
          window.localStorage,
          currentUser.id,
          project,
          jobDescription,
        ),
      );
    } catch {
      setWorkspaceStorageFailed(true);
    }
  }, [workspaceReady, currentUser.id, project, jobDescription]);
  const training = useTrainingSession({
    project,
    jobDescription,
    userId: currentUser.id,
    enabled: workspaceReady,
    fallbackQuestion,
    localEvaluation,
    onNotice: setNotice,
    onCompleted: () => {
      setMemoryRevision((value) => value + 1);
      refreshReport();
    },
    onProjectId: (id) => setProject((current) => ({ ...current, id })),
  });
  const {
    interviewId,
    question,
    questionNumber,
    totalQuestions,
    answer,
    evaluation,
    pendingRun,
    runEvents,
    connection,
    practiceFocus,
    submitted,
    starting: isStarting,
    submitting: isSubmitting,
  } = training;
  const handleStartTraining = () => {
    if (!training.canStart) {
      setActiveNav("面试训练");
      return;
    }
    if (training.unfinished) {
      setConfirmNewTraining(true);
      return;
    }
    setActiveNav("面试训练");
    void training.start();
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void training.submit();
  };
  const handleRetryEvaluation = () => {
    void training.retry();
  };
  const setAnswer = training.changeAnswer;
  const handleNext = () => {
    if (evaluation?.nextQuestion) training.next();
    else if (
      evaluation?.completed &&
      interviewId &&
      !interviewId.startsWith("local-")
    ) {
      setSummarySession({ id: interviewId, projectId: project.id });
    } else {
      setActiveNav("能力报告");
      refreshReport();
    }
  };

  const handleNav = (label: string) => {
    setActiveNav(label);
    setMobileOpen(false);
    if (label === "能力报告") refreshReport();
  };

  const closeProjectModal = () => {
    analyzeSerial.current++;
    setIsAnalyzing(false);
    setProjectModalOpen(false);
    setProjectError(null);
  };
  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isAnalyzing) return;
    const normalizedUrl = repoUrl.trim().replace(/\/$/, "");
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(normalizedUrl)) {
      setProjectError(
        "请输入公开 GitHub 仓库地址，例如 https://github.com/用户名/仓库名。",
      );
      return;
    }
    const token = ++analyzeSerial.current;
    setIsAnalyzing(true);
    setProjectError(null);
    setNotice(null);
    try {
      const result = await analyzeProject(normalizedUrl, jobDescription.trim());
      if (!alive.current || token !== analyzeSerial.current) return;
      setProject(result);
      setRepoUrl(result.url);
      setProjectModalOpen(false);
      setConfirmNewTraining(false);
      setSummarySession(null);
      setNotice(`项目 ${result.name} 已分析完成，可以开始面试。`);
    } catch (error) {
      if (alive.current && token === analyzeSerial.current)
        setProjectError(
          `项目分析失败：${error instanceof Error ? error.message : "请稍后重试。"}`,
        );
    } finally {
      if (alive.current && token === analyzeSerial.current)
        setIsAnalyzing(false);
    }
  };

  const handleOpenSession = (sessionId: string, questionNumber?: number) => {
    setReviewQuestionNumber(questionNumber);
    setReviewSessionId(sessionId);
  };

  const handleMemoryCleared = () => {
    if (alive.current) setMemoryRevision((value) => value + 1);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setNotice(
          error instanceof Error ? error.message : "退出未完成，请重试。",
        );
        return;
      }
    }
    try {
      clearUserDrafts(window.localStorage, currentUser.id);
    } catch {
      /* browser storage may be blocked */
    }
    onLoggedOut();
  };

  const progress = report?.readinessScore ?? 0;
  const reportDimensions = report?.dimensions ?? emptyDimensions;
  const weakestDimension = [...reportDimensions]
    .filter((dimension) => dimension.answerCount > 0)
    .sort((a, b) => a.score - b.score)[0];

  const renderWorkbench = () =>
    training.recovering ||
    training.recoveryError ||
    !question ||
    !interviewId ? (
      <TrainingState
        loading={training.recovering}
        error={training.recoveryError}
        onRestore={training.restore}
        onStart={handleStartTraining}
      />
    ) : (
      <InterviewCard
        interviewId={interviewId}
        question={question}
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
        answer={answer}
        evaluation={evaluation}
        submitted={submitted}
        isSubmitting={isSubmitting}
        isStarting={isStarting}
        pendingRun={pendingRun}
        runEvents={runEvents}
        connection={connection}
        draftStatus={training.draftStatus}
        onRetry={handleRetryEvaluation}
        onAnswerChange={setAnswer}
        onSubmit={handleSubmit}
        onNext={handleNext}
      />
    );

  const renderDashboard = () => (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            准备好了吗
          </div>
          <h1>把你的项目，练成面试答案</h1>
          <p>Agent 会围绕真实代码发问，帮你找到项目表达中的空白。</p>
        </div>
        <button
          className="primary-button"
          onClick={handleStartTraining}
          disabled={!training.canStart}
        >
          {isStarting ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Play size={16} />
          )}{" "}
          {isStarting ? "准备中" : "开始一次训练"}
        </button>
      </div>
      <div className="stats-grid">
        <div className="stat-card stat-card-main">
          <div className="stat-top">
            <span>模型评分概览</span>
            <Target size={17} />
          </div>
          <div className="stat-value">
            {report?.scoredQuestions ? progress : "—"}
            <small>/100</small>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="stat-foot">
            基于 {report?.scoredQuestions ?? 0} 道模型评价
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>完成训练</span>
            <CheckCircle2 size={17} />
          </div>
          <div className="stat-value">
            {report?.completedInterviews ?? 0}
            <small> 次</small>
          </div>
          <div className="stat-foot">完整完成四题计为一次</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>已覆盖主题</span>
            <BookOpen size={17} />
          </div>
          <div className="stat-value">
            {report?.coveredTopics ?? 0}
            <small> 个</small>
          </div>
          <div className="stat-foot">来自实际项目文件</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>待强化</span>
            <Clock3 size={17} />
          </div>
          <div className="stat-value stat-value-small">
            {weakestDimension?.label ?? "等待数据"}
          </div>
          <div className="stat-foot">完成回答后自动更新</div>
        </div>
      </div>
      <ProjectContext
        project={project}
        onChange={() => setProjectModalOpen(true)}
      />
      <div className="dashboard-grid">
        {renderWorkbench()}
        <SignalPanel
          report={report}
          error={reportError}
          isLoading={isReportLoading}
          onOpenReport={() => handleNav("能力报告")}
        />
      </div>
      <TrainingMemoryPanel
        key={currentUser.id + project.id}
        projectId={project.id}
        revision={memoryRevision}
        focus={practiceFocus}
        onReview={handleOpenSession}
        onCleared={handleMemoryCleared}
      />
      <SessionsPanel
        report={report}
        isLoading={isReportLoading}
        onOpenReport={() => handleNav("能力报告")}
        onOpenSession={handleOpenSession}
      />
    </>
  );

  const renderTraining = () => (
    <>
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            训练空间
          </div>
          <h1>项目深挖面试</h1>
          <p>围绕 {project.name} 的 React / Next.js 技术面试。</p>
        </div>
        <span className="mode-chip">
          <ShieldCheck size={14} />
          公开仓库只读
        </span>
      </div>
      {isStarting ? (
        <InterviewStartingCard projectName={project.name} />
      ) : (
        renderWorkbench()
      )}
      <TrainingMemoryPanel
        key={currentUser.id + project.id}
        projectId={project.id}
        revision={memoryRevision}
        focus={practiceFocus}
        onReview={handleOpenSession}
        onCleared={handleMemoryCleared}
      />
    </>
  );

  const renderReport = () => (
    <CapabilityReportView
      key={`${currentUser.id}:${project.id}`}
      projectId={project.id}
      projectName={project.name}
      report={report}
      loading={isReportLoading}
      error={reportError}
      memoryRevision={memoryRevision}
      starting={!training.canStart}
      onRefresh={refreshReport}
      onStart={handleStartTraining}
      onReview={handleOpenSession}
      onSummary={(id) => setSummarySession({ id, projectId: project.id })}
    />
  );

  const renderSettings = () => (
    <>
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" />
            项目设置
          </div>
          <h1>管理你的项目上下文</h1>
          <p>RepoCoach 只读取公开仓库，不会修改代码或创建 PR。</p>
        </div>
        <button
          className="primary-button"
          onClick={() => setProjectModalOpen(true)}
        >
          <Github size={16} />
          更换仓库
        </button>
      </div>
      <section className="settings-grid">
        <section className="panel settings-card">
          <div className="settings-title">
            <div className="repo-icon">
              <Github size={20} />
            </div>
            <div>
              <span className="section-kicker">当前仓库</span>
              <h2>{project.name}</h2>
            </div>
          </div>
          <div className="settings-row">
            <span>仓库地址</span>
            <a href={project.url} target="_blank" rel="noreferrer">
              {project.url}
              <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="settings-row">
            <span>可见性</span>
            <strong>
              <ShieldCheck size={14} />
              公开
            </strong>
          </div>
          <div className="settings-row">
            <span>默认分支</span>
            <strong>{project.defaultBranch ?? "main"}</strong>
          </div>
          <div className="settings-row">
            <span>已分析文件</span>
            <strong>{project.analyzedFiles} 个</strong>
          </div>
          {project.description && (
            <p className="settings-description">{project.description}</p>
          )}
          <button
            className="ghost-button"
            onClick={() => setProjectModalOpen(true)}
          >
            <RefreshCw size={15} />
            重新分析项目
          </button>
        </section>
        <section className="panel settings-card">
          <div className="settings-title">
            <div className="repo-icon repo-icon-warm">
              <Code2 size={20} />
            </div>
            <div>
              <span className="section-kicker">分析摘要</span>
              <h2>关键文件</h2>
            </div>
          </div>
          {project.keyFiles?.length ? (
            <div className="key-file-list">
              {project.keyFiles.slice(0, 8).map((file) => (
                <div className="key-file" key={file.path}>
                  <FileCode2 size={14} />
                  <code>{file.path}</code>
                  <span>{file.language}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="settings-note">
              导入公开仓库后，这里会列出与面试最相关的文件。
            </p>
          )}
          <div className="preference-tags">
            <span>React</span>
            <span>Next.js</span>
            <span>TypeScript</span>
            <span>性能优化</span>
          </div>
        </section>
      </section>
    </>
  );

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <Sparkles size={17} />
          </div>
          <div>
            <div className="brand-name">RepoCoach</div>
            <div className="brand-caption">FE INTERVIEW LAB</div>
          </div>
          <button
            className="icon-button sidebar-close"
            aria-label="关闭菜单"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="workspace-switcher"
          onClick={() => setProjectModalOpen(true)}
        >
          <div className="repo-avatar">
            {project.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="workspace-copy">
            <strong>{project.name}</strong>
            <span>
              公开仓库 · {project.status === "synced" ? "已同步" : "分析中"}
            </span>
          </div>
          <ChevronRight size={16} className="muted-icon" />
        </button>
        <div className="nav-group">
          <div className="nav-label">工作区</div>
          {navItems.map(({ label, icon: Icon }) => (
            <button
              className={`nav-item ${activeNav === label ? "nav-item-active" : ""}`}
              key={label}
              onClick={() => handleNav(label)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {label === "能力报告" && (
                <span className="nav-count">
                  {report?.recentSessions.length ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="plan-status">
            <div className="plan-icon">
              <ShieldCheck size={17} />
            </div>
            <div>
              <strong>账号数据隔离</strong>
              <span>训练记录仅自己可见</span>
            </div>
          </div>
          <div className="user-row">
            <div className="user-avatar">{currentUser.name.slice(0, 1)}</div>
            <div className="workspace-copy">
              <strong>{currentUser.name}</strong>
              <span>{currentUser.email}</span>
            </div>
            <button
              className="icon-button"
              title="退出登录"
              aria-label="退出登录"
              onClick={handleLogout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="scrim"
          aria-label="关闭菜单"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <section className="main-panel">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="打开菜单"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>工作台</span>
            <ChevronRight size={14} />
            <strong>{activeNav}</strong>
          </div>
          <div className="topbar-actions">
            <span className="sync-status">
              <span className="status-dot" />
              账号已登录
            </span>
            <button className="avatar-button" aria-label="当前用户">
              {currentUser.name.slice(0, 1)}
            </button>
          </div>
        </header>
        <div className="content-wrap">
          {workspaceStorageFailed && (
            <div className="notice-banner" role="status">
              <Info size={15} />
              <span>
                浏览器无法保存项目设置。当前仍可使用，刷新后可能需要重新导入仓库。
              </span>
            </div>
          )}
          {notice && (
            <div className="notice-banner">
              <Sparkles size={15} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="关闭提示"
                onClick={() => setNotice(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {activeNav === "工作台" && renderDashboard()}
          {activeNav === "面试训练" && renderTraining()}
          {activeNav === "能力报告" && renderReport()}
          {activeNav === "项目设置" && renderSettings()}
        </div>
      </section>
      {projectModalOpen && (
        <DialogSurface
          label="导入公开仓库"
          className="modal-card project-import-dialog"
          onClose={closeProjectModal}
        >
          <div className="modal-heading">
            <div>
              <span className="section-kicker">
                <Github size={14} />
                公开仓库
              </span>
              <h2 id="project-modal-title">导入一个 React / Next.js 项目</h2>
            </div>
            <button
              className="icon-button"
              aria-label="关闭弹窗"
              onClick={closeProjectModal}
            >
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleAnalyze}>
            {projectError && (
              <p className="import-error" role="alert">
                {projectError}
              </p>
            )}
            <label className="answer-label" htmlFor="repo-url">
              GitHub 仓库地址
            </label>
            <input
              id="repo-url"
              maxLength={300}
              disabled={isAnalyzing}
              required
              autoFocus
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/用户名/仓库名"
            />
            <label className="answer-label" htmlFor="job-description">
              目标岗位 JD
            </label>
            <textarea
              id="job-description"
              maxLength={8000}
              disabled={isAnalyzing}
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder="粘贴前端实习岗位描述，帮助 Agent 调整问题重点。"
            />
            <div className="modal-foot">
              <span>只支持公开仓库，读取过程不会修改代码。</span>
              <div className="answer-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={closeProjectModal}
                >
                  取消
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Github size={15} />
                  )}
                  {isAnalyzing ? "分析中" : "分析仓库"}
                </button>
              </div>
            </div>
          </form>
        </DialogSurface>
      )}
      {confirmNewTraining && (
        <DialogSurface
          label="开始新的训练"
          className="restart-training-dialog"
          onClose={() => setConfirmNewTraining(false)}
        >
          <h2>当前训练尚未完成</h2>
          <p>
            可以继续当前题目；也可以开始一场新训练。已提交回答仍保留在历史记录，当前草稿仅保存在此浏览器。
          </p>
          <div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setConfirmNewTraining(false);
                setActiveNav("面试训练");
              }}
            >
              继续当前训练
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setConfirmNewTraining(false);
                setActiveNav("面试训练");
                void training.start();
              }}
            >
              开始新训练
            </button>
          </div>
        </DialogSurface>
      )}
      {summarySession && summarySession.projectId === project.id && (
        <SessionSummary
          key={`${currentUser.id}:${project.id}:${summarySession.id}`}
          sessionId={summarySession.id}
          projectId={project.id}
          starting={!training.canStart}
          onClose={() => setSummarySession(null)}
          onReview={handleOpenSession}
          onExport={downloadInterviewReport}
          onReport={() => {
            setSummarySession(null);
            handleNav("能力报告");
          }}
          onStart={() => {
            setSummarySession(null);
            handleStartTraining();
          }}
        />
      )}
      {reviewSessionId && (
        <InterviewReview
          key={reviewSessionId}
          sessionId={reviewSessionId}
          initialQuestionNumber={reviewQuestionNumber}
          onClose={() => setReviewSessionId(null)}
          onExport={downloadInterviewReport}
        />
      )}
    </main>
  );
}

function ProjectContext({
  project,
  onChange,
}: {
  project: Project;
  onChange: () => void;
}) {
  return (
    <div className="repo-context-bar">
      <div className="repo-context-main">
        <div className="repo-icon">
          <Github size={20} />
        </div>
        <div>
          <strong>{project.name}</strong>
          <span>{project.url.replace("https://", "")}</span>
        </div>
      </div>
      <div className="tech-tags">
        {project.stack.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        <span>{project.analyzedFiles} 个文件已分析</span>
      </div>
      <button className="text-button" onClick={onChange}>
        更换项目 <ArrowUpRight size={15} />
      </button>
    </div>
  );
}

function SignalPanel({
  report,
  error,
  isLoading,
  onOpenReport,
}: {
  report: CapabilityReport | null;
  error: string | null;
  isLoading: boolean;
  onOpenReport: () => void;
}) {
  const dimensions = report?.dimensions ?? emptyDimensions;
  return (
    <section className="signal-panel panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">
            <BarChart3 size={14} />
            训练信号
          </span>
          <h2>能力概览</h2>
        </div>
        <button
          className="icon-button"
          title="打开完整报告"
          onClick={onOpenReport}
        >
          <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="signal-summary">
        <div className="signal-score">
          {report?.scoredQuestions ? report.readinessScore : "—"}
        </div>
        <div>
          <strong>
            {isLoading
              ? "正在读取"
              : error
                ? "报告更新未完成"
                : report?.hasData
                  ? "模型评分概览"
                  : "等待可比较评分"}
          </strong>
          <span>
            {error
              ? "打开能力报告重新加载，已保存回答不会丢失。"
              : (report?.summary ?? "提交面试回答后，能力信号会自动更新。")}
          </span>
        </div>
      </div>
      <div className="dimension-list">
        {dimensions.map((dimension) => (
          <div className="dimension-row" key={dimension.key}>
            <div className="dimension-label">
              <span>{dimension.label}</span>
              <strong>{dimension.answerCount ? dimension.score : "—"}</strong>
            </div>
            <div className="dimension-track">
              <span
                className={`bar-${dimension.color}`}
                style={{ width: `${dimension.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="signal-tip">
        <Sparkles size={15} />
        <span>
          {report?.nextActions[0] ?? "完成第一道项目题，获得针对性训练建议。"}
        </span>
      </div>
    </section>
  );
}

function SessionsPanel({
  report,
  isLoading,
  onOpenReport,
  onOpenSession,
}: {
  report: CapabilityReport | null;
  isLoading: boolean;
  onOpenReport: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const sessions = report?.recentSessions ?? [];
  return (
    <section className="sessions-panel panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">
            <GitPullRequest size={14} />
            训练记录
          </span>
          <h2>最近的面试</h2>
        </div>
        <button className="text-button" onClick={onOpenReport}>
          查看报告 <ChevronRight size={15} />
        </button>
      </div>
      <div className="session-table">
        <div className="table-row table-head">
          <span>训练主题</span>
          <span>项目</span>
          <span>得分</span>
          <span>更新时间</span>
          <span />
        </div>
        {sessions.map((session) => (
          <button
            className="table-row table-row-button"
            key={session.id}
            onClick={() => onOpenSession(session.id)}
          >
            <div className="session-name">
              <div
                className={`session-icon ${session.status === "completed" ? "blue-icon" : "amber-icon"}`}
              >
                <Code2 size={15} />
              </div>
              <div>
                <strong>项目深挖面试</strong>
                <span>
                  {session.questionCount} 道回答 ·{" "}
                  {session.status === "completed" ? "已完成" : "进行中"}
                </span>
              </div>
            </div>
            <span>{session.projectName}</span>
            <strong className="score-text">
              {session.scoredQuestions ? session.averageScore.toFixed(1) : "-"}
            </strong>
            <span>
              {formatSessionTime(session.completedAt ?? session.startedAt)}
            </span>
            <ChevronRight size={16} className="muted-icon" />
          </button>
        ))}
        {!sessions.length && (
          <div className="session-empty">
            {isLoading
              ? "正在读取训练记录…"
              : "完成一次回答后，训练记录会显示在这里。"}
          </div>
        )}
      </div>
    </section>
  );
}

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
