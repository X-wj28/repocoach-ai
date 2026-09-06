import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";

/** Sends verification mail through Brevo's HTTPS API (Render-friendly, port 443). */
@Injectable()
export class EmailService {
  private readonly webhookUrl = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();
  private readonly webhookSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET?.trim();
  private readonly apiKey = process.env.BREVO_API_KEY?.trim();
  private readonly from = process.env.EMAIL_FROM?.trim();
  private readonly senderEmail = this.from?.match(/<([^>]+)>/)?.[1] || this.from;
  private readonly senderName = this.from?.match(/^([^<]+)</)?.[1]?.trim() || "RepoCoach";

  get configured() {
    return Boolean((this.webhookUrl && this.webhookSecret) || (this.apiKey && this.senderEmail));
  }

  async sendVerificationCode(to: string, code: string) {
    if (!this.configured) {
      if (process.env.NODE_ENV === "production") {
        throw new ServiceUnavailableException("邮箱验证服务尚未配置，请联系管理员。");
      }
      console.info(`[email] verification code for ${to}: ${code}`);
      return;
    }

    if (this.webhookUrl && this.webhookSecret) {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, code, secret: this.webhookSecret }),
      });
      const body = await response.text().catch(() => "");
      let result: { ok?: boolean; error?: string } = {};
      try {
        result = JSON.parse(body) as { ok?: boolean; error?: string };
      } catch {
        // Keep the raw response for the safe diagnostic below.
      }
      if (!response.ok || result.ok !== true) {
        console.error("Google Apps Script verification email failed", { status: response.status, message: result.error || body.slice(0, 300) });
        throw new BadGatewayException("验证码邮件发送失败，请检查 Google Apps Script 配置。");
      }
      return;
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": this.apiKey!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: this.senderName, email: this.senderEmail },
        to: [{ email: to }],
        subject: "RepoCoach 邮箱验证码",
        htmlContent: `<p>你的 RepoCoach 注册验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>验证码 10 分钟内有效，请勿将验证码分享给他人。</p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Brevo verification email failed", {
        status: response.status,
        message: body.slice(0, 300),
      });
      throw new BadGatewayException("验证码邮件发送失败，请检查 Brevo API Key 和发件人配置。");
    }
  }
}
