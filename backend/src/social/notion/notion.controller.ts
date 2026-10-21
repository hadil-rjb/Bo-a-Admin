import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, Query } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { Roles } from "../../common/roles.decorator";
import { NotionService } from "./notion.service";

const NID = /^[0-9a-fA-F-]{32,36}$/;
class TokenDto { @IsString() @MaxLength(200) token!: string; }
class SetupDto {
  @IsOptional() @Matches(NID) databaseId?: string;
  @IsOptional() @Matches(NID) pageId?: string;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
}
class OptionsDto { @IsOptional() @IsIn(["auto", "all"]) scope?: "auto" | "all"; }

/** Notion Calendar: the schedule as a Notion database */
@Controller("social/notion")
export class NotionController {
  constructor(private svc: NotionService) {}

  @Get() status() { return this.svc.status(); }
  @Roles("admin") @Put("token") connect(@Body() dto: TokenDto) { return this.svc.connect(dto.token); }
  @Roles("admin") @Get("targets") targets(@Query("q") q?: string) { return this.svc.targets(q); }
  @Roles("admin") @Post("setup") @HttpCode(200) setup(@Body() dto: SetupDto) { return this.svc.setup(dto); }
  @Roles("admin") @Patch("options") options(@Body() dto: OptionsDto) { return this.svc.options(dto); }
  @Roles("admin", "editor") @Post("sync") @HttpCode(200) sync() { return this.svc.syncNow(); }
  @Roles("admin") @Delete() disconnect() { return this.svc.disconnect(); }
}
