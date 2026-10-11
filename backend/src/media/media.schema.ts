import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/** Couvertures générées puis acceptées : hébergées par l'API (URL stable) plutôt qu'embarquées en base64 dans chaque article */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Media {
  @Prop({ required: true, select: false }) data: Buffer;
  @Prop({ default: "image/webp" }) mime: string;
  @Prop() size: number;
  @Prop() width: number;
  @Prop() height: number;
  @Prop({ default: "" }) model: string;
  @Prop() createdBy?: string;
}
export type MediaDocument = HydratedDocument<Media>;
export const MediaSchema = SchemaFactory.createForClass(Media);
