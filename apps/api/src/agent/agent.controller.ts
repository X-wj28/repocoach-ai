import { Body, Controller, Param, Post } from "@nestjs/common";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { AgentService } from "./agent.service";

class StartInterviewDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  jobDescription?: string;
}

class SubmitAnswerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  answer!: string;
}

@Controller("api/v1/interviews")
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post(":interviewId/answer")
  submitAnswer(@Param("interviewId") interviewId: string, @Body() body: SubmitAnswerDto) {
    return this.agentService.evaluateAnswer(interviewId, body.answer);
  }

  @Post("start")
  startInterview(@Body() body: StartInterviewDto) {
    return this.agentService.startInterview(body.projectId, body.jobDescription ?? "");
  }
}
