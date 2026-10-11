import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Article, ArticleSchema } from "../articles/article.schema";
import { GscModule } from "../gsc/gsc.module";
import { AiSettings, AiSettingsSchema } from "./ai-settings.schema";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { CoverImageService } from "./cover-image.service";
import { Idea, IdeaSchema } from "./idea.schema";

@Module({
  imports: [GscModule, MongooseModule.forFeature([{ name: AiSettings.name, schema: AiSettingsSchema }, { name: Idea.name, schema: IdeaSchema }, { name: Article.name, schema: ArticleSchema }])],
  controllers: [AiController],
  providers: [AiService, CoverImageService],
})
export class AiModule {}
