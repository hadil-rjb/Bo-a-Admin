import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // articles + social designs embed images as data URLs
  app.useBodyParser("json", { limit: process.env.BODY_LIMIT || "50mb" });
  app.setGlobalPrefix("api");
  
app.enableCors({
  origin: [
    "https://boga-workspace.vercel.app",
    "http://localhost:3000",
  ],
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT || 4000);
}
bootstrap();
