import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { Roles } from "../../common/roles.decorator";
import { CalendarService } from "./calendar.service";

class LayerIn {
  @IsString() id!: string;
  @IsString() type!: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
  @IsNumber() x!: number;
  @IsNumber() y!: number;
  @IsNumber() w!: number;
  @IsNumber() h!: number;
  @IsOptional() @IsNumber() size?: number;
  @IsOptional() weight?: number | string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() locked?: boolean;
  @IsOptional() hidden?: boolean;
}

class AnalyzeDto {
  @IsArray() @ArrayMaxSize(400) @ValidateNested({ each: true }) @Type(() => LayerIn) layers!: LayerIn[];
  @IsNumber() w!: number;
  @IsNumber() h!: number;
  /** Small render of the slide (JPEG/PNG data URL), lets Claude see the layout */
  @IsOptional() @IsString() @Matches(/^data:image\/(png|jpeg|webp);base64,/) @MaxLength(6_000_000) image?: string;
  @IsOptional() @IsIn(["auto", "heuristic"]) engine?: "auto" | "heuristic";
}

class ImportDto {
  @IsString() @Matches(/^data:image\/(png|jpeg|webp);base64,/) @MaxLength(8_000_000) image!: string;
  @IsNumber() imgW!: number;
  @IsNumber() imgH!: number;
}

/** Live economic calendar for the studio: events from TradingView / Forex Factory, and slide analysis. */
@Controller("social/calendar")
export class CalendarController {
  constructor(private svc: CalendarService) {}

  /** ?date=YYYY-MM-DD&tz=Africa/Tunis&countries=US,EU&source=tradingview|forexfactory */
  @Get("events")
  events(@Query("date") date: string, @Query("tz") tz?: string, @Query("countries") countries?: string, @Query("source") source?: string) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : new Date().toISOString().slice(0, 10);
    return this.svc.events({ date: d, tz, countries, source });
  }

  /** A screenshot or exported design (PNG/JPEG) → editable layers */
  @Roles("admin", "editor") @Post("import") @HttpCode(200)
  importImage(@Body() dto: ImportDto) {
    return this.svc.importImage(dto);
  }

  @Roles("admin", "editor") @Post("analyze") @HttpCode(200)
  analyze(@Body() dto: AnalyzeDto) {
    return this.svc.analyze(dto);
  }
}
