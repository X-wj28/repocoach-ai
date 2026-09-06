import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthStore } from "./auth.store";
import { emailValidationError, normalizeEmail } from "./email-policy";
import { hashPassword, verifyPassword } from "./password";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

@Injectable()
export class AuthService {
  constructor(private readonly authStore: AuthStore) {}

  async register(input: { email: string; name: string; password: string }) {
    const email = normalizeEmail(input.email);
    const emailError = emailValidationError(email);
    if (emailError) throw new BadRequestException(emailError);
    const name = input.name.trim();
    if (!name) throw new BadRequestException("请输入姓名。");
    if (await this.authStore.findByEmail(email))
      throw new ConflictException("该邮箱已经注册，请直接登录。");
    const user = await this.authStore.createUser({
      email,
      name,
      passwordHash: await hashPassword(input.password),
    });
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
    const user = {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
    return { user, ...(await this.issueSession(user.id)) };
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
}
