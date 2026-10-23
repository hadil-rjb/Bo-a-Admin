import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import { CommentsService } from "./comments.service";

export class CreateCommentDto {
  @IsString() @IsNotEmpty() @MaxLength(4000) text!: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() @MaxLength(64) pageId?: string;
  @IsOptional() @IsString() @MaxLength(64) layerId?: string;
  @IsOptional() @IsNumber() x?: number;
  @IsOptional() @IsNumber() y?: number;
  @IsOptional() @IsNumber() lx?: number;
  @IsOptional() @IsNumber() ly?: number;
}
export class UpdateCommentDto {
  @IsOptional() @IsString() @MaxLength(4000) text?: string;
  @IsOptional() @IsBoolean() resolved?: boolean;
}

const actor = (r: any) => ({ id: r.user?.sub as string | null, name: r.user?.name as string, role: r.user?.role as string });

/** Comments on a design: every signed-in member reads, writes, replies and resolves (see CommentsService for who edits / deletes). */
@Controller("social/brands/:brandId/designs/:id/comments")
export class CommentsController {
  constructor(private readonly svc: CommentsService) {}

  @Get() list(@Param("brandId") brandId: string, @Param("id") id: string) { return this.svc.list(brandId, id); }
  @Post() create(@Param("brandId") brandId: string, @Param("id") id: string, @Body() dto: CreateCommentDto, @Req() r: any) { return this.svc.create(brandId, id, dto, actor(r)); }
  @Patch(":cid") update(@Param("brandId") brandId: string, @Param("id") id: string, @Param("cid") cid: string, @Body() dto: UpdateCommentDto, @Req() r: any) {
    return this.svc.update(brandId, id, cid, dto, actor(r));
  }
  @Delete(":cid") @HttpCode(200) remove(@Param("brandId") brandId: string, @Param("id") id: string, @Param("cid") cid: string, @Req() r: any) {
    return this.svc.remove(brandId, id, cid, actor(r));
  }
}
