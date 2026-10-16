import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const MODEL = /^[\w.\-:\/]+$/;
export class UpdateAiSettingsDto {
  @IsOptional() @IsIn(["anthropic", "groq"]) provider?: "anthropic" | "groq";
  @IsOptional() @IsString() @MaxLength(120) @Matches(MODEL) anthropicModel?: string;
  @IsOptional() @IsString() @MaxLength(120) @Matches(MODEL) groqModel?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(400) anthropicKey?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(400) groqKey?: string;
  @IsOptional() @IsArray() @IsIn(["anthropic", "groq", "hf"], { each: true }) clearKeys?: ("anthropic" | "groq" | "hf")[];
  @IsOptional() @IsString() @MinLength(10) @MaxLength(400) hfKey?: string;
  @IsOptional() @IsString() @MaxLength(120) @Matches(/^[\w.-]+\/[\w.-]+$/) hfModel?: string;
  @IsOptional() @IsString() @MaxLength(600) imageKeywords?: string;
  @IsOptional() @IsString() @MaxLength(400) imageNegative?: string;
  @IsOptional() @IsString() @MaxLength(2000) brief?: string;
  @IsOptional() @IsString() @MaxLength(40) language?: string;
  @IsOptional() @IsString() @MaxLength(2500) coverStyle?: string;
}
export class CoverPromptDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(80) cat?: string;
  @IsOptional() @IsString() @MaxLength(400) meta?: string;
  @IsOptional() @IsString() @MaxLength(400) sub?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) t?: string[];
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
}
export class GenerateIdeasDto {
  @IsOptional() @IsInt() @Min(1) @Max(10) count?: number;
  @IsOptional() @IsString() @MaxLength(200) focus?: string;
}
export class GenerateArticleDto {
  @IsOptional() @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: "date au format YYYY-MM-DD" }) date?: string;
}
export class CoverImageDto {
  @IsString() @MinLength(20) @MaxLength(3000) prompt: string;
  @IsOptional() @Matches(/^\d{1,2}:\d{1,2}$/) ratio?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) seed?: number;
}
