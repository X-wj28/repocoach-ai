import { Injectable } from "@nestjs/common";
import { DeepSeekService } from "../llm/deepseek.service";
import { isValidQuestion, parseJsonResponse } from "../llm/agent-prompts";
import { RUBRIC_SYSTEM_PROMPT, validateRubric } from "./rubric";
import type { EvidenceBundle } from "./rubric";
import type { Question } from "./interview.types";

export class ScoringFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
@Injectable()
export class RubricScorer {
  constructor(private readonly model: DeepSeekService) {}

  async score(
    input: {
      answer: string;
      question: Question;
      next?: Question;
      jobDescription: string;
      evidence: EvidenceBundle;
      model: string;
    },
    signal?: AbortSignal,
  ) {
    if (!this.model.enabled) throw new ScoringFailure("MODEL_UNAVAILABLE");
    if (input.model !== this.model.modelId)
      throw new ScoringFailure("MODEL_CONFIG_CHANGED");
    const started = Date.now();
    let result;
    try {
      result = await this.model.complete(
        [
          { role: "system", content: RUBRIC_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              question: input.question.prompt,
              answer: input.answer,
              jobDescription: input.jobDescription,
              evidence: input.evidence,
              next: input.next
                ? {
                    dimension: input.next.dimension,
                    candidate: input.next.prompt,
                  }
                : "最后一题，不生成追问",
            }),
          },
        ],
        {
          jsonOutput: true,
          temperature: 0.15,
          maxTokens: 2500,
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
            : AbortSignal.timeout(25000),
        },
      );
    } catch {
      throw new ScoringFailure("SCORER_TRANSPORT_ERROR");
    }
    const parsed = result?.content
      ? parseJsonResponse<Record<string, unknown>>(result.content)
      : null;
    const rubric = validateRubric(parsed, input.evidence);
    if (!rubric) throw new ScoringFailure("INVALID_RUBRIC_OR_REFERENCE");
    const candidate = parsed?.nextQuestion;
    const next =
      input.next &&
      isValidQuestion(candidate) &&
      input.evidence.items.some((item) => item.path === candidate.contextPath)
        ? candidate
        : undefined;
    return {
      rubric,
      next,
      scoring: {
        model: input.model,
        durationMs: Date.now() - started,
        promptTokens: result?.usage?.prompt_tokens ?? 0,
        completionTokens: result?.usage?.completion_tokens ?? 0,
      },
    };
  }
}
