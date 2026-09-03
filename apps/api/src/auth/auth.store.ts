import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import type { AuthUser } from "./auth.types";

type UserRow = { id: string; email: string; name: string; password_hash: string; created_at: string };

@Injectable()
export class AuthStore {
  constructor(private readonly database: DatabaseService) {}

  findByEmail(email: string) {
    return this.database.connection.prepare(`
      SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?
    `).get(email) as unknown as UserRow | undefined;
  }

  createUser(input: { email: string; name: string; passwordHash: string }) {
    const row: UserRow = {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      password_hash: input.passwordHash,
      created_at: new Date().toISOString()
    };
    this.database.connection.prepare(`
      INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(row.id, row.email, row.name, row.password_hash, row.created_at);
    return this.toUser(row);
  }

  createSession(userId: string, tokenHash: string, expiresAt: string) {
    this.database.connection.prepare(`
      INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), userId, tokenHash, expiresAt, new Date().toISOString());
  }

  findUserBySession(tokenHash: string) {
    const row = this.database.connection.prepare(`
      SELECT u.id, u.email, u.name, u.password_hash, u.created_at
      FROM auth_sessions s INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(tokenHash, new Date().toISOString()) as unknown as UserRow | undefined;
    return row ? this.toUser(row) : null;
  }

  deleteSession(tokenHash: string) {
    this.database.connection.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
  }

  private toUser(row: UserRow): AuthUser {
    return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
  }
}
