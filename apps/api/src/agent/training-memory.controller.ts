import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { TrainingMemoryStore } from "./training-memory.store";

@Controller("api/v1/training-memory")
@UseGuards(SessionGuard)
export class TrainingMemoryController {
  constructor(private readonly memory: TrainingMemoryStore) {}
  @Get()
  get(@Query("projectId") projectId: string, @Req() req: AuthenticatedRequest) {
    if (!projectId || projectId.length > 200)
      throw new BadRequestException("需要有效的项目ID。");
    return this.memory.get(projectId, req.user.id);
  }
  @Post("clear")
  clear(@Req() req: AuthenticatedRequest) {
    return this.memory.clear(req.user.id);
  }
}
