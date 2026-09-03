import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";
import { readSessionCookie } from "./session-cookie";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request.headers.cookie);
    if (!token) throw new UnauthorizedException("请先登录。");
    const user = this.authService.findByToken(token);
    if (!user) throw new UnauthorizedException("登录已过期，请重新登录。");
    request.user = user;
    request.sessionToken = token;
    return true;
  }
}
