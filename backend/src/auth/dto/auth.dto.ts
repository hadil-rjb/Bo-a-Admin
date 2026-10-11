import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}
// Mêmes règles que l'UI : 8+ caractères, majuscule, minuscule, chiffre
const PWD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @Matches(PWD, { message: "Le mot de passe doit contenir 8+ caractères, majuscule, minuscule et chiffre" })
  newPassword: string;
}
class NotificationsDto {
  @IsOptional() @IsBoolean() seo?: boolean;
  @IsOptional() @IsBoolean() editorial?: boolean;
  @IsOptional() @IsBoolean() gsc?: boolean;
}
export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(80) job?: string;
  @IsOptional() @IsString() @MaxLength(200) bio?: string;
  @IsOptional() @IsString() @MaxLength(2_000_000) avatar?: string;
  @IsOptional() @ValidateNested() @Type(() => NotificationsDto) notifications?: NotificationsDto;
}
