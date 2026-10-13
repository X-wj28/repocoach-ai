import { randomUUID } from "node:crypto";
import type { ProjectContext, GitHubService } from "../github/github.service";
import type { DeepSeekService, LlmMessage } from "../llm/deepseek.service";
import { EvidenceToolSession, evidenceTools } from "./evidence-tools";
import type { EvidenceTrace } from "./interview.types";
import type { RunEventType, RunEventPayload } from "./evaluation-events";

export const EVIDENCE_LIMITS = {
  modelCalls: 4,
  toolCalls: 6,
  durationMs: 45000,
};

export class EvidenceRuntime {
  constructor(
    private readonly model: Pick<DeepSeekService, "complete">,
    private readonly github: Pick<GitHubService, "readSnapshotFile">,
  ) {}

  async run(
    project: ProjectContext,
    messages: LlmMessage[],
    budgetMs = EVIDENCE_LIMITS.durationMs,
    onProgress?: (
      type: RunEventType,
      payload: RunEventPayload,
    ) => Promise<void>,
  ) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(budgetMs, EVIDENCE_LIMITS.durationMs),
    );
    const session = new EvidenceToolSession(
      project,
      this.github,
      controller.signal,
    );
    const conversation = structuredClone(messages);
    const trace: EvidenceTrace = {
      runId: `run-${randomUUID()}`,
      snapshot: project.commitSha ? "pinned" : "legacy",
      ...(project.commitSha ? { commitSha: project.commitSha } : {}),
      outcome: "provider-error",
      durationMs: 0,
      modelCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      filesRead: [],
      tools: session.records,
    };
    let content: string | null = null;
    let toolCount = 0;
    let budgetReached = false;
    let progressFailed = false;
    const progress = async (type: RunEventType, payload: RunEventPayload) => {
      try {
        await onProgress?.(type, payload);
      } catch (error) {
        progressFailed = true;
        throw error;
      }
    };
    try {
      for (let round = 0; round < EVIDENCE_LIMITS.modelCalls; round += 1) {
        if (controller.signal.aborted) {
          trace.outcome = "budget-exhausted";
          break;
        }
        const finalRound =
          round === EVIDENCE_LIMITS.modelCalls - 1 || budgetReached;
        if (finalRound)
          conversation.push({
            role: "user",
            content:
              "这是最后一次模型请求。不得继续调用工具；只返回系统要求的最终 JSON。证据不足不能证明整个仓库不存在实现。",
          });
        trace.modelCalls += 1;
        await progress("model.started", { call: trace.modelCalls });
        const result = await this.model.complete(conversation, {
          tools: evidenceTools,
          toolChoice: finalRound ? "none" : "auto",
          jsonOutput: finalRound,
          temperature: 0.2,
          maxTokens: 1800,
          signal: controller.signal,
        });
        if (!result) break;
        await progress("model.finished", {
          call: trace.modelCalls,
          toolRequests: result.toolCalls?.length ?? 0,
        });
        trace.promptTokens += Number.isFinite(result.usage?.prompt_tokens)
          ? result.usage!.prompt_tokens!
          : 0;
        trace.completionTokens += Number.isFinite(
          result.usage?.completion_tokens,
        )
          ? result.usage!.completion_tokens!
          : 0;
        if (!result.toolCalls?.length) {
          content = result.content;
          trace.outcome = content.trim() ? "completed" : "invalid-output";
          break;
        }
        // A provider ignoring tool_choice=none never authorizes more tool execution.
        if (finalRound) {
          trace.outcome = "budget-exhausted";
          break;
        }
        conversation.push({
          role: "assistant",
          content: result.content || null,
          tool_calls: result.toolCalls,
          ...(result.reasoningContent
            ? { reasoning_content: result.reasoningContent }
            : {}),
        });
        for (const call of result.toolCalls) {
          const name = evidenceTools.some(
            (tool) => tool.function.name === call.function.name,
          )
            ? call.function.name
            : "unrecognized";
          await progress("tool.started", { name, step: toolCount + 1 });
          if (toolCount >= EVIDENCE_LIMITS.toolCalls)
            session.records.push({
              name: call.function.name,
              status: "tool-budget",
              durationMs: 0,
              outputCharacters: 0,
            });
          const observation =
            toolCount < EVIDENCE_LIMITS.toolCalls
              ? await session.execute(call)
              : JSON.stringify({
                  status: "tool-budget",
                  reason: "No further tool executions are authorized.",
                });
          toolCount += 1;
          const record = session.records.at(-1);
          await progress("tool.finished", {
            name,
            step: toolCount,
            status: record?.status ?? "unknown",
            path: record?.path?.slice(0, 240) ?? "",
            durationMs: record?.durationMs ?? 0,
          });
          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            content: observation,
          });
        }
        budgetReached = toolCount >= EVIDENCE_LIMITS.toolCalls;
        if (budgetReached)
          conversation.push({
            role: "user",
            content:
              "检索预算已用尽。根据已有证据返回系统要求的最终 JSON，不再调用工具。",
          });
      }
    } catch (error) {
      if (progressFailed) throw error;
      trace.outcome = controller.signal.aborted
        ? "budget-exhausted"
        : "provider-error";
    } finally {
      clearTimeout(timer);
      trace.durationMs = Date.now() - started;
      trace.filesRead = [...session.filesRead];
    }
    return {
      content,
      project: session.project,
      trace,
      excerpts: session.excerpts,
    };
  }
}
