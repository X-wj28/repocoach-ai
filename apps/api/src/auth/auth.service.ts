import { createHash, randomBytes } from "node:crypto";
import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthStore } from "./auth.store";
import { hashPassword, verifyPassword } from "./password";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

@Injectable()
export class AuthService {
  constructor(private readonly authStore: AuthStore) {}

  async register(input: { email: string; name: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    if (this.authStore.findByEmail(email)) throw new ConflictException("该邮箱已经注册，请直接登录。");
    const user = this.authStore.createUser({ email, name: input.name.trim(), passwordHash: await hashPassword(input.password) });
    return { user, ...this.issueSession(user.id) };
  }

  async login(input: { email: string; password: string }) {
    const row = this.authStore.findByEmail(input.email.trim().toLowerCase());
    if (!row || !await verifyPassword(input.password, row.password_hash)) {
      throw new UnauthorizedException("邮箱或密码不正确。");
    }
    const user = { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
    return { user, ...this.issueSession(user.id) };
  }

  findByToken(token: string) {
    return this.authStore.findUserBySession(this.hashToken(token));
  }

  logout(token: string) {
    this.authStore.deleteSession(this.hashToken(token));
  }

  private issueSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString();
    this.authStore.createSession(userId, this.hashToken(token), expiresAt);
    return { token, maxAgeSeconds: sessionMaxAgeSeconds };
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }
}
