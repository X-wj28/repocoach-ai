import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthStore } from "./auth.store";
import { EmailService } from "./email.service";
import { emailValidationError, normalizeEmail } from "./email-policy";
import { hashPassword, verifyPassword } from "./password";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly authStore: AuthStore,
    private readonly emailService?: EmailService,
  ) {}

  private get verificationRequired() {
    return process.env.EMAIL_VERIFICATION_REQUIRED === "true";
  }

  async register(input: { email: string; name: string; password: string }) {
    const email = normalizeEmail(input.email);
    const emailError = emailValidationError(email);
    if (emailError) throw new BadRequestException(emailError);
    const name = input.name.trim();
    if (!name) throw new BadRequestException("请输入姓名。");
    const existing = await this.authStore.findByEmail(email);
    if (existing) {
      if (this.verificationRequired && !existing.emailVerifiedAt) {
        await this.sendVerificationCode(existing.id, email);
        return { user: this.toUser(existing), requiresEmailVerification: true };
      }
      throw new ConflictException("该邮箱已经注册，请直接登录。");
    }
    const user = await this.authStore.createUser({
      email,
      name,
      passwordHash: await hashPassword(input.password),
    });
    if (this.verificationRequired) {
      await this.sendVerificationCode(user.id, email);
      return { user, requiresEmailVerification: true };
    }
    return { user, ...(await this.issueSession(user.id)) };
  }

  async login(input: { email: string; password: string }) {
    const email = normalizeEmail(input.email);
    const emailError = emailValidationError(email);
    if (emailError) throw new BadRequestException(emailError);
    const row = await this.authStore.findByEmail(
      email,
    );
    if (!row || !(await verifyPassword(input.password, row.passwordHash))) {
      throw new UnauthorizedException("邮箱或密码不正确。");
    }
    if (this.verificationRequired && !row.emailVerifiedAt) {
      throw new UnauthorizedException("请先完成邮箱验证，再登录。");
    }
    const user = this.toUser(row);
    return { user, ...(await this.issueSession(user.id)) };
  }

  async verifyEmail(input: { email: string; code: string }) {
    const email = normalizeEmail(input.email);
    const emailError = emailValidationError(email);
    if (emailError) throw new BadRequestException(emailError);
    const row = await this.authStore.findByEmail(email);
    const valid = row?.emailVerificationCodeHash && row.emailVerificationExpiresAt
      && row.emailVerificationExpiresAt.getTime() > Date.now()
      && row.emailVerificationCodeHash === this.hashToken(input.code);
    if (!row || !valid) {
      throw new BadRequestException("验证码无效或已过期，请重新获取。");
    }
    await this.authStore.markEmailVerified(row.id);
    const user = {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
    return { user, ...(await this.issueSession(user.id)) };
  }

  async resendVerification(input: { email: string }) {
    const email = normalizeEmail(input.email);
    const emailError = emailValidationError(email);
    if (emailError) throw new BadRequestException(emailError);
    const row = await this.authStore.findByEmail(email);
    if (!row || row.emailVerifiedAt) return { success: true };
    if (!this.emailService) throw new BadRequestException("邮箱验证服务尚未配置，请联系管理员。");
    await this.sendVerificationCode(row.id, email);
    return { success: true };
  }

  findByToken(token: string) {
    return this.authStore.findUserBySession(this.hashToken(token));
  }

  logout(token: string) {
    return this.authStore.deleteSession(this.hashToken(token));
  }

  private async issueSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000);
    await this.authStore.createSession(
      userId,
      this.hashToken(token),
      expiresAt,
    );
    return { token, maxAgeSeconds: sessionMaxAgeSeconds };
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private createVerificationCode() {
    return String(randomInt(100000, 1000000));
  }

  private toUser(row: { id: string; email: string; name: string; createdAt: Date }) {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async sendVerificationCode(userId: string, email: string) {
    if (!this.emailService) {
      throw new BadRequestException("邮箱验证服务尚未配置，请联系管理员。");
    }
    const code = this.createVerificationCode();
    await this.authStore.setEmailVerification(
      userId,
      this.hashToken(code),
      new Date(Date.now() + 10 * 60 * 1000),
    );
    await this.emailService.sendVerificationCode(email, code);
  }
}
