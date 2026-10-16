import { Body, Controller, Delete, Get, Put, Query, Redirect, Req } from "@nestjs/common";
import { Public } from "../common/public.decorator";
import { Roles } from "../common/roles.decorator";
import { GscService } from "./gsc.service";

@Controller("gsc")
export class GscController {
  constructor(private s: GscService) {}
  @Get("status") status() { return this.s.status(); }
  @Roles("admin") @Get("auth-url") async authUrl(@Req() r: any) { return { url: await this.s.authUrl(r.user.sub) }; }
  @Get("performance") performance(@Query("days") days?: string) { return this.s.performance(Number(days) || 28); }
  @Get("sites") sites() { return this.s.sites(); }
  @Roles("admin") @Put("site") setSite(@Body("site") site: string) { return this.s.setSite(site); }
  @Get("inspect") inspect(@Query("url") url: string) { return this.s.inspect(url); }
  @Roles("admin") @Delete() disconnect() { return this.s.disconnect(); }

  /** Redirection depuis Google (navigateur, sans header Authorization) → protégée par le `state` JWT */
  @Public() @Get("callback") @Redirect()
  async callback(@Query("code") code?: string, @Query("state") state?: string, @Query("error") error?: string) {
    try {
      if (error || !code || !state) throw new Error(error ?? "Code d'autorisation manquant");
      await this.s.handleCallback(code, state);
      return { url: `${this.s.frontUrl}/?connected=1` };
    } catch (e) {
      return { url: `${this.s.frontUrl}/?error=${encodeURIComponent((e as Error).message)}` };
    }
  }
}
