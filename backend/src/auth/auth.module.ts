import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { User, UserSchema } from "./user.schema";

const strongSecret = (s: string) => { if (s.length < 16 || s.startsWith("change-me")) throw new Error("JWT_SECRET doit faire 16+ caractères (générez-en un : openssl rand -hex 32)"); return s; };

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({ secret: strongSecret(c.getOrThrow<string>("JWT_SECRET")), signOptions: { expiresIn: c.get("JWT_EXPIRES_IN") ?? "7d" } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
