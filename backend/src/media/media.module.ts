import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { MediaController } from "./media.controller";
import { Media, MediaSchema } from "./media.schema";

@Module({ imports: [MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }])], controllers: [MediaController] })
export class MediaModule {}
