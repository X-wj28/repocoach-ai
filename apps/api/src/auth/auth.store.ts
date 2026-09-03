import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { AuthUser } from "./auth.types";

@Injectable()
export class AuthStore {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
  }) {
    const row = await this.prisma.user.create({ data: input });
    return this.toUser(row);
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date) {
    await this.prisma.authSession.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  async findUserBySession(tokenHash: string) {
    const session = await this.prisma.authSession.findFirst({
      where: { tokenHash, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    return session ? this.toUser(session.user) : null;
  }

  async deleteSession(tokenHash: string) {
    await this.prisma.authSession.deleteMany({ where: { tokenHash } });
  }

  private toUser(row: {
    id: string;
    email: string;
    name: string;
    createdAt: Date;
  }): AuthUser {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
