import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { AllowLink, Roles } from "../common/roles.decorator";
import { ActivityService } from "./activity.service";
import { InviteDto, LinkDto, PingDto, RoleDto } from "./dto/share.dto";
import { ShareService } from "./share.service";

const actor = (r: any) => ({ id: r.user.sub as string, name: r.user.name as string });

@Controller("share")
export class ShareController {
  constructor(private s: ShareService, private act: ActivityService) {}

  @Get() state(@Req() r: any) { return this.s.state(r.user); }
  @Roles("admin") @Post("members") invite(@Req() r: any, @Body() d: InviteDto) { return this.s.invite(actor(r), d); }
  @Roles("admin") @Patch("members/:id") role(@Req() r: any, @Param("id") id: string, @Body() d: RoleDto) { return this.s.setRole(actor(r), id, d.role); }
  @Roles("admin") @Delete("members/:id") remove(@Req() r: any, @Param("id") id: string) { return this.s.remove(actor(r), id); }
  @Roles("admin") @Put("link") link(@Req() r: any, @Body() d: LinkDto) { return this.s.setLink(actor(r), d); }

  @AllowLink() @Post("ping") ping(@Req() r: any, @Body() d: PingDto) { return this.s.ping(r.user, d.viewerId); }
  @Get("activity") activity(@Query("kind") kind?: string, @Query("before") before?: string, @Query("limit") limit?: string) { return this.act.list(kind, before, Number(limit) || 30); }
  @Roles("admin", "editor") @Post("activity/:id/restore") restore(@Req() r: any, @Param("id") id: string) { return this.s.restore(actor(r), id); }
}
