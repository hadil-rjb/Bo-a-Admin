import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Article, ArticleSchema } from "../articles/article.schema";
import { FramerSettings, FramerSettingsSchema } from "./framer-settings.schema";
import { FramerController } from "./framer.controller";
import { FramerScheduler } from "./framer.scheduler";
import { FramerService } from "./framer.service";

@Module({
  imports: [MongooseModule.forFeature([{ name: FramerSettings.name, schema: FramerSettingsSchema }, { name: Article.name, schema: ArticleSchema }])],
  controllers: [FramerController],
  providers: [FramerService, FramerScheduler],
})
export class FramerModule {}
