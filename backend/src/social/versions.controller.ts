import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { Roles } from "../common/roles.decorator";
import { VersionsService } from "./versions.service";

const EDIT = ["admin", "editor"];

export class CreateVersionDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsBoolean() auto?: boolean;
}
export class RenameVersionDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
}

/** A design's version history: every member can browse it; admins and editors save, rename and delete versions. */
@Controller("social/brands/:brandId/designs/:id/versions")
export class VersionsController {
  constructor(private readonly svc: VersionsService) {}

  @Get() list(@Param("brandId") brandId: string, @Param("id") id: string) { return this.svc.list(brandId, id); }
  @Roles(...EDIT) @Post() create(@Param("brandId") brandId: string, @Param("id") id: string, @Body() dto: CreateVersionDto, @Req() r: any) {
    return this.svc.create(brandId, id, dto, { id: r.user?.sub, name: r.user?.name });
  }
  @Get(":vid") get(@Param("brandId") brandId: string, @Param("id") id: string, @Param("vid") vid: string) { return this.svc.get(brandId, id, vid); }
  @Roles(...EDIT) @Patch(":vid") rename(@Param("brandId") brandId: string, @Param("id") id: string, @Param("vid") vid: string, @Body() dto: RenameVersionDto) {
    return this.svc.rename(brandId, id, vid, dto.name);
  }
  @Roles(...EDIT) @Delete(":vid") @HttpCode(200) remove(@Param("brandId") brandId: string, @Param("id") id: string, @Param("vid") vid: string) {
    return this.svc.remove(brandId, id, vid);
  }
}
