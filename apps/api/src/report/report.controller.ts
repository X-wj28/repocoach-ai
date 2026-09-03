import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { ReportStore } from "./report.store";

@Controller("api/v1/reports")
@UseGuards(SessionGuard)
export class ReportController {
  constructor(private readonly reportStore: ReportStore) {}

  @Get("projects/:projectId")
  getProjectReport(@Param("projectId") projectId: string, @Req() request: AuthenticatedRequest) {
    return this.reportStore.getProjectReport(projectId, request.user.id);
  }

  @Get("interviews/:interviewId")
  getInterviewDetail(@Param("interviewId") interviewId: string, @Req() request: AuthenticatedRequest) {
    return this.reportStore.getInterviewDetail(interviewId, request.user.id);
  }
}
