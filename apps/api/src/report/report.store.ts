import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InterviewDifficulty,
  InterviewDimension,
  InterviewStatus,
  Prisma,
} from "@prisma/client";
import type { InterviewEvaluation, Question } from "../agent/interview.types";
import type { ProjectContext } from "../github/github.service";
import { PrismaService } from "../database/prisma.service";

type InterviewRecord = {
  id: string;
  userId: string;
  projectId: string;
  projectName: string;
  projectUrl: string;
  jobDescription: string;
  totalQuestions: number;
  questions: Question[];
  projectContext: ProjectContext;
  practiceFocus?: unknown;
};

const dimensions = [
  { key: "react", label: "React 基础", color: "teal" },
  { key: "nextjs", label: "Next.js 应用", color: "blue" },
  { key: "engineering", label: "工程化", color: "amber" },
  { key: "performance", label: "性能意识", color: "rose" },
] as const;

const dimensionToDatabase: Record<Question["dimension"], InterviewDimension> = {
  react: InterviewDimension.REACT,
  nextjs: InterviewDimension.NEXTJS,
  engineering: InterviewDimension.ENGINEERING,
  performance: InterviewDimension.PERFORMANCE,
};

const dimensionFromDatabase: Record<InterviewDimension, Question["dimension"]> =
  {
    REACT: "react",
    NEXTJS: "nextjs",
    ENGINEERING: "engineering",
    PERFORMANCE: "performance",
  };

const difficultyToDatabase: Record<
  Question["difficulty"],
  InterviewDifficulty
> = {
  基础: InterviewDifficulty.BASIC,
  进阶: InterviewDifficulty.ADVANCED,
  深入: InterviewDifficulty.DEEP,
};

const difficultyFromDatabase: Record<
  InterviewDifficulty,
  Question["difficulty"]
> = {
  BASIC: "基础",
  ADVANCED: "进阶",
  DEEP: "深入",
};

@Injectable()
export class ReportStore {
  constructor(private readonly prisma: PrismaService) {}

