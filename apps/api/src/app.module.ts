import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AgentController } from "./agent/agent.controller";
import { AgentService } from "./agent/agent.service";
import { GitHubService } from "./github/github.service";
import { DeepSeekService } from "./llm/deepseek.service";
import { ReportController } from "./report/report.controller";
import { ReportStore } from "./report/report.store";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthStore } from "./auth/auth.store";
import { EmailService } from "./auth/email.service";
import { SessionGuard } from "./auth/session.guard";
import { PrismaService } from "./database/prisma.service";
import { EvaluationStore } from "./agent/evaluation.store";
import { EvaluationWorker } from "./agent/evaluation.worker";
import { RubricScorer } from "./agent/rubric-scorer";
import { EvaluationStreamService } from "./agent/evaluation-stream.service";
import { TrainingMemoryStore } from "./agent/training-memory.store";
import { TrainingMemoryController } from "./agent/training-memory.controller";

@Module({
  controllers: [
    AppController,
    AgentController,
    ReportController,
    AuthController,
    TrainingMemoryController,
  ],
  providers: [
    PrismaService,
    AuthStore,
    AuthService,
    EmailService,
    SessionGuard,
    AgentService,
    GitHubService,
    DeepSeekService,
    EvaluationStore,
    EvaluationWorker,
    RubricScorer,
    EvaluationStreamService,
    TrainingMemoryStore,
    ReportStore,
  ],
})
export class AppModule {}
