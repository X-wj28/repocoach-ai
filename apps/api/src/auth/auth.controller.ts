import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { gmailPattern } from "./email-policy";
import type { AuthenticatedRequest, CookieResponse } from "./auth.types";
import { clearSessionCookie, createSessionCookie } from "./session-cookie";
import { SessionGuard } from "./session.guard";

class RegisterDto {
  @IsEmail({}, { message: "请输入有效邮箱。" })
  @Matches(gmailPattern, { message: "目前仅支持 Gmail 邮箱，请使用 name@gmail.com。" })
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
  @Matches(gmailPattern, { message: "目前仅支持 Gmail 邮箱，请使用 name@gmail.com。" })
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

class VerifyEmailDto {
  @IsEmail({}, { message: "请输入有效邮箱。" })
  @Matches(gmailPattern, { message: "目前仅支持 Gmail 邮箱，请使用 name@gmail.com。" })
  email!: string;

  @IsString()
  @Length(6, 6, { message: "验证码必须是 6 位数字。" })
  @Matches(/^\d{6}$/, { message: "验证码必须是 6 位数字。" })
  code!: string;
}

class ResendVerificationDto {
  @IsEmail({}, { message: "请输入有效邮箱。" })
  @Matches(gmailPattern, { message: "目前仅支持 Gmail 邮箱，请使用 name@gmail.com。" })
  email!: string;
}

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.authService.register(body);
    if ("token" in result === false) {
      return { user: result.user, requiresEmailVerification: true };
    }
    response.setHeader(
      "Set-Cookie",
      createSessionCookie(result.token, result.maxAgeSeconds),
    );
    return { user: result.user, requiresEmailVerification: false };
  }

  @Post("verify-email")
  async verifyEmail(
    @Body() body: VerifyEmailDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.authService.verifyEmail(body);
    response.setHeader(
      "Set-Cookie",
      createSessionCookie(result.token, result.maxAgeSeconds),
    );
    return { user: result.user, requiresEmailVerification: false };
  }

  @Post("resend-verification")
  resendVerification(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body);
  }

  @Post("login")
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.authService.login(body);
    response.setHeader(
      "Set-Cookie",
      createSessionCookie(result.token, result.maxAgeSeconds),
    );
    return { user: result.user, requiresEmailVerification: false };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }

  @Post("logout")
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.authService.logout(request.sessionToken);
    response.setHeader("Set-Cookie", clearSessionCookie());
    return { success: true };
  }
}
