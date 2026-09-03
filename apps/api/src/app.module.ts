import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AgentController } from "./agent/agent.controller";
import { AgentService } from "./agent/agent.service";
import { GitHubService } from "./github/github.service";

@Module({
  controllers: [AppController, AgentController],
  providers: [AgentService, GitHubService]
})
export class AppModule {}
