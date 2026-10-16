import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateFramerSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(300) projectUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) apiKey?: string;
  @IsOptional() @IsBoolean() clearKey?: boolean;
  @IsOptional() @IsString() @MaxLength(100) collectionId?: string;
  @IsOptional() @IsObject() fieldMap?: Record<string, string>;
  @IsOptional() @IsBoolean() publish?: boolean;
  @IsOptional() @IsBoolean() deploy?: boolean;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
}
