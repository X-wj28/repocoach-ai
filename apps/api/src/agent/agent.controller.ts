import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  Headers,
  UseGuards,
} from "@nestjs/common";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
} from "class-validator";
import { AgentService } from "./agent.service";
import { EvaluationStore } from "./evaluation.store";
import { DeepSeekService } from "../llm/deepseek.service";
import { EvaluationWorker } from "./evaluation.worker";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import type { ServerResponse } from "node:http";
import { EvaluationStreamService } from "./evaluation-stream.service";
import { parseEventCursor } from "./evaluation-events";

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
  @MaxLength(150)
  questionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Matches(/\S/, { message: "回答不能只包含空白。" })
  answer!: string;
}

@Controller("api/v1/interviews")
@UseGuards(SessionGuard)
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly evaluations: EvaluationStore,
    private readonly model: DeepSeekService,
    private readonly worker: EvaluationWorker,
    private readonly streams: EvaluationStreamService,
  ) {}

  @Post(":interviewId/answer")
  @HttpCode(202)
  async submitAnswer(
    @Param("interviewId") interviewId: string,
    @Body() body: SubmitAnswerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const run = await this.evaluations.submit(
      interviewId,
      request.user.id,
      body.questionId,
      body.answer,
      this.model.enabled ? this.model.modelId : "disabled",
    );
    this.worker.wake();
    return run;
  }

  @Get("evaluations/:runId")
  async evaluation(
    @Param("runId") runId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const run = await this.evaluations.get(runId, request.user.id);
    if (run.status !== "completed" && run.status !== "failed")
      this.worker.wake();
    return run;
  }

  @Post("evaluations/:runId/retry")
  @HttpCode(202)
  async retry(
    @Param("runId") runId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const run = await this.evaluations.retry(runId, request.user.id);
    this.worker.wake();
    return run;
  }

  @Get("evaluations/:runId/events")
  events(
    @Param("runId") runId: string,
    @Query("after") after: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.streams.list(runId, request.user.id, parseEventCursor(after));
  }

  @Get("evaluations/:runId/stream")
  stream(
    @Param("runId") runId: string,
    @Query("after") after: string | undefined,
    @Headers("last-event-id") lastEventId: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: ServerResponse,
  ) {
    this.worker.wake();
    return this.streams.serve(
      runId,
      request.user.id,
      parseEventCursor(lastEventId || after),
      response,
      request.sessionToken,
    );
  }

  @Get("active")
  async activeInterview(
    @Query("projectId") projectId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: ServerResponse,
  ) {
    const active = await this.agentService.getActiveInterview(
      projectId,
      request.user.id,
    );
    const result = active
      ? {
          ...active,
          pendingRun: await this.evaluations.active(
            active.interviewId,
            request.user.id,
            active.question.id,
          ),
        }
      : null;
    // Nest's default adapter sends an empty body for null. The browser expects
    // JSON both before the first interview and after the last turn completes.
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(result));
  }

  @Post("start")
  startInterview(
    @Body() body: StartInterviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.agentService.startInterview(
      body.projectId,
      body.jobDescription ?? "",
      body.projectUrl,
      request.user.id,
    );
  }
}
