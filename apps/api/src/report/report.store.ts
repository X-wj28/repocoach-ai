import { Injectable, NotFoundException } from "@nestjs/common";
import {
  InterviewDifficulty,
  InterviewDimension,
  InterviewStatus,
} from "@prisma/client";
import type { Question } from "../agent/agent.service";
import { PrismaService } from "../database/prisma.service";

type EvaluationRecord = {
  score: number;
  strengths: string[];
  improvements: string[];
  provider: string;
};

type InterviewRecord = {
  id: string;
  userId: string;
  projectId: string;
  projectName: string;
  projectUrl: string;
  jobDescription: string;
  totalQuestions: number;
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
      },
    });
  }

  async recordAnswer(input: {
    interviewId: string;
    questionNumber: number;
    question: Question;
    answer: string;
    evaluation: EvaluationRecord;
    completed: boolean;
  }) {
    await this.prisma.interviewAnswer.create({
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
      },
    });

    if (input.completed) {
      await this.prisma.interview.update({
        where: { id: input.interviewId },
        data: { status: InterviewStatus.COMPLETED, completedAt: new Date() },
      });
    }
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
        },
      }),
      this.prisma.interview.findMany({
        where: { projectId, userId },
        orderBy: { startedAt: "desc" },
        take: 6,
        include: { answers: { select: { score: true } } },
      }),
      this.prisma.interview.count({
        where: { projectId, userId, status: InterviewStatus.COMPLETED },
      }),
    ]);

    const answers = databaseAnswers.map((answer) => ({
      ...answer,
      dimension: dimensionFromDatabase[answer.dimension],
    }));
    const dimensionResults = dimensions.map((dimension) => {
      const matching = answers.filter(
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

    const readinessScore = answers.length
      ? Math.round(
          (answers.reduce((sum, answer) => sum + answer.score, 0) /
            answers.length) *
            10,
        )
      : 0;
    const strengths = this.uniqueFeedback(
      answers.flatMap((answer) => this.parseList(answer.strengths)),
    );
    const improvements = this.uniqueFeedback(
      answers.flatMap((answer) => this.parseList(answer.improvements)),
    );
    const measured = dimensionResults.filter(
      (dimension) => dimension.answerCount > 0,
    );
    const weakest = [...measured].sort((a, b) => a.score - b.score)[0];
    const strongest = [...measured].sort((a, b) => b.score - a.score)[0];

    return {
      projectId,
      hasData: answers.length > 0,
      readinessScore,
      averageScore: answers.length
        ? Number((readinessScore / 10).toFixed(1))
        : 0,
      answeredQuestions: answers.length,
      completedInterviews,
      coveredTopics: new Set(answers.map((answer) => answer.contextPath)).size,
      summary: answers.length
        ? (strongest?.label ?? "项目表达") +
          "表现相对稳定，下一阶段优先强化" +
          (weakest?.label ?? "工程化表达") +
          "。"
        : "完成一次项目面试后，这里会生成真实能力分析。",
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
        const average = session.answers.length
          ? session.answers.reduce((sum, answer) => sum + answer.score, 0) /
            session.answers.length
          : 0;
        return {
          id: session.id,
          projectName: session.projectName,
          status:
            session.status === InterviewStatus.COMPLETED
              ? "completed"
              : "in_progress",
          questionCount: session.answers.length,
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
      include: { answers: { orderBy: { questionNumber: "asc" } } },
    });
    if (!interview) throw new NotFoundException("找不到这次面试记录。");

    const averageScore = interview.answers.length
      ? Number(
          (
            interview.answers.reduce((sum, answer) => sum + answer.score, 0) /
            interview.answers.length
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
      startedAt: interview.startedAt.toISOString(),
      completedAt: interview.completedAt?.toISOString() ?? null,
      answers: interview.answers.map((answer) => ({
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
