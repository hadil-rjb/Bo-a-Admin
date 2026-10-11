import { Body, Controller, Get, HttpCode, Ip, Patch, Post, Req } from "@nestjs/common";
import { Public } from "../common/public.decorator";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto, UpdateProfileDto } from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Post("login") @HttpCode(200)
  login(@Body() d: LoginDto, @Ip() ip: string) { return this.auth.login(d.email, d.password, ip); }

  @Get("me") me(@Req() r: any) { return this.auth.profile(r.user.sub); }
  @Patch("me") update(@Req() r: any, @Body() d: UpdateProfileDto) { return this.auth.updateProfile(r.user.sub, d); }
  @Post("password") @HttpCode(200)
  password(@Req() r: any, @Body() d: ChangePasswordDto) { return this.auth.changePassword(r.user.sub, d); }
}
