import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsString, IsUrl, MaxLength } from "class-validator";
import { SessionGuard } from "./auth/session.guard";
import { GitHubService } from "./github/github.service";

class AnalyzeProjectDto {
  @IsUrl({ protocols: ["https"], require_protocol: true })
  repoUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  jobDescription!: string;
}

@Controller("api/v1")
export class AppController {
  constructor(private readonly githubService: GitHubService) {}

  @Get("health")
  health() {
    return { status: "ok", service: "repocoach-api", timestamp: new Date().toISOString() };
  }

  @Get("demo/project")
  demoProject() {
    return {
      id: "demo-project",
      name: "acme-dashboard",
      url: "https://github.com/lin-student/acme-dashboard",
      visibility: "public",
      stack: ["Next.js 14", "React", "TypeScript"],
      analyzedFiles: 19,
      status: "synced"
    };
  }

  @Post("projects/analyze")
  @UseGuards(SessionGuard)
  analyzeProject(@Body() body: AnalyzeProjectDto) {
    return this.githubService.analyzePublicRepository(body.repoUrl, body.jobDescription);
  }
}
