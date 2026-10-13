import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  EvaluationRunStatus as Status,
  InterviewStatus,
  Prisma,
  type EvaluationRun,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { ReportStore } from "../report/report.store";
import { restoreProjectContext } from "./interview-planner";
import { isValidQuestion } from "../llm/agent-prompts";
import { RUBRIC_VERSION, SCORING_PROMPT_VERSION } from "./rubric";
import type { EvidenceBundle } from "./rubric";
import type { ProjectContext } from "../github/github.service";
import { GitHubService } from "../github/github.service";
import {
  appendRunEvent,
  type RunEventType,
  type RunEventPayload,
} from "./evaluation-events";
import { saveTrainingMemory } from "./training-memory.store";
import type {
  Question,
  InterviewEvaluation,
  EvidenceTrace,
} from "./interview.types";

export const MAX_STAGE_ATTEMPTS = 3;
const LEASE_MS = 90000;
export class LeaseLostError extends Error {}
export const RUN_VIEW_SELECT = {
  id: true,
  interviewId: true,
  questionId: true,
  answer: true,
  status: true,
  evidenceAttempts: true,
  scoringAttempts: true,
  failureCode: true,
  evaluation: true,
  lastEventSeq: true,
} satisfies Prisma.EvaluationRunSelect;
type PublicRun = Prisma.EvaluationRunGetPayload<{
  select: typeof RUN_VIEW_SELECT;
}>;
export function runView(run: PublicRun) {
  const phase = run.status.startsWith("EVIDENCE")
    ? "evidence"
    : run.status === Status.COMPLETED
      ? "completed"
      : "scoring";
  const status = run.status.endsWith("FAILED")
    ? "failed"
    : run.status.endsWith("PENDING")
      ? "pending"
      : run.status === Status.COMPLETED
        ? "completed"
        : "running";
  return {
    id: run.id,
    interviewId: run.interviewId,
    questionId: run.questionId,
    answer: run.answer,
    phase,
    status,
    retryable:
      status === "failed" &&
      (phase === "evidence" ? run.evidenceAttempts : run.scoringAttempts) <
        MAX_STAGE_ATTEMPTS,
    attempts: { evidence: run.evidenceAttempts, scoring: run.scoringAttempts },
    failureCode: run.failureCode,
    evaluation: run.evaluation as unknown as InterviewEvaluation | null,
    lastEventSeq: run.lastEventSeq,
  };
}

