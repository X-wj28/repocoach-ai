export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 25000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
      const body = await response.text();
      let message = body;
      try {
        const parsed = JSON.parse(body) as { message?: string | string[] };
        message = Array.isArray(parsed.message)
          ? parsed.message.join("；")
          : (parsed.message ?? body);
      } catch {
        // Preserve a non-JSON server error as text.
      }
      throw new ApiError(
        message || `API request failed with ${response.status}`,
        response.status,
      );
    }
    // Await the body before clearing the timer: receiving headers alone does
    // not mean the response finished, including when a proxy stalls mid-body.
    return (await response.json()) as T;
  } catch (reason) {
    if (reason instanceof Error && reason.name === "AbortError") {
      throw new Error(
        "后端服务响应超时。Render 免费实例可能正在唤醒，请等待 30 秒后重试。",
      );
    }
    if (reason instanceof TypeError) {
      throw new Error(
        "无法连接后端服务。请确认 API 已部署并处于 Live 状态；如果服务刚休眠，请稍后重试。",
      );
    }
    if (reason instanceof SyntaxError) {
      throw new Error("后端服务返回了无效数据，请刷新后重试。");
    }
    throw reason;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
