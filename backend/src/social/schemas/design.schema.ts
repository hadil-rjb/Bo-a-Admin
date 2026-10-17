import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

/** A social design (single post or carousel). `pages[].layers` hold the canvas content. */
@Schema({ collection: "social_designs", strict: false, minimize: false, timestamps: true, versionKey: false })
export class SocialDesign {
  @Prop({ required: true, index: true }) brandId!: string;
  /** Client id (e.g. "d1") */
  @Prop({ required: true }) id!: string;
  /** Position in the brand's library (0 = newest) */
  @Prop({ required: true }) order!: number;
  /** Content hash, lets a full replace skip unchanged designs */
  @Prop() hash?: string;

  @Prop() name?: string;
  @Prop() tpl?: string;
  @Prop() ratio?: string;
  @Prop() status?: string;
  @Prop() source?: string;
  @Prop() upd?: string;
  @Prop() slides?: number;
  @Prop({ type: MongooseSchema.Types.Mixed }) figma?: Record<string, unknown>;
  /** [{ id, bg, layers }]. Left unset, the studio builds the pages from `tpl`. */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: undefined }) pages?: Record<string, unknown>[];
}
export type SocialDesignDocument = HydratedDocument<SocialDesign>;
export const SocialDesignSchema = SchemaFactory.createForClass(SocialDesign);
SocialDesignSchema.index({ brandId: 1, id: 1 }, { unique: true });
