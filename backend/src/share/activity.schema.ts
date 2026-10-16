import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema({ _id: false })
class Change {
  @Prop() f: string;
  @Prop() from: string;
  @Prop() to: string;
}

/** Journal : modifications d'articles, changements de partage et ouvertures de l'admin */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Activity {
  @Prop({ required: true, index: true }) kind: "article" | "share" | "open";
  @Prop({ required: true }) action: string;
  @Prop() actorId?: string;
  @Prop({ required: true }) actorName: string;
  @Prop({ default: "" }) target: string;
  @Prop({ default: "" }) slug: string;
  @Prop({ type: [SchemaFactory.createForClass(Change)], default: [] }) changes: Change[];
  @Prop({ type: Object, select: false }) before?: Record<string, unknown>; // valeurs précédentes (restauration)
  @Prop({ default: false }) restorable: boolean;
  @Prop() restoredAt?: Date;
  createdAt: Date;
}
export type ActivityDocument = HydratedDocument<Activity>;
export const ActivitySchema = SchemaFactory.createForClass(Activity);
ActivitySchema.index({ createdAt: -1 });
ActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 86400 }); // 180 jours
