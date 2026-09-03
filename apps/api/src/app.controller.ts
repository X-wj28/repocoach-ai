import { Body, Controller, Get, Post } from "@nestjs/common";
import { IsNotEmpty, IsString, IsUrl, MaxLength } from "class-validator";

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
  analyzeProject(@Body() body: AnalyzeProjectDto) {
    const repositoryName = body.repoUrl.split("/").filter(Boolean).pop() ?? "frontend-project";

    return {
      id: `project-${repositoryName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
      name: repositoryName,
      url: body.repoUrl,
      visibility: "public",
      stack: ["Next.js 14", "React", "TypeScript"],
      analyzedFiles: 19,
      status: "synced",
      jobDescription: body.jobDescription,
      analyzedAt: new Date().toISOString()
    };
  }
}
