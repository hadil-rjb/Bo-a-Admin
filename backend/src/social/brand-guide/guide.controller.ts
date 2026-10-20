import { BadGatewayException, BadRequestException, Body, Controller, HttpCode, Logger, Post } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Roles } from "../../common/roles.decorator";
import { AiService } from "../../ai/ai.service";
import { readGuideWithClaude } from "./guide";

class GuidePage {
  @IsInt() @Min(1) @Max(500) n!: number;
  @IsString() @Matches(/^data:image\/(png|jpeg|webp);base64,/) @MaxLength(2_500_000) image!: string;
}

class ReadGuideDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => GuidePage) pages!: GuidePage[];
  @IsOptional() @IsString() @MaxLength(60_000) text?: string;
  @IsOptional() @IsString() @MaxLength(200) fileName?: string;
}

/** "Add brand" → "Start from a brand guide": pages of a PDF (rendered by the studio) → brand kit */
@Controller("social/brand-guide")
export class BrandGuideController {
  private log = new Logger("BrandGuide");
  constructor(private ai: AiService) {}

  @Roles("admin", "editor") @Post("read") @HttpCode(200)
  async read(@Body() dto: ReadGuideDto) {
    const key = await this.ai.anthropicKey();
    if (!key) throw new BadRequestException("Add a Claude key in Settings → AI assistant to read brand guides");
    try {
      return await readGuideWithClaude(key, { pages: dto.pages, text: dto.text || "", fileName: dto.fileName });
    } catch (e: any) {
      this.log.warn(`Brand guide read failed: ${e?.message || e}`);
      throw new BadGatewayException(`Claude couldn't read this brand guide: ${e?.message || "error"}`);
    }
  }
}
