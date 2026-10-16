import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class InviteDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsEmail() email: string;
  @IsIn(["editor", "viewer"]) role: "editor" | "viewer";
}
export class RoleDto { @IsIn(["editor", "viewer"]) role: "editor" | "viewer"; }
export class LinkDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() regenerate?: boolean;
}
export class PingDto { @IsOptional() @IsString() @MaxLength(40) viewerId?: string; }
