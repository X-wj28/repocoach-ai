import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { connect, type TLSSocket } from "node:tls";

/** Minimal Gmail SMTP client so production email does not depend on Resend. */
@Injectable()
export class EmailService {
  private readonly host = process.env.EMAIL_SMTP_HOST?.trim() || "smtp.gmail.com";
  private readonly port = Number(process.env.EMAIL_SMTP_PORT || 465);
  private readonly user = process.env.EMAIL_SMTP_USER?.trim();
  private readonly password = process.env.EMAIL_SMTP_PASS?.trim();
  private readonly from = process.env.EMAIL_FROM?.trim() || this.user;

  get configured() {
    return Boolean(this.user && this.password && this.from);
  }

  async sendVerificationCode(to: string, code: string) {
    if (!this.configured) {
      if (process.env.NODE_ENV === "production") {
        throw new ServiceUnavailableException("邮箱验证服务尚未配置，请联系管理员。");
      }
      console.info(`[email] verification code for ${to}: ${code}`);
      return;
    }

    const fromAddress = this.from?.match(/<([^>]+)>/)?.[1] || this.from;
    const socket = await this.openConnection();
    try {
      await this.command(socket, "EHLO repocoach.local");
      await this.command(socket, "AUTH LOGIN");
      await this.command(socket, Buffer.from(this.user!, "utf8").toString("base64"));
      await this.command(socket, Buffer.from(this.password!, "utf8").toString("base64"));
      await this.command(socket, `MAIL FROM:<${fromAddress}>`);
      await this.command(socket, `RCPT TO:<${to}>`);
      await this.command(socket, "DATA");
      const message = [
        `From: ${this.from}`,
        `To: ${to}`,
        "Subject: RepoCoach 邮箱验证码",
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=UTF-8",
        "",
        `<p>你的 RepoCoach 注册验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>验证码 10 分钟内有效，请勿将验证码分享给他人。</p>`,
        ".",
      ].join("\r\n");
      socket.write(`${message}\r\n`);
      await this.readResponse(socket);
      await this.command(socket, "QUIT");
    } catch {
      throw new BadGatewayException("验证码邮件发送失败，请稍后重试。");
    } finally {
      socket.end();
    }
  }

  private openConnection() {
    return new Promise<TLSSocket>((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port, servername: this.host });
      socket.setTimeout(15_000);
      const onError = (error: Error) => { socket.destroy(); reject(error); };
      socket.once("error", onError);
      socket.once("timeout", () => onError(new Error("SMTP timeout")));
      socket.once("secureConnect", async () => {
        socket.removeListener("error", onError);
        try {
          await this.readResponse(socket);
          resolve(socket);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private command(socket: TLSSocket, value: string) {
    socket.write(`${value}\r\n`);
    return this.readResponse(socket);
  }

  private readResponse(socket: TLSSocket) {
    return new Promise<string>((resolve, reject) => {
      let buffer = "";
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\r\n").filter(Boolean);
        const last = lines.at(-1) || "";
        if (/^\d{3} /.test(last)) {
          cleanup();
          if (!/^[23]\d{2} /.test(last)) reject(new Error(last));
          else resolve(buffer);
        }
      };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
      };
      socket.on("data", onData);
      socket.once("error", onError);
    });
  }
}
