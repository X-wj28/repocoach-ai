import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { PrismaService } from "../database/prisma.service";
import { runView, RUN_VIEW_SELECT } from "./evaluation.store";
import { AuthService } from "../auth/auth.service";

export function sseFrame(event: string, data: unknown, id?: number) {
  return `${id === undefined ? "" : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

@Injectable()
export class EvaluationStreamService {
  private readonly connections = new Map<string, number>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}
  async list(runId: string, userId: string, after: number) {
    const run = await this.prisma.evaluationRun.findFirst({
      where: { id: runId, interview: { userId } },
      select: RUN_VIEW_SELECT,
    });
    if (!run) throw new NotFoundException("找不到这次评价。");
    if (after > run.lastEventSeq)
      throw new BadRequestException("事件游标超出当前记录。");
    // Bind the page to the state's observed upper bound: a concurrent commit
    // must not make this response mix new events with an older status snapshot.
    const events = await this.prisma.evaluationEvent.findMany({
      where: { runId, sequence: { gt: after, lte: run.lastEventSeq } },
      orderBy: { sequence: "asc" },
      take: 100,
      select: { sequence: true, type: true, payload: true, createdAt: true },
    });
    const next = events.at(-1)?.sequence ?? after;
    return {
      run: runView(run),
      events,
      next,
      hasMore: next < run.lastEventSeq,
    };
  }

  async serve(
    runId: string,
    userId: string,
    after: number,
    response: ServerResponse,
    sessionToken: string,
  ) {
    // Authenticate and validate before sending 200/stream headers.
    let page = await this.list(runId, userId, after);
    if (response.destroyed) return;
    const count = this.connections.get(userId) ?? 0;
    if (
      count >= 3 ||
      [...this.connections.values()].reduce((a, b) => a + b, 0) >= 200
    )
      throw new HttpException("实时连接过多，请关闭其他训练页面。", 429);
    this.connections.set(userId, count + 1);
    const abort = new AbortController();
    const close = () => abort.abort();
    response.on("close", close);
    const started = Date.now();
    const lifetime = setTimeout(() => abort.abort(), 150000);
    let heartbeatAt = started;
    let authorizedAt = started;
    let seenState = -1;
    const write = async (frame: string) => {
      if (abort.signal.aborted || response.destroyed) return;
      if (!response.write(frame))
        await new Promise<void>((resolve) => {
          const done = () => {
            response.off("drain", done);
            abort.signal.removeEventListener("abort", done);
            resolve();
          };
          response.once("drain", done);
          abort.signal.addEventListener("abort", done, { once: true });
          if (abort.signal.aborted) done();
        });
    };
    const wait = () =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          abort.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, 750);
        abort.signal.addEventListener("abort", done, { once: true });
        if (abort.signal.aborted) done();
      });
    try {
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-store, no-transform");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();
      await write("retry: 1500\n: connected\n\n");
      while (!abort.signal.aborted && Date.now() - started < 150000) {
        if (Date.now() - authorizedAt >= 5000) {
          const user = await this.auth.findByToken(sessionToken);
          if (!user || user.id !== userId) break;
          authorizedAt = Date.now();
        }
        for (const event of page.events) {
          if (abort.signal.aborted) break;
          await write(sseFrame("evaluation-event", event, event.sequence));
          after = event.sequence;
        }
        if (!page.hasMore) {
          if (seenState !== page.run.lastEventSeq) {
            await write(sseFrame("run-state", page.run));
            seenState = page.run.lastEventSeq;
          }
          if (page.run.status === "completed" || page.run.status === "failed")
            break;
          if (Date.now() - heartbeatAt >= 15000) {
            await write(": heartbeat\n\n");
            heartbeatAt = Date.now();
          }
          await wait();
        }
        if (!abort.signal.aborted) page = await this.list(runId, userId, after);
      }
    } catch {
      // A database/network fault closes the stream. EventSource reconnects using
      // Last-Event-ID; no synthetic success or new cursor is emitted.
    } finally {
      clearTimeout(lifetime);
      response.off("close", close);
      const remaining = (this.connections.get(userId) ?? 1) - 1;
      if (remaining) this.connections.set(userId, remaining);
      else this.connections.delete(userId);
      abort.abort();
      if (!response.destroyed) response.end();
    }
  }
}
