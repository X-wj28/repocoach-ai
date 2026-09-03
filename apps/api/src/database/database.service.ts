import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Injectable, OnModuleDestroy } from "@nestjs/common";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly connection: DatabaseSync;

  constructor() {
    const databasePath = process.env.REPOCOACH_DB_PATH
      ? resolve(process.env.REPOCOACH_DB_PATH)
      : resolve(process.cwd(), "data/repocoach.db");
    mkdirSync(dirname(databasePath), { recursive: true });
    this.connection = new DatabaseSync(databasePath);
    this.connection.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  onModuleDestroy() {
    this.connection.close();
  }

  private migrate() {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS interviews (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        project_url TEXT NOT NULL,
        job_description TEXT NOT NULL,
        status TEXT NOT NULL,
        total_questions INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS interview_answers (
        id TEXT PRIMARY KEY,
        interview_id TEXT NOT NULL,
        question_number INTEGER NOT NULL,
        question_id TEXT NOT NULL,
        question_prompt TEXT NOT NULL,
        context_path TEXT NOT NULL,
        dimension TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        answer TEXT NOT NULL,
        score REAL NOT NULL,
        strengths TEXT NOT NULL,
        improvements TEXT NOT NULL,
        provider TEXT NOT NULL,
        answered_at TEXT NOT NULL,
        FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE
      );
    `);

    const columns = this.connection.prepare("PRAGMA table_info(interviews)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "user_id")) {
      this.connection.exec("ALTER TABLE interviews ADD COLUMN user_id TEXT");
    }

    this.connection.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON auth_sessions(token_hash, expires_at);
      CREATE INDEX IF NOT EXISTS idx_interviews_user_project ON interviews(user_id, project_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_answers_interview ON interview_answers(interview_id, question_number);
    `);
  }
}
