import { BadGatewayException, Injectable } from "@nestjs/common";
import { Dispatcher, ProxyAgent } from "undici";

export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
};

export type LlmToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type LlmTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

@Injectable()
export class DeepSeekService {
  private readonly baseUrl = (
    process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"
  ).replace(/\/$/, "");
  private readonly model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  private readonly apiKey = process.env.DEEPSEEK_API_KEY;
  private readonly timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 20000);
  private readonly dispatcher?: Dispatcher;

  constructor() {
    const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
    if (proxyUrl) this.dispatcher = new ProxyAgent(proxyUrl);
  }

  get enabled() {
    return Boolean(this.apiKey);
  }

  get modelId() {
    return this.model;
  }

  async complete(
    messages: LlmMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: LlmTool[];
      toolChoice?: "auto" | "none";
      jsonOutput?: boolean;
      signal?: AbortSignal;
    },
  ) {
    if (!this.apiKey) return null;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number.isFinite(this.timeoutMs) && this.timeoutMs > 0
        ? this.timeoutMs
        : 20000,
    );

    const init: RequestInit & { dispatcher?: Dispatcher } = {
      method: "POST",
      signal: options?.signal
        ? AbortSignal.any([controller.signal, options.signal])
        : controller.signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options?.temperature ?? 0.35,
        max_tokens: options?.maxTokens ?? 900,
        stream: false,
        ...(options?.jsonOutput
          ? { response_format: { type: "json_object" } }
          : {}),
        ...(options?.tools || options?.jsonOutput
          ? { thinking: { type: "disabled" } }
          : {}),
        ...(options?.tools
          ? {
              tools: options.tools,
              tool_choice: options.toolChoice ?? "auto",
            }
          : {}),
      }),
    };
    if (this.dispatcher) init.dispatcher = this.dispatcher;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, init);
      if (!response.ok) {
        throw new BadGatewayException(
          `DeepSeek API 请求失败（${response.status}）。`,
        );
      }
      const payload = (await response.json()) as {
        choices?: Array<{
          finish_reason?: string;
          message?: {
            content?: string | null;
            tool_calls?: unknown;
            reasoning_content?: string;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = payload.choices?.[0];
      const message = choice?.message;
      const content = message?.content;
      const rawCalls = message?.tool_calls;
      if (choice?.finish_reason === "length")
        throw new BadGatewayException("DeepSeek 输出达到长度限制。");
      let toolCalls: LlmToolCall[] | undefined;
      if (rawCalls !== undefined && rawCalls !== null) {
        if (
          !options?.tools ||
          !Array.isArray(rawCalls) ||
          rawCalls.length > 8 ||
          !rawCalls.every(
            (call) =>
              call &&
              call.type === "function" &&
              typeof call.id === "string" &&
              call.id.length > 0 &&
              call.id.length <= 150 &&
              typeof call.function?.name === "string" &&
              call.function.name.length <= 100 &&
              typeof call.function?.arguments === "string" &&
              call.function.arguments.length <= 2000,
          ) ||
          new Set(rawCalls.map((call) => call.id)).size !== rawCalls.length
        )
          throw new BadGatewayException("DeepSeek 返回了无效的工具调用。");
        toolCalls = rawCalls.length ? (rawCalls as LlmToolCall[]) : undefined;
      }
      if (!toolCalls && (typeof content !== "string" || !content.trim()))
        throw new BadGatewayException("DeepSeek API 没有返回有效内容。");
      return {
        content: typeof content === "string" ? content : "",
        model: this.model,
        ...(toolCalls ? { toolCalls } : {}),
        ...(message?.reasoning_content
          ? { reasoningContent: message.reasoning_content }
          : {}),
        ...(payload.usage ? { usage: payload.usage } : {}),
      };
    } catch (error) {
      if (controller.signal.aborted || options?.signal?.aborted)
        throw new BadGatewayException(
          "DeepSeek API 请求超时，已准备使用规则演示反馈。",
        );
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(
        "无法连接 DeepSeek API，请检查网络、代理和 API Key 配置。",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