  async createInterview(interview: InterviewRecord) {
    await this.prisma.interview.create({
      data: {
        id: interview.id,
        userId: interview.userId,
        projectId: interview.projectId,
        projectName: interview.projectName,
        projectUrl: interview.projectUrl,
        jobDescription: interview.jobDescription,
        totalQuestions: interview.totalQuestions,
        questions: interview.questions,
        projectContext: interview.projectContext,
        ...(interview.practiceFocus ? { practiceFocus: interview.practiceFocus as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async getInterviewState(interviewId: string, userId: string) {
    return this.prisma.interview.findFirst({
      where: { id: interviewId, userId },
      select: {
        id: true,
        projectId: true,
        jobDescription: true,
        currentQuestion: true,
        questions: true,
        practiceFocus: true,
        projectContext: true,
        status: true,
      },
    });
  }

  async getActiveInterview(projectId: string, userId: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { projectId, userId, status: InterviewStatus.IN_PROGRESS },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        projectId: true,
        currentQuestion: true,
        totalQuestions: true,
        questions: true,
        practiceFocus: true,
      },
    });
    if (!interview || !Array.isArray(interview.questions)) return null;
    const question = interview.questions[interview.currentQuestion];
    if (!question || typeof question !== "object") return null;
    return {
      interviewId: interview.id,
      projectId: interview.projectId,
      question: question as Question,
      questionNumber: interview.currentQuestion + 1,
      totalQuestions: interview.totalQuestions,
      practiceFocus: interview.practiceFocus,
    };
  }

  async recordAnswer(
    input: {
      interviewId: string;
      userId: string;
      questionNumber: number;
      question: Question;
      answer: string;
      evaluation: InterviewEvaluation;
      completed: boolean;
      questions: Question[];
      projectContext?: ProjectContext;
    },
    transaction?: Prisma.TransactionClient,
  ): Promise<InterviewEvaluation> {
    const commit = async (transaction: Prisma.TransactionClient) => {
      const advanced = await transaction.interview.updateMany({
        where: {
          id: input.interviewId,
          userId: input.userId,
          currentQuestion: input.questionNumber - 1,
          status: InterviewStatus.IN_PROGRESS,
        },
        data: {
          currentQuestion: input.questionNumber,
          questions: input.questions,
          ...(input.projectContext
            ? { projectContext: input.projectContext }
            : {}),
          ...(input.completed
            ? { status: InterviewStatus.COMPLETED, completedAt: new Date() }
            : {}),
        },
      });
      if (advanced.count !== 1) {
        const existing = await transaction.interviewAnswer.findFirst({
          where: {
            interviewId: input.interviewId,
            questionNumber: input.questionNumber,
            interview: { userId: input.userId },
          },
          select: { answer: true, evaluation: true },
        });
        const evaluation = this.restoreEvaluation(existing?.evaluation);
        if (existing?.answer === input.answer && evaluation) return evaluation;
        throw new ConflictException(
          "这道题已提交或会话已更新，请刷新训练进度。",
        );
      }
      await transaction.interviewAnswer.create({
        data: {
          interviewId: input.interviewId,
          questionNumber: input.questionNumber,
          questionId: input.question.id,
          questionPrompt: input.question.prompt,
          contextPath: input.question.contextPath,
          dimension: dimensionToDatabase[input.question.dimension],
          difficulty: difficultyToDatabase[input.question.difficulty],
          answer: input.answer,
          score: input.evaluation.score,
          strengths: input.evaluation.strengths,
          improvements: input.evaluation.improvements,
          provider: input.evaluation.provider,
          evaluation: input.evaluation,
        },
      });

      return input.evaluation;
    };
    return transaction ? commit(transaction) : this.prisma.$transaction(commit);
  }

  async getRecordedAnswer(
    interviewId: string,
    userId: string,
    questionId: string,
  ) {
    const record = await this.prisma.interviewAnswer.findFirst({
      where: { interviewId, questionId, interview: { userId } },
      select: { answer: true, evaluation: true },
    });
    return record
      ? {
          answer: record.answer,
          evaluation: this.restoreEvaluation(record.evaluation),
        }
      : null;
  }

  private restoreEvaluation(value: unknown): InterviewEvaluation | null {
    if (!value || typeof value !== "object") return null;
    const evaluation = value as Partial<InterviewEvaluation>;
    return typeof evaluation.interviewId === "string" &&
      (typeof evaluation.score === "number" || evaluation.score === null) &&
      Array.isArray(evaluation.strengths) &&
      Array.isArray(evaluation.improvements) &&
      typeof evaluation.completed === "boolean"
      ? (evaluation as InterviewEvaluation)
      : null;
  }

  async getProjectReport(projectId: string, userId: string) {
    const [databaseAnswers, sessions, completedInterviews] = await Promise.all([
      this.prisma.interviewAnswer.findMany({
        where: { interview: { projectId, userId } },
        orderBy: { answeredAt: "desc" },
        select: {
          dimension: true,
          score: true,
          strengths: true,
          improvements: true,
          contextPath: true,
          provider: true,
        },
      }),
      this.prisma.interview.findMany({
        where: { projectId, userId },
        orderBy: { startedAt: "desc" },
        take: 6,
        include: { answers: { select: { score: true, provider: true } } },
      }),
      this.prisma.interview.count({
        where: { projectId, userId, status: InterviewStatus.COMPLETED },
      }),
    ]);

    const answers = databaseAnswers.map((answer) => ({
      ...answer,
      dimension: dimensionFromDatabase[answer.dimension],
    }));
    const gradedAnswers = answers.filter(
      (answer): answer is typeof answer & { score: number } =>
        answer.provider === "deepseek" && answer.score !== null,
    );
    const dimensionResults = dimensions.map((dimension) => {
      const matching = gradedAnswers.filter(
        (answer) => answer.dimension === dimension.key,
      );
      const score = matching.length
        ? Math.round(
            (matching.reduce((sum, answer) => sum + answer.score, 0) /
              matching.length) *
              10,
          )
        : 0;
      return {
        ...dimension,
        score,
        answerCount: matching.length,
        feedback: this.dimensionFeedback(score, matching.length),
      };
    });

    const readinessScore = gradedAnswers.length
      ? Math.round(
          (gradedAnswers.reduce((sum, answer) => sum + answer.score, 0) /
            gradedAnswers.length) *
            10,
        )
      : 0;
    const strengths = this.uniqueFeedback(
      gradedAnswers.flatMap((answer) => this.parseList(answer.strengths)),
    );
    const improvements = this.uniqueFeedback(
      gradedAnswers.flatMap((answer) => this.parseList(answer.improvements)),
    );
    const measured = dimensionResults.filter(
      (dimension) => dimension.answerCount > 0,
    );
    const weakest = [...measured].sort((a, b) => a.score - b.score)[0];
    const strongest = [...measured].sort((a, b) => b.score - a.score)[0];

    return {
      projectId,
      hasData: gradedAnswers.length > 0,
      readinessScore,
      averageScore: gradedAnswers.length
        ? Number((readinessScore / 10).toFixed(1))
        : 0,
      answeredQuestions: answers.length,
      scoredQuestions: gradedAnswers.length,
      demoQuestions: answers.filter((answer) => answer.provider !== "deepseek")
        .length,
      unjudgedQuestions: answers.filter(
        (answer) => answer.provider === "deepseek" && answer.score === null,
      ).length,
      completedInterviews,
      coveredTopics: new Set(answers.map((answer) => answer.contextPath)).size,
      summary: gradedAnswers.length
        ? (strongest?.label ?? "项目表达") +
          "表现相对稳定，下一阶段优先强化" +
          (weakest?.label ?? "工程化表达") +
          "。"
        : answers.length
          ? answers.some((answer) => answer.provider === "deepseek")
            ? "模型评价存在无法判断的维度，未生成可比较总分；请在复盘中查看证据缺口。"
            : "回答已保存，目前只有规则演示反馈；获得模型评价后生成能力评分。"
          : "完成一次项目面试后，这里会生成能力分析。",
      dimensions: dimensionResults,
      strengths: strengths.slice(0, 4),
      improvements: improvements.slice(0, 4),
      nextActions: (improvements.length
        ? improvements
        : [
            "结合真实文件说明一次技术取舍",
            "补充异常、加载和空状态的处理",
            "用数据解释一次性能优化过程",
          ]
      ).slice(0, 3),
      recentSessions: sessions.map((session) => {
        const graded = session.answers.filter(
          (answer): answer is typeof answer & { score: number } =>
            answer.provider === "deepseek" && answer.score !== null,
        );
        const average = graded.length
          ? graded.reduce((sum, answer) => sum + answer.score, 0) /
            graded.length
          : 0;
        return {
          id: session.id,
          projectName: session.projectName,
          status:
            session.status === InterviewStatus.COMPLETED
              ? "completed"
              : "in_progress",
          questionCount: session.answers.length,
          scoredQuestions: graded.length,
          averageScore: Number(average.toFixed(1)),
          startedAt: session.startedAt.toISOString(),
          completedAt: session.completedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async getInterviewDetail(interviewId: string, userId: string) {
    const interview = await this.prisma.interview.findFirst({
      where: { id: interviewId, userId },
      include: { answers: { orderBy: { questionNumber: "asc" } }, evaluationRuns: { select: { id: true, questionId: true } } },
    });
    if (!interview) throw new NotFoundException("找不到这次面试记录。");

    const graded = interview.answers.filter(
      (answer): answer is typeof answer & { score: number } =>
        answer.provider === "deepseek" && answer.score !== null,
    );
    const averageScore = graded.length
      ? Number(
          (
            graded.reduce((sum, answer) => sum + answer.score, 0) /
            graded.length
          ).toFixed(1),
        )
      : 0;

    return {
      id: interview.id,
      projectId: interview.projectId,
      projectName: interview.projectName,
      projectUrl: interview.projectUrl,
      jobDescription: interview.jobDescription,
      status:
        interview.status === InterviewStatus.COMPLETED
          ? "completed"
          : "in_progress",
      totalQuestions: interview.totalQuestions,
      averageScore,
      scoredQuestions: graded.length,
      demoQuestions: interview.answers.filter(
        (answer) => answer.provider !== "deepseek",
      ).length,
      unjudgedQuestions: interview.answers.filter(
        (answer) => answer.provider === "deepseek" && answer.score === null,
      ).length,
      startedAt: interview.startedAt.toISOString(),
      completedAt: interview.completedAt?.toISOString() ?? null,
      answers: interview.answers.map((answer) => ({
        runId: interview.evaluationRuns?.find(run => run.questionId === answer.questionId)?.id,
        questionNumber: answer.questionNumber,
        question: answer.questionPrompt,
        contextPath: answer.contextPath,
        dimension: dimensionFromDatabase[answer.dimension],
        difficulty: difficultyFromDatabase[answer.difficulty],
        answer: answer.answer,
        score: answer.score,
        strengths: this.parseList(answer.strengths),
        improvements: this.parseList(answer.improvements),
        provider: answer.provider,
        trace: this.restoreEvaluation(answer.evaluation)?.trace,
        rubric: this.restoreEvaluation(answer.evaluation)?.rubric,
        evidence: this.restoreEvaluation(answer.evaluation)?.evidence,
        scoring: this.restoreEvaluation(answer.evaluation)?.scoring,
        answeredAt: answer.answeredAt.toISOString(),
      })),
    };
  }

  private parseList(value: unknown) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private uniqueFeedback(items: string[]) {
    return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  }

  private dimensionFeedback(score: number, answerCount: number) {
    if (answerCount === 0) return "尚未覆盖，后续面试会继续采集信号";
    if (score >= 80) return "能够结合项目清晰解释实现和取舍";
    if (score >= 65) return "具备基础判断，继续补充边界和权衡";
    return "建议选择一个真实代码案例重新练习";
  }
}
