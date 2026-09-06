import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";

@Injectable()
export class EmailService {
  private readonly apiKey = process.env.RESEND_API_KEY?.trim();
  private readonly from = process.env.EMAIL_FROM?.trim();

  get configured() {
    return Boolean(this.apiKey && this.from);
  }

  async sendVerificationCode(to: string, code: string) {
    if (!this.configured) {
      if (process.env.NODE_ENV === "production") {
        throw new ServiceUnavailableException("邮箱验证服务尚未配置，请联系管理员。");
      }
      console.info(`[email] verification code for ${to}: ${code}`);
      return;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [to],
        subject: "RepoCoach 邮箱验证码",
        html: `<p>你的 RepoCoach 注册验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>验证码 10 分钟内有效，请勿将验证码分享给他人。</p>`,
      }),
    });

    if (!response.ok) {
      throw new BadGatewayException("验证码邮件发送失败，请稍后重试。");
    }
  }
}
