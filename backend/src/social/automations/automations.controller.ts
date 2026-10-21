import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import { PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Roles } from "../../common/roles.decorator";
import { PLATFORM_KEYS } from "../dto/resource.dto";
import { AutomationsService } from "./automations.service";

class CadenceDto {
  @IsIn(["daily", "weekdays", "weekly"]) kind!: "daily" | "weekdays" | "weekly";
  @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) days!: number[];
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time!: string;
}
class CaptionDto {
  @IsIn(["fixed", "ai"]) mode!: "fixed" | "ai";
  @IsString() @MaxLength(3000) text!: string;
  @IsOptional() @IsString() @MaxLength(1000) fc?: string;
}
class AutomationDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(60) d!: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() notion?: boolean;
  @ValidateNested() @Type(() => CadenceDto) cadence!: CadenceDto;
  @IsOptional() @IsString() @MaxLength(60) tz?: string;
  @IsArray() @IsIn(PLATFORM_KEYS, { each: true }) pf!: string[];
  @ValidateNested() @Type(() => CaptionDto) caption!: CaptionDto;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/) startDate?: string;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/) endDate?: string;
}
class UpdateAutomationDto extends PartialType(AutomationDto) {}
class SkipDto { @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string; }

const EDIT = ["admin", "editor"];

/** Recurring posts: a design (usually a live template) published on a rhythm */
@Controller("social/brands/:brandId/automations")
export class AutomationsController {
  constructor(private svc: AutomationsService) {}

  @Get() list(@Param("brandId") b: string) { return this.svc.list(b); }
  @Roles(...EDIT) @Post() create(@Param("brandId") b: string, @Body() dto: AutomationDto, @Req() r: any) { return this.svc.create(b, dto, r.user?.name); }
  @Roles(...EDIT) @Patch(":id") update(@Param("brandId") b: string, @Param("id") id: string, @Body() dto: UpdateAutomationDto) { return this.svc.update(b, id, dto); }
  @Roles(...EDIT) @Delete(":id") remove(@Param("brandId") b: string, @Param("id") id: string) { return this.svc.remove(b, id); }
  /** Skip one run (planner) */
  @Roles(...EDIT) @Post(":id/skip") @HttpCode(200) skip(@Param("brandId") b: string, @Param("id") id: string, @Body() dto: SkipDto) { return this.svc.skip(b, id, dto.date); }
  /** Publish one run right now */
  @Roles(...EDIT) @Post(":id/run") @HttpCode(200) run(@Param("brandId") b: string, @Param("id") id: string) { return this.svc.runNow(b, id); }
}
