import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema({ timestamps: true })
export class ShareSettings {
  @Prop({ default: false }) linkEnabled: boolean;
  @Prop({ required: true }) linkToken: string;
}
export type ShareSettingsDocument = HydratedDocument<ShareSettings>;
export const ShareSettingsSchema = SchemaFactory.createForClass(ShareSettings);
