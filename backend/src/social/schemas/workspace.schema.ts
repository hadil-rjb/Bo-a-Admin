import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

export const WORKSPACE_ID = "default";

/** Social workspace state: active brand and the Social Media Settings page values. */
@Schema({ collection: "social_workspaces", minimize: false, timestamps: true, versionKey: false })
export class SocialWorkspace {
  @Prop({ type: String, default: WORKSPACE_ID }) _id!: string;
  @Prop({ required: true }) active!: string;
  /** { sec, figUrl, sync, fonts, provider, claudeModel, groqModel, fmt, quality, exLang, tz, safe, auto, … } */
  @Prop({ type: MongooseSchema.Types.Mixed }) set?: Record<string, unknown>;
}
export type SocialWorkspaceDocument = HydratedDocument<SocialWorkspace>;
export const SocialWorkspaceSchema = SchemaFactory.createForClass(SocialWorkspace);
