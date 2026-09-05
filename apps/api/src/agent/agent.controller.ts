import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";
import { AgentService } from "./agent.service";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";

class StartInterviewDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  jobDescription?: string;

  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  projectUrl?: string;
}

class SubmitAnswerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  answer!: string;
}

@Controller("api/v1/interviews")
@UseGuards(SessionGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post(":interviewId/answer")
  submitAnswer(@Param("interviewId") interviewId: string, @Body() body: SubmitAnswerDto, @Req() request: AuthenticatedRequest) {
    return this.agentService.evaluateAnswer(interviewId, body.answer, request.user.id);
  }

  @Get("active")
  activeInterview(@Query("projectId") projectId: string, @Req() request: AuthenticatedRequest) {
    return this.agentService.getActiveInterview(projectId, request.user.id);
  }

  @Post("start")
  startInterview(@Body() body: StartInterviewDto, @Req() request: AuthenticatedRequest) {
    return this.agentService.startInterview(body.projectId, body.jobDescription ?? "", body.projectUrl, request.user.id);
  }
}
