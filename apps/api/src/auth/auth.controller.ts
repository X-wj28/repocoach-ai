import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest, CookieResponse } from "./auth.types";
import { clearSessionCookie, createSessionCookie } from "./session-cookie";
import { SessionGuard } from "./session.guard";

class RegisterDto {
  @IsEmail({}, { message: "请输入有效邮箱。" })
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @IsString()
  @MinLength(8, { message: "密码至少需要 8 位。" })
  @MaxLength(72)
  password!: string;
}

class LoginDto {
  @IsEmail({}, { message: "请输入有效邮箱。" })
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.authService.register(body);
    response.setHeader("Set-Cookie", createSessionCookie(result.token, result.maxAgeSeconds));
    return { user: result.user };
  }

  @Post("login")
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.authService.login(body);
    response.setHeader("Set-Cookie", createSessionCookie(result.token, result.maxAgeSeconds));
    return { user: result.user };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }

  @Post("logout")
  @UseGuards(SessionGuard)
  logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse) {
    this.authService.logout(request.sessionToken);
    response.setHeader("Set-Cookie", clearSessionCookie());
    return { success: true };
  }
}
