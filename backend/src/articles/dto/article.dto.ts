import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { PartialType } from "@nestjs/mapped-types";
import { STATUSES, Status } from "../article.schema";

export class CreateArticleDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "slug invalide (a-z, 0-9, tirets)" }) slug?: string;
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(3_000_000) img?: string;
  @IsOptional() @IsString() @MaxLength(300) alt?: string;
  @IsOptional() @IsString() @MaxLength(3000) coverPrompt?: string;
  @IsOptional() @IsString() @MaxLength(400) meta?: string;
  @IsOptional() @IsString() @MaxLength(400) sub?: string;
  @IsOptional() @IsString() @MaxLength(80) cat?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(3) @IsString({ each: true }) t?: string[];
  @IsOptional() @IsString() html?: string;
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: "date au format YYYY-MM-DD" }) date?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "heure au format HH:mm" }) time?: string;
  @IsOptional() @IsIn(STATUSES) status?: Status;
}
export class UpdateArticleDto extends PartialType(CreateArticleDto) {}
export class ListArticlesQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(STATUSES) status?: Status;
  @IsOptional() @IsString() cat?: string;
  @IsOptional() @IsString() full?: string; // "1" = inclut le contenu HTML
}
