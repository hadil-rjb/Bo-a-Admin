import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Schema as MongooseSchema } from "mongoose";

/**
 * Social workspace brand: brand kit + per-brand content (platforms, ideas, articles).
 * Unknown keys are kept (strict: false) so the studio can add fields without a migration.
 */
@Schema({ collection: "social_brands", strict: false, minimize: false, timestamps: true, versionKey: false, id: false })
export class SocialBrand {
  @Prop({ type: String, required: true }) _id!: string;
  @Prop({ required: true, index: true }) order!: number;
  @Prop({ required: true }) name!: string;

  @Prop() initials?: string;
  @Prop() handle?: string;
  @Prop() website?: string;
  @Prop() industry?: string;
  @Prop() tagline?: string;
  @Prop() about?: string;
  @Prop() audience?: string;
  @Prop() voice?: string;
  @Prop() dos?: string;
  @Prop() donts?: string;
  @Prop() hashtags?: string;
  @Prop() cta?: string;
  @Prop() lang?: string;
  @Prop() defaultRatio?: string;
  /** Shows the Blog Admin's articles in this brand's "From your blog" panel */
  @Prop() linkBlog?: boolean;

  /** [{ id, name, hex }] */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) colors!: Record<string, unknown>[];
  /** { heading, body, arabic } */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) fonts!: Record<string, string>;
  /** [{ id, name, kind, src? (data URL), text? }] */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) logos!: Record<string, unknown>[];
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) assets!: Record<string, unknown>[];
  /** Brand templates: [{ id, name, ratio, bg?, layers }] */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) templates!: Record<string, unknown>[];

  /** Connected social accounts: { ig: 1, li: 0, ... } */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) platforms!: Record<string, number>;
  /** Post ideas: [{ t, cat, p, tpl }] */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) ideas!: Record<string, unknown>[];
  /** Articles ready to become posts: [{ t, c }] */
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) articles!: Record<string, unknown>[];
  /** Any other per-brand data the studio stores next to designs/posts */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) extraData!: Record<string, unknown>;
}
export type SocialBrandDocument = HydratedDocument<SocialBrand>;
export const SocialBrandSchema = SchemaFactory.createForClass(SocialBrand);
