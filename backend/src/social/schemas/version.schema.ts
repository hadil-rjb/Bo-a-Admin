import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

/** A saved version of a design: its pages as the API had them, named by a person or taken automatically. */
@Schema({ collection: "social_design_versions", strict: false, minimize: false, timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
export class SocialDesignVersion {
  @Prop({ required: true }) brandId!: string;
  @Prop({ required: true }) designId!: string;
  @Prop({ required: true }) name!: string;
  /** Taken automatically (when the design is opened): pruned past the newest ones; named versions are kept */
  @Prop({ default: false }) auto!: boolean;
  /** Content hash of the pages and canvas size: an automatic version is skipped when nothing changed */
  @Prop() hash?: string;
  /** The design's revision at the time */
  @Prop() rev?: number;
  @Prop() ratio?: string;
  @Prop({ type: [MongooseSchema.Types.Mixed], default: undefined }) pages?: Record<string, unknown>[];
  @Prop() createdBy?: string;
  @Prop() createdByName?: string;
  /** Size of the pages (JSON characters) and how many slides: shown in the list without loading the pages */
  @Prop() bytes?: number;
  @Prop() slides?: number;
}
export type SocialDesignVersionDocument = HydratedDocument<SocialDesignVersion>;
export const SocialDesignVersionSchema = SchemaFactory.createForClass(SocialDesignVersion);
SocialDesignVersionSchema.index({ brandId: 1, designId: 1, createdAt: -1 });
