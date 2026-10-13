import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export const RUN_EVENT_TYPES = [
  "run.created",
  "run.snapshot",
  "run.retried",
  "run.failed",
  "evidence.started",
  "model.started",
  "model.finished",
  "tool.started",
  "tool.finished",
  "evidence.selected",
  "evaluation.started",
  "evaluation.finished",
] as const;
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];
export type RunEventPayload = Record<
  string,
  string | number | boolean | null | string[]
>;

export function parseEventCursor(value?: string): number {
  if (!value) return 0;
  if (!/^(0|[1-9]\d{0,9})$/.test(value))
    throw new BadRequestException("事件游标无效。");
  const cursor = Number(value);
  if (cursor > 2147483647) throw new BadRequestException("事件游标无效。");
  return cursor;
}

// Must run inside the SAME transaction as the state change. The run row's
// increment serializes writers, and rollbacks never consume a sequence number.
export async function appendRunEvent(
  tx: Prisma.TransactionClient,
  runId: string,
  type: RunEventType,
  payload: RunEventPayload,
) {
  const run = await tx.evaluationRun.update({
    where: { id: runId },
    data: { lastEventSeq: { increment: 1 } },
    select: { lastEventSeq: true },
  });
  return tx.evaluationEvent.create({
    data: { runId, sequence: run.lastEventSeq, type, payload },
  });
}
