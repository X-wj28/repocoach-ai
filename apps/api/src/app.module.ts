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
import { SessionGuard } from "./auth/session.guard";
import { PrismaService } from "./database/prisma.service";

@Module({
  controllers: [
    AppController,
    AgentController,
    ReportController,
    AuthController,
  ],
  providers: [
    PrismaService,
    AuthStore,
    AuthService,
    SessionGuard,
    AgentService,
    GitHubService,
    DeepSeekService,
    ReportStore,
  ],
})
export class AppModule {}
