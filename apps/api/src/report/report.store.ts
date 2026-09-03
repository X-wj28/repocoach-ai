import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { Question } from "../agent/agent.service";
import { DatabaseService } from "../database/database.service";

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

type AnswerRow = {
  dimension: Question["dimension"];
  score: number;
  strengths: string;
  improvements: string;
  context_path: string;
};

type SessionRow = {
  id: string;
  project_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  question_count: number;
  average_score: number | null;
};

type CountRow = { count: number };

type InterviewDetailRow = {
  id: string;
  project_id: string;
  project_name: string;
  project_url: string;
  job_description: string;
  status: string;
  total_questions: number;
  started_at: string;
  completed_at: string | null;
};

type AnswerDetailRow = {
  question_number: number;
  question_prompt: string;
  context_path: string;
  dimension: Question["dimension"];
  difficulty: Question["difficulty"];
  answer: string;
  score: number;
  strengths: string;
  improvements: string;
  provider: string;
  answered_at: string;
};

const dimensions = [
  { key: "react", label: "React 基础", color: "teal" },
  { key: "nextjs", label: "Next.js 应用", color: "blue" },
  { key: "engineering", label: "工程化", color: "amber" },
  { key: "performance", label: "性能意识", color: "rose" }
] as const;

@Injectable()
export class ReportStore {
  constructor(private readonly databaseService: DatabaseService) {}

  private get database() {
    return this.databaseService.connection;
  }

  createInterview(interview: InterviewRecord) {
    this.database.prepare(`
      INSERT INTO interviews (
        id, user_id, project_id, project_name, project_url, job_description,
        status, total_questions, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?)
    `).run(
      interview.id,
      interview.userId,
      interview.projectId,
      interview.projectName,
      interview.projectUrl,
      interview.jobDescription,
      interview.totalQuestions,
      new Date().toISOString()
    );
  }

  recordAnswer(input: {
    interviewId: string;
    questionNumber: number;
    question: Question;
    answer: string;
    evaluation: EvaluationRecord;
    completed: boolean;
  }) {
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO interview_answers (
        id, interview_id, question_number, question_id, question_prompt,
        context_path, dimension, difficulty, answer, score,
        strengths, improvements, provider, answered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.interviewId,
      input.questionNumber,
      input.question.id,
      input.question.prompt,
      input.question.contextPath,
      input.question.dimension,
      input.question.difficulty,
      input.answer,
      input.evaluation.score,
      JSON.stringify(input.evaluation.strengths),
      JSON.stringify(input.evaluation.improvements),
      input.evaluation.provider,
      now
    );

    if (input.completed) {
      this.database.prepare("UPDATE interviews SET status = 'completed', completed_at = ? WHERE id = ?")
        .run(now, input.interviewId);
    }
  }

