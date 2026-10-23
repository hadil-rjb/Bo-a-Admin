import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/**
 * Images hosted by the API (stable URL) rather than embedded as base64:
 * accepted covers (kind "cover", re-encoded to WebP) and studio design images (kind "asset", original bytes).
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Media {
  @Prop({ required: true, select: false }) data: Buffer;
  @Prop({ default: "image/webp" }) mime: string;
  @Prop() size: number;
  @Prop() width: number;
  @Prop() height: number;
  @Prop({ default: "" }) model: string;
  @Prop() createdBy?: string;
  @Prop({ default: "cover" }) kind?: string;
  /** SHA-256 of the bytes: the same studio image is stored once */
  @Prop({ index: true, sparse: true }) sha?: string;
}
export type MediaDocument = HydratedDocument<Media>;
export const MediaSchema = SchemaFactory.createForClass(Media);
