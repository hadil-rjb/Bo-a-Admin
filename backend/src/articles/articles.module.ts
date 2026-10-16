import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Article, ArticleSchema } from "./article.schema";
import { FramerSettings, FramerSettingsSchema } from "../framer/framer-settings.schema";
import { ArticlesController } from "./articles.controller";
import { ArticlesService } from "./articles.service";

@Module({
  imports: [MongooseModule.forFeature([
    { name: Article.name, schema: ArticleSchema },
    { name: FramerSettings.name, schema: FramerSettingsSchema },
  ])],
  controllers: [ArticlesController],
  providers: [ArticlesService],
})
export class ArticlesModule {}
