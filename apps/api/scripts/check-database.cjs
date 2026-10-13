const { config } = require("dotenv");
const { resolve } = require("node:path");
const { readdirSync } = require("node:fs");
const { PrismaClient } = require("@prisma/client");

config({ path: resolve(__dirname, "../../../.env") });

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const target = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  console.log(
    JSON.stringify({
      host: target.hostname,
      port: target.port || "5432",
      database: decodeURIComponent(target.pathname.slice(1)),
      schema: target.searchParams.get("schema") || "public",
    }),
  );

  const prisma = new PrismaClient({ log: [] });
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Each query validates the columns expected by the installed Prisma Client.
    // No account, session token, answer, or evaluation content is returned.
    await prisma.user.findFirst({
      select: { id: true, emailVerifiedAt: true, memoryEpoch: true },
    });
    await prisma.authSession.findFirst({ select: { id: true } });
    await prisma.projectSnapshot.findFirst({
      select: {
        id: true,
        commitSha: true,
        manifest: true,
        treeTruncated: true,
      },
    });
    await prisma.interview.findFirst({
      select: {
        id: true,
        questions: true,
        currentQuestion: true,
        projectContext: true,
      },
    });
    await prisma.interviewAnswer.findFirst({
      select: { id: true, evaluation: true },
    });
    await prisma.evaluationRun.findFirst({
      select: {
        id: true,
        status: true,
        evidence: true,
        leaseToken: true,
        rubricVersion: true,
        lastEventSeq: true,
      },
    });
    await prisma.evaluationEvent.findFirst({ select: { id: true, sequence: true } });
    await prisma.trainingMemory.findFirst({ select: { id: true, criterion: true } });
    const rows = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
    `;
    const expected = readdirSync(resolve(__dirname, "../prisma/migrations"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const applied = new Set(
      rows
        .filter((row) => row.finished_at && !row.rolled_back_at)
        .map((row) => row.migration_name),
    );
    const pending = expected.filter((name) => !applied.has(name));
    const failed = rows
      .filter((row) => !row.finished_at && !row.rolled_back_at)
      .map((row) => row.migration_name);
    console.log(
      JSON.stringify({
        connected: true,
        applicationSchema: "ok",
        pending,
        failed,
      }),
    );
    if (pending.length || failed.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Provider/engine messages can include a connection URL. Output only an error code.
  const code =
    typeof error.code === "string" && /^P\d{4}$/.test(error.code)
      ? error.code
      : "CONFIG_OR_CONNECTION_ERROR";
  console.error(
    `Database check failed (${code}). Check DATABASE_URL, TLS, network access, and migration logs.`,
  );
  process.exitCode = 1;
});