  getProjectReport(projectId: string, userId: string) {
    const answers = this.database.prepare(`
      SELECT a.dimension, a.score, a.strengths, a.improvements, a.context_path
      FROM interview_answers a
      INNER JOIN interviews i ON i.id = a.interview_id
      WHERE i.project_id = ? AND i.user_id = ?
      ORDER BY a.answered_at DESC
    `).all(projectId, userId) as unknown as AnswerRow[];

    const sessions = this.database.prepare(`
      SELECT i.id, i.project_name, i.status, i.started_at, i.completed_at,
        COUNT(a.id) AS question_count, AVG(a.score) AS average_score
      FROM interviews i
      LEFT JOIN interview_answers a ON a.interview_id = i.id
      WHERE i.project_id = ? AND i.user_id = ?
      GROUP BY i.id
      ORDER BY i.started_at DESC
      LIMIT 6
    `).all(projectId, userId) as unknown as SessionRow[];
    const completedInterviews = this.database.prepare(`
      SELECT COUNT(*) AS count FROM interviews WHERE project_id = ? AND user_id = ? AND status = 'completed'
    `).get(projectId, userId) as unknown as CountRow;

    const dimensionResults = dimensions.map((dimension) => {
      const matching = answers.filter((answer) => answer.dimension === dimension.key);
      const score = matching.length
        ? Math.round((matching.reduce((sum, answer) => sum + answer.score, 0) / matching.length) * 10)
        : 0;
      return { ...dimension, score, answerCount: matching.length, feedback: this.dimensionFeedback(score, matching.length) };
    });

    const readinessScore = answers.length
      ? Math.round((answers.reduce((sum, answer) => sum + answer.score, 0) / answers.length) * 10)
      : 0;
    const strengths = this.uniqueFeedback(answers.flatMap((answer) => this.parseList(answer.strengths)));
    const improvements = this.uniqueFeedback(answers.flatMap((answer) => this.parseList(answer.improvements)));
    const measured = dimensionResults.filter((dimension) => dimension.answerCount > 0);
    const weakest = [...measured].sort((a, b) => a.score - b.score)[0];
    const strongest = [...measured].sort((a, b) => b.score - a.score)[0];

    return {
      projectId,
      hasData: answers.length > 0,
      readinessScore,
      averageScore: answers.length ? Number((readinessScore / 10).toFixed(1)) : 0,
      answeredQuestions: answers.length,
      completedInterviews: Number(completedInterviews.count),
      coveredTopics: new Set(answers.map((answer) => answer.context_path)).size,
      summary: answers.length
        ? `${strongest?.label ?? "项目表达"}表现相对稳定，下一阶段优先强化${weakest?.label ?? "工程化表达"}。`
        : "完成一次项目面试后，这里会生成真实能力分析。",
      dimensions: dimensionResults,
      strengths: strengths.slice(0, 4),
      improvements: improvements.slice(0, 4),
      nextActions: (improvements.length ? improvements : [
        "结合真实文件说明一次技术取舍",
        "补充异常、加载和空状态的处理",
        "用数据解释一次性能优化过程"
      ]).slice(0, 3),
      recentSessions: sessions.map((session) => ({
        id: session.id,
        projectName: session.project_name,
        status: session.status,
        questionCount: Number(session.question_count),
        averageScore: session.average_score === null ? 0 : Number(session.average_score.toFixed(1)),
        startedAt: session.started_at,
        completedAt: session.completed_at
      }))
    };
  }

  getInterviewDetail(interviewId: string, userId: string) {
    const interview = this.database.prepare(`
      SELECT id, project_id, project_name, project_url, job_description, status,
        total_questions, started_at, completed_at
      FROM interviews WHERE id = ? AND user_id = ?
    `).get(interviewId, userId) as unknown as InterviewDetailRow | undefined;
    if (!interview) throw new NotFoundException("找不到这次面试记录。");

    const answers = this.database.prepare(`
      SELECT question_number, question_prompt, context_path, dimension, difficulty,
        answer, score, strengths, improvements, provider, answered_at
      FROM interview_answers
      WHERE interview_id = ?
      ORDER BY question_number ASC
    `).all(interviewId) as unknown as AnswerDetailRow[];
    const averageScore = answers.length
      ? Number((answers.reduce((sum, answer) => sum + answer.score, 0) / answers.length).toFixed(1))
      : 0;

    return {
      id: interview.id,
      projectId: interview.project_id,
      projectName: interview.project_name,
      projectUrl: interview.project_url,
      jobDescription: interview.job_description,
      status: interview.status,
      totalQuestions: Number(interview.total_questions),
      averageScore,
      startedAt: interview.started_at,
      completedAt: interview.completed_at,
      answers: answers.map((answer) => ({
        questionNumber: Number(answer.question_number),
        question: answer.question_prompt,
        contextPath: answer.context_path,
        dimension: answer.dimension,
        difficulty: answer.difficulty,
        answer: answer.answer,
        score: Number(answer.score),
        strengths: this.parseList(answer.strengths),
        improvements: this.parseList(answer.improvements),
        provider: answer.provider,
        answeredAt: answer.answered_at
      }))
    };
  }

  private parseList(value: string) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
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