@Injectable()
export class EvaluationStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportStore,
    @Optional() private readonly github?: GitHubService,
  ) {}

  async submit(
    interviewId: string,
    userId: string,
    questionId: string,
    answer: string,
    model: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const interview = await tx.interview.findFirst({
        where: { id: interviewId, userId },
      });
      if (!interview) throw new NotFoundException("找不到这次训练。");
      const existing = await tx.evaluationRun.findFirst({
        where: { interviewId, questionId },
      });
      if (existing) {
        if (existing.answer !== answer)
          throw new ConflictException(
            "回答已保存，不能改写。请查看当前评价状态。",
          );
        return runView(existing);
      }
      const legacy = await this.reports.getRecordedAnswer(
        interviewId,
        userId,
        questionId,
      );
      if (legacy) {
        if (legacy.answer !== answer || !legacy.evaluation)
          throw new ConflictException("这道题已提交。");
        return {
          id: "legacy",
          interviewId,
          questionId,
          answer,
          phase: "completed",
          status: "completed",
          retryable: false,
          attempts: { evidence: 0, scoring: 0 },
          failureCode: null,
          evaluation: legacy.evaluation,
          lastEventSeq: 0,
        };
      }
      if (
        !Array.isArray(interview.questions) ||
        !interview.questions.every(
          (q) => isValidQuestion(q) && typeof q.id === "string",
        )
      )
        throw new ConflictException("题目无法恢复，请开始新的训练。");
      const questions = interview.questions as unknown as Question[];
      if (
        interview.status !== InterviewStatus.IN_PROGRESS ||
        questions[interview.currentQuestion]?.id !== questionId
      )
        throw new ConflictException("题目已更新，请刷新进度。");
      const project =
        restoreProjectContext(interview.projectContext) ??
        (await this.github?.getProjectContext(interview.projectId));
      if (!project)
        throw new ConflictException("训练缺少代码上下文，请重新开始。");
      // Lock the interview row before checking/creating the unique turn draft.
      const locked = await tx.interview.updateMany({
        where: {
          id: interviewId,
          userId,
          currentQuestion: interview.currentQuestion,
          status: InterviewStatus.IN_PROGRESS,
        },
        data: { currentQuestion: interview.currentQuestion },
      });
      if (!locked.count)
        throw new ConflictException("题目已更新，请刷新进度。");
      const winner = await tx.evaluationRun.findUnique({
        where: {
          interviewId_questionNumber: {
            interviewId,
            questionNumber: interview.currentQuestion + 1,
          },
        },
      });
      if (winner) {
        if (winner.questionId !== questionId || winner.answer !== answer)
          throw new ConflictException("这道题已有保存的回答。");
        return runView(winner);
      }
      const run = await tx.evaluationRun.create({
        data: {
          interviewId,
          questionNumber: interview.currentQuestion + 1,
          questionId,
          answer,
          questions: interview.questions,
          projectContext: project as unknown as Prisma.InputJsonValue,
          model,
          rubricVersion: RUBRIC_VERSION,
          promptVersion: SCORING_PROMPT_VERSION,
          memoryEpoch: (
            await tx.user.findUniqueOrThrow({
              where: { id: userId },
              select: { memoryEpoch: true },
            })
          ).memoryEpoch,
        },
      });
      await appendRunEvent(tx, run.id, "run.created", {
        questionNumber: run.questionNumber,
      });
      return runView({ ...run, lastEventSeq: 1 });
    });
  }

  async get(id: string, userId: string) {
    const run = await this.prisma.evaluationRun.findFirst({
      where: { id, interview: { userId } },
    });
    if (!run) throw new NotFoundException("找不到这次评价。");
    return runView(run);
  }

  async active(interviewId: string, userId: string, questionId: string) {
    const run = await this.prisma.evaluationRun.findFirst({
      where: { interviewId, questionId, interview: { userId } },
    });
    return run ? runView(run) : null;
  }

  async retry(id: string, userId: string) {
    const run = await this.prisma.evaluationRun.findFirst({
      where: { id, interview: { userId } },
    });
    if (!run) throw new NotFoundException("找不到这次评价。");
    if (run.status === Status.COMPLETED) return runView(run);
    if (!runView(run).retryable)
      throw new ConflictException("评价正在运行，或已达到本阶段三次尝试上限。");
    const status =
      run.status === Status.EVIDENCE_FAILED
        ? Status.EVIDENCE_PENDING
        : Status.SCORING_PENDING;
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.evaluationRun.updateMany({
        where: { id, status: run.status, updatedAt: run.updatedAt },
        data: { status, failureCode: null },
      });
      if (!result.count)
        throw new ConflictException("评价状态已更新，请刷新。");
      await appendRunEvent(tx, id, "run.retried", {
        phase: status === Status.EVIDENCE_PENDING ? "evidence" : "scoring",
      });
    });
    return this.get(id, userId);
  }

  async claim() {
    const now = new Date();
    const eligible: Prisma.EvaluationRunWhereInput = {
      OR: [
        { status: { in: [Status.EVIDENCE_PENDING, Status.SCORING_PENDING] } },
        {
          status: { in: [Status.EVIDENCE_RUNNING, Status.SCORING_RUNNING] },
          leaseExpiresAt: { lte: now },
        },
      ],
    };
    const candidates = await this.prisma.evaluationRun.findMany({
      where: eligible,
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    for (const candidate of candidates) {
      const evidence = candidate.status.startsWith("EVIDENCE");
      const attempts = evidence
        ? candidate.evidenceAttempts
        : candidate.scoringAttempts;
      if (attempts >= MAX_STAGE_ATTEMPTS) {
        await this.prisma.$transaction(async (tx) => {
          const fenced = await tx.evaluationRun.updateMany({
            where: {
              id: candidate.id,
              status: candidate.status,
              updatedAt: candidate.updatedAt,
              ...eligible,
            },
            data: {
              status: evidence ? Status.EVIDENCE_FAILED : Status.SCORING_FAILED,
              failureCode: "ATTEMPT_LIMIT",
              leaseToken: null,
              leaseExpiresAt: null,
            },
          });
          if (fenced.count)
            await appendRunEvent(tx, candidate.id, "run.failed", {
              phase: evidence ? "evidence" : "scoring",
              failureCode: "ATTEMPT_LIMIT",
            });
        });
        continue;
      }
      const leaseToken = randomUUID();
      const claimed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.evaluationRun.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status,
            updatedAt: candidate.updatedAt,
            ...eligible,
          },
          data: {
            status: evidence ? Status.EVIDENCE_RUNNING : Status.SCORING_RUNNING,
            leaseToken,
            leaseExpiresAt: new Date(Date.now() + LEASE_MS),
            failureCode: null,
            ...(evidence
              ? { evidenceAttempts: { increment: 1 } }
              : { scoringAttempts: { increment: 1 } }),
          },
        });
        if (updated.count)
          await appendRunEvent(
            tx,
            candidate.id,
            evidence ? "evidence.started" : "evaluation.started",
            {
              attempt: attempts + 1,
              recovered: candidate.status.endsWith("RUNNING"),
            },
          );
        return updated;
      });
      if (!claimed.count) continue;
      const run = await this.prisma.evaluationRun.findUniqueOrThrow({
        where: { id: candidate.id },
        include: {
          interview: {
            select: { userId: true, projectId: true, jobDescription: true },
          },
        },
      });
      return run;
    }
    return null;
  }

  private ownedLease(run: EvaluationRun): Prisma.EvaluationRunWhereInput {
    // Tokens and expiry fence workers even when a previous stage ran twice.
    return {
      id: run.id,
      status: run.status,
      leaseToken: run.leaseToken,
      leaseExpiresAt: { gt: new Date() },
    };
  }

  async nextLeaseDelay() {
    // claim() may have fenced a full batch of exhausted leases. Keep draining
    // pending turns beyond that batch without relying on a browser poll.
    const pending = await this.prisma.evaluationRun.findFirst({
      where: {
        status: { in: [Status.EVIDENCE_PENDING, Status.SCORING_PENDING] },
      },
      select: { id: true },
    });
    if (pending) return 50;
    const running = await this.prisma.evaluationRun.findFirst({
      where: {
        status: { in: [Status.EVIDENCE_RUNNING, Status.SCORING_RUNNING] },
        leaseExpiresAt: { not: null },
      },
      orderBy: { leaseExpiresAt: "asc" },
      select: { leaseExpiresAt: true },
    });
    return running?.leaseExpiresAt
      ? Math.max(
          250,
          Math.min(90000, running.leaseExpiresAt.getTime() - Date.now() + 100),
        )
      : undefined;
  }

  async checkpointEvidence(
    run: EvaluationRun,
    project: ProjectContext,
    evidence: EvidenceBundle,
    trace: EvidenceTrace | undefined,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.evaluationRun.updateMany({
        where: this.ownedLease(run),
        data: {
          status: Status.SCORING_PENDING,
          projectContext: project as unknown as Prisma.InputJsonValue,
          evidence: evidence as unknown as Prisma.InputJsonValue,
          ...(trace
            ? { trace: trace as unknown as Prisma.InputJsonValue }
            : {}),
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      if (!updated.count) throw new LeaseLostError();
      await appendRunEvent(tx, run.id, "evidence.selected", {
        count: evidence.items.length,
        files: [...new Set(evidence.items.map((item) => item.path))],
        commitSha: evidence.commitSha ?? "legacy",
      });
    });
  }

  async fail(run: EvaluationRun, failureCode: string) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.evaluationRun.updateMany({
        where: this.ownedLease(run),
        data: {
          status: run.status.startsWith("EVIDENCE")
            ? Status.EVIDENCE_FAILED
            : Status.SCORING_FAILED,
          failureCode,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      if (!updated.count) throw new LeaseLostError();
      await appendRunEvent(tx, run.id, "run.failed", {
        phase: run.status.startsWith("EVIDENCE") ? "evidence" : "scoring",
        failureCode,
      });
    });
  }

  async progress(
    run: EvaluationRun,
    type: RunEventType,
    payload: RunEventPayload,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const owned = await tx.evaluationRun.updateMany({
        where: this.ownedLease(run),
        data: { failureCode: null },
      });
      if (!owned.count) throw new LeaseLostError();
      await appendRunEvent(tx, run.id, type, payload);
    });
  }

  async complete(
    run: EvaluationRun & { interview: { userId: string } },
    evaluation: InterviewEvaluation,
    questions: Question[],
    project: ProjectContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.evaluationRun.updateMany({
        where: this.ownedLease(run),
        data: {
          status: Status.COMPLETED,
          evaluation: evaluation as unknown as Prisma.InputJsonValue,
          failureCode: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      if (!updated.count) throw new LeaseLostError();
      const committed = await this.reports.recordAnswer(
        {
          interviewId: run.interviewId,
          userId: run.interview.userId,
          questionNumber: run.questionNumber,
          question: questions[run.questionNumber - 1],
          answer: run.answer,
          evaluation,
          completed: evaluation.completed,
          questions,
          projectContext: project,
        },
        tx,
      );
      // recordAnswer can replay a winner from a legacy caller; preserve its actual committed response.
      await tx.evaluationRun.update({
        where: { id: run.id },
        data: { evaluation: committed as unknown as Prisma.InputJsonValue },
      });
      await saveTrainingMemory(
        tx,
        run,
        committed,
        questions[run.questionNumber - 1],
      );
      await appendRunEvent(tx, run.id, "evaluation.finished", {
        score: committed.score,
        provider: committed.provider,
      });
      return committed;
    });
  }
}
