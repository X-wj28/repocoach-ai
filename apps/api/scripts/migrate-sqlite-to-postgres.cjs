const { resolve } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { PrismaClient } = require("@prisma/client");

const sqlitePath =
  process.env.REPOCOACH_SQLITE_PATH ||
  resolve(__dirname, "../data/repocoach.db");
const prisma = new PrismaClient();

function date(value) {
  return value ? new Date(value) : null;
}

function list(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

const dimensions = {
  react: "REACT",
  nextjs: "NEXTJS",
  engineering: "ENGINEERING",
  performance: "PERFORMANCE",
};

const difficulties = {
  基础: "BASIC",
  进阶: "ADVANCED",
  深入: "DEEP",
};

async function main() {
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const users = sqlite
      .prepare("SELECT id, email, name, password_hash, created_at FROM users")
      .all();
    const sessions = sqlite
      .prepare(
        "SELECT id, user_id, token_hash, expires_at, created_at FROM auth_sessions",
      )
      .all();
    const interviews = sqlite
      .prepare(
        "SELECT id, user_id, project_id, project_name, project_url, job_description, status, total_questions, started_at, completed_at FROM interviews WHERE user_id IS NOT NULL",
      )
      .all();
    const answers = sqlite
      .prepare(
        "SELECT a.id, a.interview_id, a.question_number, a.question_id, a.question_prompt, a.context_path, a.dimension, a.difficulty, a.answer, a.score, a.strengths, a.improvements, a.provider, a.answered_at FROM interview_answers a INNER JOIN interviews i ON i.id = a.interview_id WHERE i.user_id IS NOT NULL",
      )
      .all();

    for (const user of users) {
      await prisma.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email.toLowerCase(),
          name: user.name,
          passwordHash: user.password_hash,
          createdAt: date(user.created_at),
        },
        update: {
          email: user.email.toLowerCase(),
          name: user.name,
          passwordHash: user.password_hash,
        },
      });
    }

    for (const session of sessions) {
      await prisma.authSession.upsert({
        where: { id: session.id },
        create: {
          id: session.id,
          userId: session.user_id,
          tokenHash: session.token_hash,
          expiresAt: date(session.expires_at),
          createdAt: date(session.created_at),
        },
        update: {
          tokenHash: session.token_hash,
          expiresAt: date(session.expires_at),
        },
      });
    }

    for (const interview of interviews) {
      const data = {
        userId: interview.user_id,
        projectId: interview.project_id,
        projectName: interview.project_name,
        projectUrl: interview.project_url,
        jobDescription: interview.job_description,
        status: interview.status === "completed" ? "COMPLETED" : "IN_PROGRESS",
        totalQuestions: Number(interview.total_questions),
        startedAt: date(interview.started_at),
        completedAt: date(interview.completed_at),
      };
      await prisma.interview.upsert({
        where: { id: interview.id },
        create: { id: interview.id, ...data },
        update: data,
      });
    }

    for (const answer of answers) {
      const data = {
        interviewId: answer.interview_id,
        questionNumber: Number(answer.question_number),
        questionId: answer.question_id,
        questionPrompt: answer.question_prompt,
        contextPath: answer.context_path,
        dimension: dimensions[answer.dimension],
        difficulty: difficulties[answer.difficulty],
        answer: answer.answer,
        score: Number(answer.score),
        strengths: list(answer.strengths),
        improvements: list(answer.improvements),
        provider: answer.provider,
        answeredAt: date(answer.answered_at),
      };
      await prisma.interviewAnswer.upsert({
        where: { id: answer.id },
        create: { id: answer.id, ...data },
        update: data,
      });
    }

    console.log(
      "Imported " +
        users.length +
        " users, " +
        sessions.length +
        " sessions, " +
        interviews.length +
        " owned interviews, and " +
        answers.length +
        " answers.",
    );
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
