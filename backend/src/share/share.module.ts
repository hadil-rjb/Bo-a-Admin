import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { User, UserSchema } from "../auth/user.schema";
import { Article, ArticleSchema } from "../articles/article.schema";
import { Activity, ActivitySchema } from "./activity.schema";
import { ShareSettings, ShareSettingsSchema } from "./share-settings.schema";
import { ActivityService } from "./activity.service";
import { ShareController } from "./share.controller";
import { ShareService } from "./share.service";

@Global()
@Module({
  imports: [MongooseModule.forFeature([
    { name: User.name, schema: UserSchema }, { name: Article.name, schema: ArticleSchema },
    { name: Activity.name, schema: ActivitySchema }, { name: ShareSettings.name, schema: ShareSettingsSchema },
  ])],
  controllers: [ShareController],
  providers: [ShareService, ActivityService],
  exports: [ShareService, ActivityService],
})
export class ShareModule {}
