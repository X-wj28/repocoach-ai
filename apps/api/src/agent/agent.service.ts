import { Injectable } from "@nestjs/common";

type Question = {
  id: string;
  prompt: string;
  contextPath: string;
  dimension: "react" | "nextjs" | "engineering" | "performance";
  difficulty: "基础" | "进阶" | "深入";
};

type InterviewState = {
  projectId: string;
  currentQuestion: number;
};

const questions: Question[] = [
  {
    id: "next-data-fetching",
    prompt: "你的商品列表为什么采用客户端请求？如果首屏加载速度变慢，你会如何重新设计数据获取方案？",
    contextPath: "app/(shop)/products/page.tsx",
    dimension: "nextjs",
    difficulty: "进阶"
  },
  {
    id: "react-state-boundary",
    prompt: "项目中哪些状态应该留在组件内部，哪些状态值得提升或放进全局状态？你的判断标准是什么？",
    contextPath: "src/store/cart.ts",
    dimension: "react",
    difficulty: "基础"
  },
  {
    id: "react-performance",
    prompt: "如果商品列表出现频繁重复渲染，你会如何定位问题？哪些优化手段会优先考虑，哪些可能只是过早优化？",
    contextPath: "components/ProductList.tsx",
    dimension: "performance",
    difficulty: "深入"
  },
  {
    id: "engineering-errors",
    prompt: "当接口失败或返回数据不完整时，这个页面应该如何向用户反馈？你会怎样设计可复用的错误处理边界？",
    contextPath: "src/lib/api-client.ts",
    dimension: "engineering",
    difficulty: "进阶"
  }
];

@Injectable()
export class AgentService {
  private readonly interviews = new Map<string, InterviewState>();

  startInterview(projectId: string, _jobDescription: string) {
    const interviewId = `interview-${Date.now()}`;
    this.interviews.set(interviewId, { projectId, currentQuestion: 0 });

    return {
      interviewId,
      question: questions[0],
      questionNumber: 1,
      totalQuestions: questions.length,
      mode: "project-deep-dive"
    };
  }

  evaluateAnswer(interviewId: string, answer: string) {
    const state = this.interviews.get(interviewId) ?? { projectId: "demo-project", currentQuestion: 0 };
    const normalized = answer.toLowerCase();
    const keywords = ["ssr", "缓存", "cache", "服务端", "预取", "loading", "错误"];
    const matched = keywords.filter((keyword) => normalized.includes(keyword)).length;
    const score = Math.min(10, Math.max(4.8, 5.4 + matched * 0.7 + Math.min(answer.length, 500) / 500));
    const nextQuestionIndex = state.currentQuestion + 1;
    const hasNextQuestion = nextQuestionIndex < questions.length;
    state.currentQuestion = nextQuestionIndex;
    this.interviews.set(interviewId, state);

    return {
      interviewId,
      projectId: state.projectId,
      score: Number(score.toFixed(1)),
      strengths: ["能够从首屏体验出发解释数据获取方案", "回答与当前项目场景相关"],
      improvements: ["补充缓存失效和客户端交互的衔接策略", "说明异常状态和 loading 状态如何统一处理"],
      nextQuestion: hasNextQuestion ? questions[nextQuestionIndex] : undefined,
      questionNumber: Math.min(nextQuestionIndex + 1, questions.length),
      totalQuestions: questions.length,
      completed: !hasNextQuestion,
      provider: "local-mock",
      note: "当前返回本地 mock 结果；接入真实模型后保留相同的 Agent contract。"
    };
  }
}
