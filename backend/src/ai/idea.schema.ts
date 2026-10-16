import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

@Schema({ timestamps: true })
export class Idea {
  @Prop({ required: true }) title: string;
  @Prop({ default: "" }) angle: string;
  @Prop({ default: "" }) cat: string;
  @Prop({ default: "" }) keyword: string;
  @Prop({ default: "informational" }) intent: string;
  @Prop({ default: "" }) rationale: string;   // signal de données qui justifie l'idée
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ type: [String], default: [] }) outline: string[];  // structure suggérée (H2)
  @Prop({ default: "guide" }) format: string;
  @Prop({ default: 50 }) priority: number;
  @Prop({ default: "new", index: true }) status: "new" | "used" | "dismissed";
  @Prop({ default: "" }) articleSlug: string;
  @Prop({ default: "" }) model: string;
}
export type IdeaDocument = HydratedDocument<Idea>;
export const IdeaSchema = SchemaFactory.createForClass(Idea);
