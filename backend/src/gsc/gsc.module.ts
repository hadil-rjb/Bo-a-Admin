import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { GscController } from "./gsc.controller";
import { GscConnection, GscConnectionSchema } from "./gsc.schema";
import { GscService } from "./gsc.service";
@Module({
  imports: [MongooseModule.forFeature([{ name: GscConnection.name, schema: GscConnectionSchema }])],
  controllers: [GscController], providers: [GscService], exports: [GscService],
})
export class GscModule {}
