import { BadGatewayException, Injectable } from "@nestjs/common";
import { Dispatcher, ProxyAgent } from "undici";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

@Injectable()
export class DeepSeekService {
  private readonly baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
  private readonly model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  private readonly apiKey = process.env.DEEPSEEK_API_KEY;
  private readonly dispatcher?: Dispatcher;

  constructor() {
    const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
    if (proxyUrl) this.dispatcher = new ProxyAgent(proxyUrl);
  }

  get enabled() {
    return Boolean(this.apiKey);
  }

  async complete(messages: LlmMessage[], options?: { temperature?: number; maxTokens?: number }) {
    if (!this.apiKey) return null;

    const init: RequestInit & { dispatcher?: Dispatcher } = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: options?.temperature ?? 0.35,
        max_tokens: options?.maxTokens ?? 900,
        stream: false
      })
    };
    if (this.dispatcher) init.dispatcher = this.dispatcher;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, init);
    } catch {
      throw new BadGatewayException("无法连接 DeepSeek API，请检查网络、代理和 API Key 配置。");
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new BadGatewayException(`DeepSeek API 请求失败（${response.status}）：${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new BadGatewayException("DeepSeek API 没有返回有效内容。");
    return { content, model: this.model };
  }
}

