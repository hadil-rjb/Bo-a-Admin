import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/**
 * A comment on a design. A thread starts with a pinned comment: a slide, a point (x, y), and the layer under it with the
 * point's offset from that layer (lx, ly), so the pin follows the layer and falls back to the point once it's gone.
 * Replies name their thread in `parentId`.
 */
@Schema({ collection: "social_design_comments", timestamps: true, versionKey: false })
export class SocialDesignComment {
  @Prop({ required: true }) brandId!: string;
  @Prop({ required: true }) designId!: string;
  @Prop() parentId?: string;
  /** Pinned comments: the slide (page id), the point, and the layer under it */
  @Prop() pageId?: string;
  @Prop() layerId?: string;
  @Prop() x?: number;
  @Prop() y?: number;
  @Prop() lx?: number;
  @Prop() ly?: number;
  @Prop({ required: true }) text!: string;
  @Prop() authorId?: string;
  @Prop() authorName?: string;
  @Prop({ default: false }) resolved!: boolean;
  @Prop() resolvedByName?: string;
  @Prop() edited?: boolean;
}
export type SocialDesignCommentDocument = HydratedDocument<SocialDesignComment>;
export const SocialDesignCommentSchema = SchemaFactory.createForClass(SocialDesignComment);
SocialDesignCommentSchema.index({ brandId: 1, designId: 1, createdAt: 1 });
