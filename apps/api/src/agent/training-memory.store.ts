import { Injectable } from "@nestjs/common";
import { Prisma, type EvaluationRun } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import type { InterviewEvaluation, Question } from "./interview.types";
import { CRITERIA, validateRubric } from "./rubric";
import type { EvidenceBundle } from "./rubric";

export const MEMORY_WINDOW = 40;
export async function saveTrainingMemory(
  tx: Prisma.TransactionClient,
  run: EvaluationRun & { interview: { userId: string } },
  evaluation: InterviewEvaluation,
  question: Question,
) {
  if (
    evaluation.provider !== "deepseek" ||
    !evaluation.rubric ||
    !evaluation.evidence
  )
    return;
  const rubric = validateRubric(evaluation.rubric, evaluation.evidence);
  if (!rubric) return;
  // Lock the user row against clear(). A pre-clear task must never repopulate memory.
  const allowed = await tx.user.updateMany({
    where: { id: run.interview.userId, memoryEpoch: run.memoryEpoch },
    data: { memoryEpoch: run.memoryEpoch },
  });
  if (!allowed.count) return;
  await tx.trainingMemory.createMany({
    data: rubric.criteria
      .filter((c) => c.score !== null && c.evidenceIds.length > 0)
      .map((c) => ({
        userId: run.interview.userId,
        projectId: evaluation.projectId,
        runId: run.id,
        criterion: c.key,
        dimension: question.dimension,
        score: c.score!,
        reason: c.reason,
        evidenceIds: c.evidenceIds,
      })),
    skipDuplicates: true,
  });
  const expired = await tx.trainingMemory.findMany({
    where: { userId: run.interview.userId, projectId: evaluation.projectId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: MEMORY_WINDOW,
    select: { id: true },
  });
  if (expired.length)
    await tx.trainingMemory.deleteMany({
      where: { id: { in: expired.map((item) => item.id) } },
    });
}

@Injectable()
export class TrainingMemoryStore {
  constructor(private readonly prisma: PrismaService) {}
  async get(projectId: string, userId: string) {
    const entries = await this.prisma.trainingMemory.findMany({
      where: { userId, projectId, run: { interview: { userId } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: MEMORY_WINDOW,
      include: {
        run: {
          select: { interviewId: true, questionNumber: true, evidence: true },
        },
      },
    });
    const observations = entries.map((entry) => {
      const evidence = entry.run.evidence as unknown as EvidenceBundle;
      const ids = Array.isArray(entry.evidenceIds) ? entry.evidenceIds : [];
      return {
        id: entry.id,
        criterion: entry.criterion,
        dimension: entry.dimension,
        label:
          CRITERIA.find((c) => c.key === entry.criterion)?.label ??
          entry.criterion,
        score: entry.score,
        reason: entry.reason,
        createdAt: entry.createdAt.toISOString(),
        source: {
          runId: entry.runId,
          interviewId: entry.run.interviewId,
          questionNumber: entry.run.questionNumber,
          commitSha: evidence?.commitSha ?? null,
          evidenceIds: ids,
          paths: [
            ...new Set(
              evidence?.items
                .filter((item) => ids.includes(item.id))
                .map((item) => item.path) ?? [],
            ),
          ],
        },
      };
    });
    // Different capability dimensions form separate practice histories. A later
    // strong observation closes the earlier weakness only in that same dimension.
    const latest = new Map<string, (typeof observations)[number]>();
    for (const item of observations) {
      const key = `${item.dimension}:${item.criterion}`;
      if (!latest.has(key)) latest.set(key, item);
    }
    return {
      projectId,
      window: MEMORY_WINDOW,
      observations,
      focus: [...latest.values()]
        .filter((item) => item.score < 3)
        .sort((a, b) => a.score - b.score)
        .slice(0, 3),
      practiced: [...latest.values()].filter((item) => item.score >= 3).length,
      note: "仅依据最近40条有证据的模型分项观察，不代表长期能力认证。清除会移除全部项目的训练记忆，影响未来新训练；当前题目与原始复盘保留。",
    };
  }
  async clear(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { memoryEpoch: { increment: 1 } },
      });
      const removed = await tx.trainingMemory.deleteMany({ where: { userId } });
      return { cleared: removed.count, historyRetained: true };
    });
  }
}
